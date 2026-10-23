import "server-only";

import { optional } from "@/lib/env";
import { fetchJson, UpstreamError } from "@/lib/market/http";

/* ---------------------------------------------------------------------------
   The Solana RPC, from the server only.

   Reads, plus one write: `sendTransaction`, which broadcasts a transaction
   that is ALREADY SIGNED by the time it gets here. No signing happens in
   this file or anywhere else on the server — the signature comes from the
   operator's wallet in their browser, so nothing here can move funds on its
   own. This file is the only place in the app that talks to a Solana node,
   and it is server-only for one reason: an RPC URL in client code is an RPC
   URL anyone can drain the quota with.
   The browser reaches this through /api/wallet, the same shape as the Pyth
   key living behind /api/market/prices.

   Every request goes through `fetchJson`, which is this codebase's single
   path to an upstream API — so the deadline and the failure taxonomy are the
   same ones every exchange read already uses, rather than a second set
   invented here.

   There is deliberately no fallback to the public mainnet endpoint when
   SOLANA_RPC_URL is unset. A silent downgrade to an endpoint that 429s under
   any real load is worse than an error that says what is wrong: the caller
   would see intermittent empty balances and have nothing to point at. Absent
   config raises `RpcUnconfiguredError`, which the route reports as such.

   Which provider serves that URL is a deployment choice and is named
   nowhere in this codebase — only in the environment. Nothing here assumes
   a vendor's extensions: every method called is standard JSON-RPC.
--------------------------------------------------------------------------- */

/** SPL Token. The original, and what almost every balance still lives in. */
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/**
 * Token-2022.
 *
 * Queried alongside the original rather than instead of it. They are separate
 * programs with separate accounts, so asking only the first silently reports a
 * zero balance for anything issued under the second — which is a wrong number,
 * not a missing one, and wrong numbers are the thing to avoid.
 */
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export class RpcUnconfiguredError extends Error {
  constructor() {
    super(
      "SOLANA_RPC_URL is not set, so on-chain balances are unavailable. " +
        "Set it in the environment to a dedicated RPC endpoint.",
    );
    this.name = "RpcUnconfiguredError";
  }
}

export function rpcConfigured(): boolean {
  return optional("SOLANA_RPC_URL") !== undefined;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

/**
 * One RPC method call.
 *
 * Calls are issued individually and run in parallel at the call site rather
 * than as a JSON-RPC batch. Batching would be one round trip instead of three,
 * but batch support is not universal across providers and a batch response may
 * arrive in any order, so the saving costs correctness work at every call
 * site. Three parallel requests take the same wall-clock time and cost the
 * same in provider credits, which are billed per method.
 */
export async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const url = optional("SOLANA_RPC_URL");
  if (url === undefined) throw new RpcUnconfiguredError();

  let body: JsonRpcResponse<T>;
  try {
    body = await fetchJson<JsonRpcResponse<T>>({
      source: "solana-rpc",
      url,
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  } catch (error: unknown) {
    /* 429 is the one worth renaming: it is what an under-provisioned endpoint
       does under a polling dashboard, and saying so tells the operator to
       upgrade the plan rather than go looking for a bug. */
    if (error instanceof UpstreamError && error.kind === "rate_limited") {
      throw new UpstreamError(
        "rate_limited",
        "solana-rpc",
        "Rate limit reached. This endpoint cannot sustain the dashboard's poll rate.",
        error.status,
      );
    }
    throw error;
  }

  /* A JSON-RPC error arrives with HTTP 200, so `fetchJson` cannot see it. */
  if (body.error) {
    throw new UpstreamError(
      "client_error",
      "solana-rpc",
      `${method} failed (${body.error.code}): ${body.error.message}`,
    );
  }
  if (body.result === undefined) {
    throw new UpstreamError("malformed", "solana-rpc", `${method} returned no result`);
  }
  return body.result;
}

/* ---------------------------------------------------------------------------
   The three methods this app calls, and the shapes they return.

   Typed against the RPC's documented response rather than against a client
   library's model, because that is what actually arrives over the wire.
--------------------------------------------------------------------------- */

export interface RpcContext {
  context: { slot: number };
}

export type GetBalanceResult = RpcContext & { value: number };

/** Native SOL, in lamports. */
export function getBalance(address: string): Promise<GetBalanceResult> {
  return rpcCall<GetBalanceResult>("getBalance", [address, { commitment: "confirmed" }]);
}

/**
 * Lamports an account of `dataLength` bytes needs to be exempt from rent.
 *
 * Queried rather than hardcoded, unlike `SOL_DECIMALS`: this is a cluster
 * parameter the runtime could in principle change, not a fact fixed by the
 * protocol. It has been stable for years, but the whole reason to read it
 * live is that "stable so far" and "fixed forever" are not the same claim,
 * and the runtime enforces it hard enough — see `readSolHolding` — that a
 * stale constant would fail transactions rather than merely display a wrong
 * number. Unwrapped, unlike `getBalance`: this method returns a plain
 * lamport figure, not one behind `{context, value}`.
 */
export function getMinimumBalanceForRentExemption(dataLength: number): Promise<number> {
  return rpcCall<number>("getMinimumBalanceForRentExemption", [dataLength]);
}

export interface ParsedTokenAccount {
  /**
   * The token account's own address.
   *
   * Needed by anything that SPENDS rather than displays. One owner can hold
   * several accounts for the same mint, their balances sum for display, and
   * only the associated one is what a transfer is built against — so the
   * spending path has to be able to tell them apart. See lib/solana/holdings.ts.
   */
  pubkey: string;
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: {
            amount: string;
            decimals: number;
            /** Already scaled by `decimals`. Null when the node cannot scale it. */
            uiAmount: number | null;
            uiAmountString: string;
          };
        };
      };
    };
  };
}

export type GetTokenAccountsResult = RpcContext & { value: ParsedTokenAccount[] };

/** SPL balances under one token program. Ask for both programs, in parallel. */
export function getTokenAccountsByOwner(
  owner: string,
  programId: string,
): Promise<GetTokenAccountsResult> {
  return rpcCall<GetTokenAccountsResult>("getTokenAccountsByOwner", [
    owner,
    { programId },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  /** Unix seconds. Null while the block is too new to have one. */
  blockTime: number | null;
  /** Null when the transaction succeeded; an object of any shape when it failed. */
  err: unknown;
  /** "processed" | "confirmed" | "finalized", or null on older nodes. */
  confirmationStatus: string | null;
  memo: string | null;
}

export interface LatestBlockhash {
  blockhash: string;
  lastValidBlockHeight: number;
}

/**
 * The blockhash a new transaction is built against.
 *
 * Never cached. A blockhash is the transaction's expiry — it is valid for
 * roughly a minute — so a cached one builds a transaction that is already
 * partly spent, and the operator signs something that may expire between the
 * signature and the submission. `finalized` rather than `processed`: a
 * blockhash from a slot that gets dropped takes the transaction with it.
 */
export function getLatestBlockhash(): Promise<RpcContext & { value: LatestBlockhash }> {
  return rpcCall<RpcContext & { value: LatestBlockhash }>("getLatestBlockhash", [
    { commitment: "finalized" },
  ]);
}

/**
 * Broadcasts a transaction the operator signed.
 *
 * `skipPreflight: false` keeps the simulation, which is what turns "the
 * transaction failed on chain" into an error before any fee is paid.
 * `maxRetries: 0` because this app decides whether to resend, not the node —
 * see `resendTransaction` below, which is that decision actually being
 * made. Without it, a single dropped broadcast (a leader miss, ordinary
 * network congestion — not rare) landed nowhere, forever, while this route
 * had already told the operator it was sent.
 */
export function sendTransaction(base64Transaction: string): Promise<string> {
  return rpcCall<string>("sendTransaction", [
    base64Transaction,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 0 },
  ]);
}

/**
 * Re-broadcasts an ALREADY-SUBMITTED transaction, byte for byte.
 *
 * Solana de-duplicates by signature, so resending one that already landed is
 * a harmless no-op — not a second transfer. This is the retry `maxRetries: 0`
 * on the first `sendTransaction` call deliberately gives up on the node
 * doing automatically, done instead by `/api/transfer/submit` and
 * `/api/transfer/status` on a schedule this app controls.
 *
 * `skipPreflight: true`, unlike the first send: the transaction was already
 * simulated once, its validity does not change between resends of the exact
 * same bytes within the same blockhash, and re-simulating on every retry
 * would spend an RPC call re-checking something that has not changed.
 */
export function resendTransaction(base64Transaction: string): Promise<string> {
  return rpcCall<string>("sendTransaction", [
    base64Transaction,
    { encoding: "base64", skipPreflight: true, preflightCommitment: "confirmed", maxRetries: 0 },
  ]);
}

export interface SignatureStatusInfo {
  slot: number;
  confirmations: number | null;
  err: unknown;
  confirmationStatus: string | null;
}

/**
 * Whether an already-submitted signature has landed.
 *
 * `searchTransactionHistory: true` so a signature already aged out of the
 * node's short-lived default cache is still found — this app's confirmation
 * loop polls for up to the ~60-90s a blockhash stays valid, which can outlast
 * that cache under load.
 */
export function getSignatureStatuses(
  signatures: string[],
): Promise<RpcContext & { value: Array<SignatureStatusInfo | null> }> {
  return rpcCall<RpcContext & { value: Array<SignatureStatusInfo | null> }>(
    "getSignatureStatuses",
    [signatures, { searchTransactionHistory: true }],
  );
}

/**
 * The current block height, at `confirmed`.
 *
 * The other half of a blockhash's lifetime: a transaction is dead once this
 * passes its `lastValidBlockHeight`. Read at `confirmed` — the same level
 * `getSignatureStatuses` is answered at — so "the height has passed AND the
 * signature is not there" is one consistent view rather than two nodes'
 * worth of skew.
 */
export function getBlockHeight(): Promise<number> {
  return rpcCall<number>("getBlockHeight", [{ commitment: "confirmed" }]);
}

/**
 * The cluster's genesis hash.
 *
 * Constant for the life of a cluster, so it is read once per process and
 * kept. This is the only way to know whether the configured endpoint is
 * mainnet — see lib/solana/cluster.ts.
 */
let genesisHash: string | null = null;

export async function getGenesisHash(): Promise<string> {
  if (genesisHash !== null) return genesisHash;
  const hash = await rpcCall<string>("getGenesisHash", []);
  genesisHash = hash;
  return hash;
}

/** Test seam, and the way to pick up a changed SOLANA_RPC_URL without a restart. */
export function clearGenesisHash(): void {
  genesisHash = null;
}

export function getSignaturesForAddress(
  address: string,
  limit: number,
): Promise<SignatureInfo[]> {
  return rpcCall<SignatureInfo[]>("getSignaturesForAddress", [
    address,
    { limit, commitment: "confirmed" },
  ]);
}

/** What a landed transaction says about itself: whether it failed, and who signed it. */
export interface TransactionSummary {
  err: unknown;
  /** The accounts whose signatures the transaction carries, fee payer first. */
  signers: string[];
}

/**
 * A landed transaction's outcome and signers, or null when this node has not
 * seen it.
 *
 * Signers are the first `numRequiredSignatures` static account keys — the
 * wire format puts them there, for legacy and v0 messages alike, so this is
 * read without decoding instructions. `maxSupportedTransactionVersion: 0`
 * because a Jupiter swap is a v0 transaction, and without it the node
 * refuses to return one at all.
 */
export async function getTransactionSummary(signature: string): Promise<TransactionSummary | null> {
  const result = await rpcCall<{
    meta: { err: unknown } | null;
    transaction: { message: { accountKeys: string[]; header: { numRequiredSignatures: number } } };
  } | null>("getTransaction", [
    signature,
    { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
  ]);
  if (result === null) return null;
  const { accountKeys, header } = result.transaction.message;
  return { err: result.meta?.err ?? null, signers: accountKeys.slice(0, header.numRequiredSignatures) };
}
