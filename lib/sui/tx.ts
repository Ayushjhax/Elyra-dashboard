import "server-only";

import { createHash, createHmac } from "node:crypto";
import { blake2b } from "@noble/hashes/blake2.js";
import { messageWithIntent, toSerializedSignature } from "@mysten/sui/cryptography";
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { fromBase64, fromHex, toBase64, toHex } from "@mysten/sui/utils";
import { verifyTransactionSignature } from "@mysten/sui/verify";
import { safeEqual } from "@/lib/crypto/credentials";
import { decodeKey, required } from "@/lib/env";
import { normalizeCoinType, SUI_COIN_TYPE } from "@/lib/sui/chain";
import { suiClient } from "@/lib/sui/client";
import { suiPublicKeyFor } from "@/lib/sui/keys";
import type { SuiTxPurpose, SuiTxRequest } from "@/lib/sui/wire";

/* ---------------------------------------------------------------------------
   One Sui transaction: built and simulated here, its hash signed in the
   person's Privy wallet, the signature checked here and the transaction
   executed here.

     BUILD     the SDK builds `TransactionData` for the session's own Sui
               address (gas selected from its coins), and the bytes are
               simulated before anyone is asked to sign: a send or swap the
               chain would reject fails here.
     SEAL      an HMAC over the sender, purpose, time and a hash of the
               exact bytes, so a client cannot hand back a transaction this
               server did not build.
     SIGN      the server sends the 32-byte hash Sui verifies —
               Blake2b-256(intent || bytes) — and Privy's embedded Sui
               wallet signs it (`useSignRawHash`). The key never leaves it.
     CHECK     the public key must derive to the session's address, the
               signature must verify over the sealed bytes, and only then is
               the transaction executed — finality on Sui is sub-second, so
               the answer comes back in the same request.
--------------------------------------------------------------------------- */

export const SUI_BUILD_TTL_MS = 10 * 60_000;

export type { SuiTxPurpose, SuiTxRequest };

export function suiSigningHash(bytes: Uint8Array): `0x${string}` {
  return `0x${toHex(blake2b(messageWithIntent("TransactionData", bytes), { dkLen: 32 }))}`;
}

function sealKey(): Buffer {
  const base = decodeKey(required("CREDENTIALS_ENC_KEY"));
  if (base === null) throw new Error("CREDENTIALS_ENC_KEY is not a usable key.");
  return createHash("sha256").update("elyra:sui-tx-seal:v1").update(base).digest();
}

export function sealSuiWith(key: Buffer, tx: SuiTxRequest): string {
  const bytesHash = createHash("sha256").update(Buffer.from(tx.bytes, "base64")).digest("hex");
  return createHmac("sha256", key)
    .update(JSON.stringify(["elyra:sui-tx:v1", tx.sender.toLowerCase(), tx.purpose, tx.builtAt, bytesHash]))
    .digest("hex");
}

export function sealSuiTx(tx: SuiTxRequest): string {
  return sealSuiWith(sealKey(), tx);
}

export function parseSuiTxRequest(value: unknown): SuiTxRequest | null {
  if (value === null || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.bytes !== "string" || raw.bytes.length === 0 || raw.bytes.length > 200_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.bytes)) return null;
  if (typeof raw.sender !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(raw.sender)) return null;
  if (raw.purpose !== "transfer" && raw.purpose !== "swap") return null;
  if (typeof raw.builtAt !== "number" || !Number.isSafeInteger(raw.builtAt)) return null;
  return { bytes: raw.bytes, sender: raw.sender, purpose: raw.purpose, builtAt: raw.builtAt };
}

export function firstLine(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message.split("\n")[0].slice(0, 240) : fallback;
}

/* ---------------------------------------------------------------------------
   Building and simulating
--------------------------------------------------------------------------- */

export interface SuiSimulation {
  success: boolean;
  error: string | null;
  changes: { owner: string | null; coinType: string; amount: string }[];
  /** MIST. The most the transaction's gas can cost. */
  gasBudget: bigint;
  sender: string | null;
}

export async function simulateSui(bytes: Uint8Array): Promise<SuiSimulation> {
  const data = Transaction.from(bytes).getData() as { sender?: string | null; gasData?: { budget?: string | number | null } };
  const result = (await suiClient().simulateTransaction({ transaction: bytes, include: { balanceChanges: true, effects: true } } as never)) as {
    $kind: string;
    Transaction?: { status?: { success?: boolean; error?: unknown }; balanceChanges?: { coinType: string; address: string | null; amount: string }[] };
    FailedTransaction?: { status?: { success?: boolean; error?: unknown }; balanceChanges?: { coinType: string; address: string | null; amount: string }[] };
  };
  const body = result.Transaction ?? result.FailedTransaction;
  const errorInfo = body?.status?.error as { message?: string } | string | null | undefined;
  return {
    success: body?.status?.success === true,
    error: errorInfo === null || errorInfo === undefined ? null : typeof errorInfo === "string" ? errorInfo : (errorInfo.message ?? "the simulation failed"),
    changes: (body?.balanceChanges ?? []).map((change) => ({ owner: change.address, coinType: normalizeCoinType(change.coinType), amount: change.amount })),
    gasBudget: BigInt(data.gasData?.budget ?? 0),
    sender: data.sender ?? null,
  };
}

/**
 * A send from the session's Sui wallet. `max` with SUI sends the gas coin
 * itself, which leaves exactly the fee behind; for any other coin it sends
 * the whole balance.
 */
export async function buildSuiTransfer(input: {
  sender: string;
  recipient: string;
  coinType: string;
  amount: bigint;
  max: boolean;
}): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.setSender(input.sender);
  const type = normalizeCoinType(input.coinType);
  if (type === SUI_COIN_TYPE) {
    if (input.max) {
      tx.transferObjects([tx.gas], input.recipient);
    } else {
      const [coin] = tx.splitCoins(tx.gas, [input.amount]);
      tx.transferObjects([coin], input.recipient);
    }
  } else {
    tx.transferObjects([coinWithBalance({ type, balance: input.amount })], input.recipient);
  }
  return tx.build({ client: suiClient() });
}

/* ---------------------------------------------------------------------------
   Checking and executing
--------------------------------------------------------------------------- */

export type SuiExecuted = { ok: true; digest: string } | { ok: false; error: string; digest?: string };

export async function verifyAndExecuteSui(input: {
  tx: SuiTxRequest;
  seal: string;
  /** Hex: the bare 64-byte Ed25519 signature Privy returned. */
  signature: string;
  /** Privy's record of the key, and the client's, tried in that order. */
  publicKeys: (string | null | undefined)[];
  sessionAddress: string | null;
  now: number;
  key?: Buffer;
}): Promise<SuiExecuted> {
  const { tx } = input;
  const key = input.key ?? sealKey();
  if (!/^[0-9a-f]{64}$/.test(input.seal) || !safeEqual(sealSuiWith(key, tx), input.seal)) {
    return { ok: false, error: "This transaction was not built by Elyra, so it was not sent." };
  }
  if (input.now - tx.builtAt > SUI_BUILD_TTL_MS || tx.builtAt > input.now + 60_000) {
    return { ok: false, error: "This transaction was built too long ago. Start again for a fresh one." };
  }
  if (input.sessionAddress === null || input.sessionAddress.toLowerCase() !== tx.sender.toLowerCase()) {
    return { ok: false, error: "This transaction was built for a different Sui wallet than the one signed in." };
  }

  const signatureHex = input.signature.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{128}$/.test(signatureHex)) return { ok: false, error: "The wallet returned something that is not a signature." };

  const publicKey = input.publicKeys.map((raw) => suiPublicKeyFor(raw, tx.sender)).find((found) => found !== null) ?? null;
  if (publicKey === null) {
    return { ok: false, error: "The Sui wallet's public key could not be confirmed for this address, so nothing was sent." };
  }

  const bytes = fromBase64(tx.bytes);
  const serialized = toSerializedSignature({ signature: fromHex(signatureHex), signatureScheme: "ED25519", publicKey });
  try {
    await verifyTransactionSignature(bytes, serialized, { address: tx.sender });
  } catch {
    return { ok: false, error: "The signature does not match this transaction and wallet, so it was not sent." };
  }

  try {
    const result = (await suiClient().executeTransaction({ transaction: bytes, signatures: [serialized], include: { effects: true } } as never)) as {
      $kind: string;
      Transaction?: { digest: string; status?: { success?: boolean } };
      FailedTransaction?: { digest: string; status?: { success?: boolean; error?: { message?: string } | null } };
    };
    if (result.Transaction !== undefined && result.Transaction.status?.success !== false) {
      return { ok: true, digest: result.Transaction.digest };
    }
    const failed = result.FailedTransaction;
    return {
      ok: false,
      digest: failed?.digest,
      error: `The transaction was included but failed on-chain${failed?.status?.error?.message ? `: ${failed.status.error.message.slice(0, 160)}` : ""}. Only the network fee was spent.`,
    };
  } catch (error: unknown) {
    return { ok: false, error: firstLine(error, "Sui did not accept the transaction.") };
  }
}

export { toBase64 };
