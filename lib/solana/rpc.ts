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
        "Set it to a Helius, QuickNode or Triton endpoint.",
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

export interface ParsedTokenAccount {
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
 * `maxRetries: 0` because this app decides whether to resend, not the node:
 * a retry is a second attempt at moving someone's money.
 */
export function sendTransaction(base64Transaction: string): Promise<string> {
  return rpcCall<string>("sendTransaction", [
    base64Transaction,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 0 },
  ]);
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
