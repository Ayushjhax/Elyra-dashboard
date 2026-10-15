/* ---------------------------------------------------------------------------
   Assets' own typed surface.

   Everything below is a RESHAPING of `PortfolioSnapshot` — the same data
   Portfolio already reads through `/api/portfolio` — grouped the way a
   treasury console needs rather than the way a performance view does.
   Nothing here is fetched independently: see lib/assets/derive.ts, which is
   pure functions over a snapshot already on hand.

   `AssetAccount` is a "capital account" in the sense a treasury uses the
   word — a bucket of capital with a venue behind it — not a Privy wallet.
   Spot is one account even though it may span several token mints; Solana
   Perps and Prediction Markets are accounts with no venue behind them yet,
   and are represented rather than omitted, because a console that hides the
   buckets it cannot fill teaches its user nothing about what is missing.
--------------------------------------------------------------------------- */

export type AssetAccountType = "spot" | "solana-perps" | "hyperliquid" | "prediction";

export type AssetAccountStatus = "ready" | "error" | "empty";

/**
 * Whether there is anything behind the account to read.
 *
 * Separate from `status` because the two answer different questions:
 * "is it linked" and "did the last read work". A linked venue whose read
 * failed is connected AND in error; a venue Elyra has no adapter for is
 * unsupported, which no amount of connecting will change.
 */
export type AssetConnection = "connected" | "disconnected" | "unsupported";

export interface AssetAccount {
  id: AssetAccountType;
  type: AssetAccountType;
  label: string;
  /** Null when nothing here has a computable value — never 0 as a stand-in. */
  valueUsd: number | null;
  availableUsd: number | null;
  /** Share of `summary.totalValueUsd`. Null when either side is unknown. */
  allocationPct: number | null;
  status: AssetAccountStatus;
  connection: AssetConnection;
  /** Open positions here, where the venue has such a thing. Null where it does not. */
  positions: number | null;
  /** Present only when `status === "error"`, and why. */
  errorReason: string | null;
  /** One line of supporting detail, already composed for the card — e.g.
      "7 assets · +2.84% today" or "Available $5,250 · 1 open position". Null
      when there is nothing true to say yet. */
  detail: string | null;
}
