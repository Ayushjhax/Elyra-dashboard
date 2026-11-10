/* ---------------------------------------------------------------------------
   Intelligent Portfolios — the typed surface.

   Pure, and listed in lib/core.ts: the website, the server and the Android
   app read the same catalog and the same arithmetic.

   An Intelligent Portfolio is a published recipe, not a token: what it holds,
   in what weights, and the rule that says when it has drifted. A person buys
   one with USDC into their own wallet — one reviewed swap per holding, each
   signed by them — so every holding is theirs, visible on-chain, and nothing
   is wrapped or held on their behalf.
--------------------------------------------------------------------------- */

export type PortfolioCategory = "income" | "growth" | "thematic";

export type RiskLevel = "lower" | "moderate" | "higher";

export interface PortfolioHolding {
  /** The swap allowlist's key (lib/trade.ts) — the only thing a leg trades. */
  symbol: string;
  /** The issuer's ticker as people know it: "NVDAon", "cbBTC", "USDY". */
  ticker: string;
  /** The company, fund or asset, in words. */
  name: string;
  /** Target share of the portfolio, in basis points. A portfolio's sum to 10,000. */
  weightBps: number;
  /** Why it is here, in a few words. */
  role: string;
}

export interface ModelPortfolio {
  /** URL slug. Never changes once published: positions are recorded under it. */
  id: string;
  name: string;
  category: PortfolioCategory;
  risk: RiskLevel;
  /** One sentence: what it is for. */
  summary: string;
  /** Two or three short lines: why these holdings. */
  thesis: readonly string[];
  holdings: readonly PortfolioHolding[];
  /** The day the weights were last set, ISO. Shown, so a reader can judge it. */
  reviewedOn: string;
}

/* ---- what the server adds to the catalog ---- */

/** A holding with what the market says about it right now. */
export interface PricedHolding extends PortfolioHolding {
  /** Mint, for matching wallet balances. Never used to choose what to trade. */
  mint: string;
  decimals: number;
  priceUsd: number | null;
  change24hPct: number | null;
}

export interface PricedPortfolio extends Omit<ModelPortfolio, "holdings"> {
  holdings: PricedHolding[];
}

/** Units of each holding recorded against one portfolio, from proven fills. */
export type PositionUnits = Record<string, number>;

export interface InvestResponse {
  portfolios: PricedPortfolio[];
  /**
   * Portfolio id → symbol → whole units, from this account's proven fills.
   * Null when signed out or when the ledger could not be read; `{}` when the
   * read succeeded and found nothing.
   */
  positions: Record<string, PositionUnits> | null;
  /** Why `positions` is null while signed in, in words. */
  positionsError: string | null;
  /** When the prices were read, ISO. */
  pricedAt: string;
  error: string | null;
}

/** POST /api/invest/fills — what one landed leg added to or took from a portfolio. */
export interface FillResponse {
  outcome: "recorded" | "already-recorded" | "pending" | "rejected";
  /** Symbol → signed whole units this signature moved, for the holdings it touched. */
  moved?: Record<string, number>;
  reason?: string;
}
