import "server-only";

import { createHmac, createHash } from "node:crypto";
import {
  getAddress,
  keccak256,
  parseSignature,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
  type Hex,
  type TransactionSerializableEIP1559,
} from "viem";
import { decodeKey, required } from "@/lib/env";
import { EVM_CHAINS, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import { evmClient } from "@/lib/evm/rpc";
import { safeEqual } from "@/lib/crypto/credentials";
import type { EvmTxPurpose, EvmTxRequest } from "@/lib/evm/wire";

/* ---------------------------------------------------------------------------
   One EVM transaction: built here, signed in the person's wallet, checked
   here, broadcast here.

   The same contract the Solana paths keep — the server builds every
   transaction for the session's own address, the wallet signs, the server
   submits and confirms — with one thing Solana's bytes-in, bytes-out
   forwarding does not need: the signed transaction is DECODED and held to
   what was built before it is sent.

     BUILD    `prepareTx` fixes every field — chain, nonce, gas, fees, to,
              value, data — so the wallet has nothing to fill in, and
              `sealTx` signs that exact request with a server key. The seal
              is what pairs a signature with the build that produced it, the
              way Jupiter's requestId pairs a swap with its quote: a client
              cannot hand back a request the server did not make.
     SIGN     Privy's embedded wallet signs it in the browser
              (`useSignTransaction`) and returns the serialized transaction.
              The key never leaves the wallet.
     CHECK    `verifySigned` refuses unless the seal is this server's and
              fresh, the recovered signer is the session's own address, and
              destination, value, calldata, chain and nonce are exactly what
              was built. Gas and fee caps may only differ within bounds.
     SUBMIT   `broadcast`, then `receiptStatus` until it lands — a broadcast
              is never reported as success on its own.

   Nothing here can spend: without the person's signature a built request is
   inert, and the checks only ever refuse.
--------------------------------------------------------------------------- */

/** A built request is good for this long — a swap quote goes stale well before. */
export const BUILD_TTL_MS = 10 * 60_000;

/** Headroom on the node's gas estimate; unused gas is not charged. */
const GAS_HEADROOM = { numerator: BigInt(12), denominator: BigInt(10) };

/** How far a signed fee cap may exceed the built one before it is refused. */
const FEE_TOLERANCE = BigInt(2);

export type { EvmTxPurpose, EvmTxRequest } from "@/lib/evm/wire";

/** The request as viem serializes it. */
export function toSerializable(tx: EvmTxRequest): TransactionSerializableEIP1559 {
  return {
    type: "eip1559",
    chainId: tx.chainId,
    to: getAddress(tx.to),
    value: BigInt(tx.value),
    data: tx.data,
    nonce: tx.nonce,
    gas: BigInt(tx.gas),
    maxFeePerGas: BigInt(tx.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas),
  };
}

/** The most this transaction can cost in fees, in wei. */
export function maxFeeWei(tx: Pick<EvmTxRequest, "gas" | "maxFeePerGas">): bigint {
  return BigInt(tx.gas) * BigInt(tx.maxFeePerGas);
}

/* ---------------------------------------------------------------------------
   Sealing
--------------------------------------------------------------------------- */

/** The request's fields in a fixed order, so a seal never depends on key order. */
function canonical(tx: EvmTxRequest): string {
  return JSON.stringify([
    "elyra:evm-tx:v1",
    tx.chain,
    tx.chainId,
    tx.from.toLowerCase(),
    tx.to.toLowerCase(),
    tx.value,
    tx.data.toLowerCase(),
    tx.nonce,
    tx.gas,
    tx.maxFeePerGas,
    tx.maxPriorityFeePerGas,
    tx.purpose,
    tx.builtAt,
  ]);
}

/**
 * The seal key: derived from CREDENTIALS_ENC_KEY with a purpose label, so the
 * key that encrypts exchange credentials is never used directly for anything
 * else, and a seal cannot be confused with any other MAC this app makes.
 */
function sealKey(): Buffer {
  const base = decodeKey(required("CREDENTIALS_ENC_KEY"));
  if (base === null) throw new Error("CREDENTIALS_ENC_KEY is not a usable key.");
  return createHash("sha256").update("elyra:evm-tx-seal:v1").update(base).digest();
}

export function sealWith(key: Buffer, tx: EvmTxRequest): string {
  return createHmac("sha256", key).update(canonical(tx)).digest("hex");
}

export function sealTx(tx: EvmTxRequest): string {
  return sealWith(sealKey(), tx);
}

/** A request as it arrives back from a client: shape-checked before anything trusts it. */
export function parseTxRequest(value: unknown): EvmTxRequest | null {
  if (value === null || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const decimal = (field: unknown): field is string => typeof field === "string" && /^\d{1,78}$/.test(field);
  if (raw.chain !== "ethereum" && raw.chain !== "robinhood") return null;
  if (raw.chainId !== EVM_CHAINS[raw.chain].id) return null;
  if (!isEvmAddress(raw.from) || !isEvmAddress(raw.to)) return null;
  if (!decimal(raw.value) || !decimal(raw.gas) || !decimal(raw.maxFeePerGas) || !decimal(raw.maxPriorityFeePerGas)) return null;
  if (typeof raw.data !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(raw.data) || raw.data.length > 40_000) return null;
  if (typeof raw.nonce !== "number" || !Number.isSafeInteger(raw.nonce) || raw.nonce < 0) return null;
  if (raw.purpose !== "transfer" && raw.purpose !== "approve" && raw.purpose !== "swap") return null;
  if (typeof raw.builtAt !== "number" || !Number.isSafeInteger(raw.builtAt)) return null;
  return {
    chain: raw.chain,
    chainId: raw.chainId,
    from: raw.from,
    to: raw.to,
    value: raw.value,
    data: raw.data as Hex,
    nonce: raw.nonce,
    gas: raw.gas,
    maxFeePerGas: raw.maxFeePerGas,
    maxPriorityFeePerGas: raw.maxPriorityFeePerGas,
    purpose: raw.purpose,
    builtAt: raw.builtAt,
  };
}

/* ---------------------------------------------------------------------------
   Checking what came back signed
--------------------------------------------------------------------------- */

export type Verified = { ok: true; serialized: Hex; hash: Hex } | { ok: false; error: string };

/**
 * Holds a signed transaction to the request this server built.
 *
 * `signed` may be the serialized transaction — what Privy's embedded wallet
 * returns — or a bare 65-byte signature over the built request, which is
 * serialized here. Either way the result is decoded and compared, so what is
 * broadcast is provably the transaction that was built and sealed.
 */
export async function verifySigned(input: {
  tx: EvmTxRequest;
  seal: string;
  signed: string;
  /** The session's EVM address — the only key whose signature is accepted. */
  sessionAddress: string | null;
  now: number;
  key?: Buffer;
}): Promise<Verified> {
  const { tx } = input;
  const key = input.key ?? sealKey();

  if (!/^[0-9a-f]{64}$/.test(input.seal) || !safeEqual(sealWith(key, tx), input.seal)) {
    return { ok: false, error: "This transaction was not built by Elyra, so it was not sent." };
  }
  if (input.now - tx.builtAt > BUILD_TTL_MS || tx.builtAt > input.now + 60_000) {
    return { ok: false, error: "This transaction was built too long ago. Start again for a fresh one." };
  }
  if (input.sessionAddress === null || input.sessionAddress.toLowerCase() !== tx.from.toLowerCase()) {
    return { ok: false, error: "This transaction was built for a different wallet than the one signed in." };
  }

  if (typeof input.signed !== "string" || !/^0x[0-9a-fA-F]+$/.test(input.signed) || input.signed.length > 80_000) {
    return { ok: false, error: "The wallet returned something that is not a signed transaction." };
  }

  let serialized: Hex;
  try {
    serialized =
      input.signed.length === 132
        ? serializeTransaction(toSerializable(tx), parseSignature(input.signed as Hex))
        : (input.signed as Hex);
  } catch {
    return { ok: false, error: "The wallet's signature could not be read." };
  }

  let parsed: ReturnType<typeof parseTransaction>;
  try {
    parsed = parseTransaction(serialized);
  } catch {
    return { ok: false, error: "The wallet returned a transaction that could not be decoded." };
  }

  const built = toSerializable(tx);
  const same = (a: string | undefined, b: string | undefined) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
  const sameData = (parsed.data ?? "0x").toLowerCase() === (built.data ?? "0x").toLowerCase();
  const changed: string[] = [];
  if (parsed.type !== "eip1559") changed.push("type");
  if (parsed.chainId !== built.chainId) changed.push("network");
  if (!same(parsed.to ?? undefined, built.to ?? undefined)) changed.push("destination");
  if ((parsed.value ?? BigInt(0)) !== built.value) changed.push("amount");
  if (!sameData) changed.push("instructions");
  if (parsed.nonce !== built.nonce) changed.push("nonce");
  const gas = parsed.gas ?? BigInt(0);
  const maxFee = "maxFeePerGas" in parsed ? (parsed.maxFeePerGas ?? BigInt(0)) : BigInt(0);
  const tip = "maxPriorityFeePerGas" in parsed ? (parsed.maxPriorityFeePerGas ?? BigInt(0)) : BigInt(0);
  if (gas <= BigInt(0) || gas > (built.gas ?? BigInt(0)) * FEE_TOLERANCE) changed.push("gas limit");
  if (maxFee <= BigInt(0) || maxFee > (built.maxFeePerGas ?? BigInt(0)) * FEE_TOLERANCE) changed.push("fee cap");
  if (tip > maxFee) changed.push("priority fee");
  if (changed.length > 0) {
    return {
      ok: false,
      error: `The signed transaction differs from the one Elyra built (${changed.join(", ")}), so it was not sent.`,
    };
  }

  let signer: string;
  try {
    signer = await recoverTransactionAddress({ serializedTransaction: serialized as Parameters<typeof recoverTransactionAddress>[0]["serializedTransaction"] });
  } catch {
    return { ok: false, error: "The signature on this transaction could not be verified." };
  }
  if (signer.toLowerCase() !== tx.from.toLowerCase()) {
    return { ok: false, error: "This transaction was signed by a different wallet, so it was not sent." };
  }

  return { ok: true, serialized, hash: keccak256(serialized) };
}

/* ---------------------------------------------------------------------------
   Building, sending, watching
--------------------------------------------------------------------------- */

/** The first line of a viem error — its message carries a multi-line request dump. */
export function firstLine(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    const short = (error as { shortMessage?: unknown }).shortMessage;
    const text = typeof short === "string" && short.length > 0 ? short : error.message;
    return text.split("\n")[0].slice(0, 240);
  }
  return fallback;
}

/**
 * Fixes every field of a transaction from the session's address.
 *
 * The gas estimate doubles as a simulation: a transfer the chain would
 * revert — more than the balance, a paused token — fails here, before
 * anyone is asked to sign it.
 */
export async function prepareTx(
  chain: EvmChainKey,
  call: { from: string; to: string; value: bigint; data: Hex; purpose: EvmTxPurpose },
  /**
   * Gas and fees already quoted — for a max ETH send, whose amount was sized
   * against exactly these, so a fresh estimate cannot push value plus fee
   * past the balance. The call is still simulated.
   */
  pricing?: FeeQuote,
): Promise<EvmTxRequest> {
  const client = evmClient(chain);
  const from = getAddress(call.from);
  const to = getAddress(call.to);

  const [nonce, fees, estimate] = await Promise.all([
    client.getTransactionCount({ address: from, blockTag: "pending" }),
    pricing === undefined ? client.estimateFeesPerGas() : Promise.resolve(pricing),
    client.estimateGas({ account: from, to, value: call.value, data: call.data }),
  ]);

  const estimated = (estimate * GAS_HEADROOM.numerator) / GAS_HEADROOM.denominator;
  const gas = pricing === undefined || pricing.gas < estimated ? estimated : pricing.gas;
  if (pricing !== undefined && gas !== pricing.gas) {
    throw new Error("The network fee rose while this was being prepared. Try again.");
  }
  const maxFeePerGas = fees.maxFeePerGas ?? BigInt(0);
  const maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? BigInt(0);
  if (maxFeePerGas <= BigInt(0)) throw new Error(`${EVM_CHAINS[chain].name} did not report a fee.`);

  return {
    chain,
    chainId: EVM_CHAINS[chain].id,
    from,
    to,
    value: call.value.toString(),
    data: call.data,
    nonce,
    gas: gas.toString(),
    maxFeePerGas: maxFeePerGas.toString(),
    maxPriorityFeePerGas: (maxPriorityFeePerGas > maxFeePerGas ? maxFeePerGas : maxPriorityFeePerGas).toString(),
    purpose: call.purpose,
    builtAt: Date.now(),
  };
}

export interface FeeQuote {
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/** The current fee caps and a gas estimate for a call — for sizing a send before building it. */
export async function feeQuote(
  chain: EvmChainKey,
  call: { from: string; to: string; value: bigint; data: Hex },
): Promise<FeeQuote> {
  const client = evmClient(chain);
  const [fees, estimate] = await Promise.all([
    client.estimateFeesPerGas(),
    client.estimateGas({ account: getAddress(call.from), to: getAddress(call.to), value: call.value, data: call.data }),
  ]);
  return {
    gas: (estimate * GAS_HEADROOM.numerator) / GAS_HEADROOM.denominator,
    maxFeePerGas: fees.maxFeePerGas ?? BigInt(0),
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? BigInt(0),
  };
}

export async function broadcast(chain: EvmChainKey, serialized: Hex): Promise<Hex> {
  return evmClient(chain).sendRawTransaction({ serializedTransaction: serialized });
}

export type TxOutcome =
  | { status: "confirmed"; hash: string; block: string }
  | { status: "failed"; hash: string; error: string; replaced?: boolean }
  | { status: "pending"; hash: string };

/**
 * Where a broadcast transaction stands.
 *
 * Unseen and its nonce since used means another transaction from this
 * wallet took its place — reported as such, not as pending forever.
 */
export async function receiptStatus(
  chain: EvmChainKey,
  hash: Hex,
  sender?: { from: string; nonce: number },
): Promise<TxOutcome> {
  const client = evmClient(chain);
  const receipt = await client.getTransactionReceipt({ hash }).catch(() => null);
  if (receipt !== null) {
    return receipt.status === "success"
      ? { status: "confirmed", hash, block: receipt.blockNumber.toString() }
      : { status: "failed", hash, error: "The transaction was included but reverted on-chain. Only the network fee was spent." };
  }
  if (sender !== undefined) {
    const mined = await client
      .getTransactionCount({ address: getAddress(sender.from), blockTag: "latest" })
      .catch(() => null);
    if (mined !== null && mined > sender.nonce) {
      const seen = await client.getTransaction({ hash }).catch(() => null);
      if (seen === null) {
        return {
          status: "failed",
          hash,
          replaced: true,
          error: "Another transaction from this wallet took this one's place, so this one will not land. Check the explorer before trying again.",
        };
      }
    }
  }
  return { status: "pending", hash };
}
