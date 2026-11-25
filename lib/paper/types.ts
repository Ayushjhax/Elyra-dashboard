import type { PaperFunds } from "@/lib/paper/funds";

/* ---------------------------------------------------------------------------
   /api/paper, as the website reads it. Pure.
--------------------------------------------------------------------------- */

export interface PaperAccountView {
  startingUsd: number;
  /** When this balance started: the claim, or the last reset. */
  startedAt: string;
  /** Orders go to the paper account. */
  active: boolean;
  resets: number;
  funds: PaperFunds;
}

export interface PaperResponse {
  /** Null until the person claims it, or a paper trade makes it. */
  account: PaperAccountView | null;
  /** Whether this deployment sends live orders, and to which network. */
  live: { enabled: boolean; network: "mainnet" | "testnet" };
  error: string | null;
}
