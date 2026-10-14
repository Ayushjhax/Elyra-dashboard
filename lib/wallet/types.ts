/* ---------------------------------------------------------------------------
   The wallet dashboard's typed surface.

   Shared between the route that builds these and the client that renders
   them, so a field cannot mean one thing on the server and another in the
   browser. Nothing here imports `server-only`, and nothing here reads the
   environment.

   Every number that could be unknown is `| null` rather than defaulted to
   zero. A balance of zero and a balance nobody could read are different
   facts, and a dashboard that renders the second as the first is lying at
   the exact moment its user most needs it not to.
--------------------------------------------------------------------------- */

import type { Cluster } from "@/lib/solana/cluster";
import type { TxSummary } from "@/lib/wallet/summarise";

/** Lamports per SOL. Nine decimals, fixed by the protocol. */
export const LAMPORTS_PER_SOL = 1_000_000_000;

export interface TokenBalance {
  mint: string;
  /** Null when the mint could not be resolved; the UI shows the address. */
  symbol: string | null;
  name: string | null;
  /** Scaled by the mint's decimals. */
  amount: number;
  decimals: number;
  /** Null when the token has no price, or is unverified and so uncounted. */
  usdValue: number | null;
  icon: string | null;
  /**
   * Jupiter recognises this mint as the token it claims to be.
   *
   * Unverified holdings are shown and never counted. Airdropping a token
   * named "USDC" at a wallet costs a few cents, and a dashboard that adds
   * one into a total can be made to display any figure an attacker likes.
   */
  verified: boolean;
}

export interface WalletSnapshot {
  address: string;
  /**
   * Which ledger this balance was read from.
   *
   * Verified against the node's genesis hash rather than assumed from config,
   * because the failure it guards against is a devnet balance rendered as
   * real money under a label that says mainnet.
   */
  cluster: Cluster;
  /** Native balance, already scaled out of lamports. */
  sol: number;
  lamports: number;
  /** Pyth's SOL/USD. Null when the feed is unavailable — never guessed. */
  solUsd: number | null;
  /** The most valuable holdings, capped so a spammed wallet cannot bloat the
   *  response. `tokenCount` says how many there really are. */
  tokens: TokenBalance[];
  /** Every mint held with a non-zero balance, including any beyond the cap. */
  tokenCount: number;
  /**
   * SOL plus every verified, priced token.
   *
   * Null rather than 0 when the SOL price is unknown: the wallet may hold a
   * great deal and the total is simply not computable, which the chip renders
   * as a stale or error state rather than as an amount.
   */
  usdValue: number | null;
  /** Held tokens deliberately excluded from `usdValue`, and why. */
  uncounted: { unpriced: number; unverified: number };
  /** The slot the balance was read at — on-chain's own clock. */
  slot: number;
  fetchedAt: string;
}

export interface WalletResponse {
  wallet: WalletSnapshot | null;
  /** Null when the read succeeded. */
  error: string | null;
  /** True when SOLANA_RPC_URL is unset, which is a config gap, not an outage. */
  unconfigured: boolean;
  /** RPC round trip, in ms. Feeds the health meter. */
  latencyMs: number | null;
}

/* ---------------------------------------------------------------------------
   Activity
--------------------------------------------------------------------------- */

export type ActivityStatus = "pending" | "confirmed" | "failed";

export interface WalletActivity {
  signature: string;
  status: ActivityStatus;
  slot: number;
  /** ISO. Null while the block is too new to carry a time. */
  at: string | null;
  memo: string | null;
  /** What it did, where the RPC can say (lib/wallet/helius.ts). */
  summary?: TxSummary | null;
}

export interface ActivityResponse {
  items: WalletActivity[];
  error: string | null;
  unconfigured: boolean;
}

/**
 * `err` is null on success and an object of unspecified shape on failure, and
 * `confirmationStatus` is absent on older nodes. Both are someone else's
 * contract, so the mapping is written out rather than inferred.
 */
export function activityStatus(
  err: unknown,
  confirmationStatus: string | null,
): ActivityStatus {
  if (err !== null && err !== undefined) return "failed";
  if (confirmationStatus === "processed") return "pending";
  /* "confirmed", "finalized", and a node that reports neither. A signature
     that came back from getSignaturesForAddress at confirmed commitment has
     landed, so treating an absent status as confirmed is the safe reading. */
  return "confirmed";
}

/**
 * A human-readable reason for an on-chain failure, from `err`'s unspecified
 * shape.
 *
 * The common case is `{ InstructionError: [index, reason] }`, which names
 * which instruction failed and why — worth surfacing directly, since "the
 * transaction confirmed with an error" is otherwise an unhelpful thing to
 * tell someone about money that did not move. Anything else is stringified,
 * bounded, rather than swallowed: an imperfect reason beats none.
 */
export function describeChainError(err: unknown): string {
  if (err !== null && typeof err === "object" && "InstructionError" in err) {
    const detail = (err as { InstructionError: unknown }).InstructionError;
    if (Array.isArray(detail) && detail.length === 2) {
      const [index, reason] = detail;
      const reasonText =
        typeof reason === "string"
          ? reason
          : reason !== null && typeof reason === "object"
            ? Object.entries(reason as Record<string, unknown>)
                .map(([key, value]) => `${key}(${JSON.stringify(value)})`)
                .join(", ")
            : JSON.stringify(reason);
      return `Instruction ${String(index)} failed: ${reasonText}`;
    }
  }
  try {
    return JSON.stringify(err).slice(0, 300);
  } catch {
    return "The transaction failed on-chain.";
  }
}
