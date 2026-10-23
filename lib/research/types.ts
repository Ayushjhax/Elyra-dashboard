import type { SignalEvaluation, MarketSignal } from "@/lib/research/signalTypes";

/* ---------------------------------------------------------------------------
   What the research routes return — the market recap, Kamino yields, token
   unlocks and the signal feed — apart from the modules that build them,
   which are server-only, so the website and the Android app read one
   definition of each.
--------------------------------------------------------------------------- */

export interface RecapMove {
  symbol: string;
  price: number;
  changePct: number;
  asOf: string;
  stale?: boolean;
}

export interface RecapSection {
  title: string;
  lines: string[];
  /** Set when the section could not be produced, with the reason. */
  unavailable: string | null;
  asOf?: string;
  stale?: boolean;
  moves?: RecapMove[];
  funding?: Array<{ symbol: string; annualisedPct: number }>;
  markets?: Array<{
    id: string;
    question: string;
    outcome: string | null;
    price: number | null;
    status: string;
    url: string | null;
  }>;
}

export interface MarketRecap {
  generatedAt: string;
  windowHours: number;
  sections: RecapSection[];
  /** Sources that were read. For provenance. */
  sources: string[];
}

export type RecapScope = "crypto" | "equities" | "portfolio";

export type YieldStrategy = "lending" | "vault" | "liquidity";

export interface YieldOpportunity {
  provider: "kamino";
  /** Vault address. Stable, and what a detail view would fetch. */
  id: string;
  name: string;
  /** Token symbol where known, else the mint. */
  asset: string;
  mint: string;
  strategy: YieldStrategy;
  /** PERCENT, converted from the provider's fraction. */
  apyPct: number | null;
  /** Thirty-day trailing APY, percent. Steadier than the spot figure. */
  apy30dPct: number | null;
  /** The part of APY that is token emissions rather than interest. */
  rewardApyPct: number | null;
  tvlUsd: number | null;
  /** Capital not currently deployed. Indicates room to exit. */
  availableUsd: number | null;
  holders: number | null;
  /** Stated caveats. Never a numeric risk score. */
  flags: string[];
  asOf: string;
}

export type UnlockEventType = "cliff" | "linear" | "unknown";

export interface TokenUnlock {
  token: string;
  unlockAt: string;
  eventType: UnlockEventType;
  tokenAmount: number | null;
  valueUsd: number | null;
  /** Share of circulating supply, percent. The figure that matters most. */
  percentOfCirculating: number | null;
  percentOfTotal: number | null;
  /** "Team", "Investors", "Ecosystem" — as the provider labels it. */
  allocation: string | null;
  /** True when the provider derived the date rather than reading a schedule. */
  estimated: boolean;
  provider: string;
  sourceUrl: string | null;
  asOf: string;
}

export interface UnlockSummary {
  total: number;
  within24h: number;
  within7d: number;
  within30d: number;
  totalValueUsd: number | null;
  /** The single largest event by share of float. */
  largest: TokenUnlock | null;
  /** Events meeting the major threshold. */
  major: TokenUnlock[];
}

/** /api/research/signals. */
export interface ResearchSignalsResponse {
  signals: MarketSignal[];
  asOf: string;
  warnings: string[];
  evaluation?: SignalEvaluation;
}

/** /api/research/yield. */
export interface YieldResponse {
  opportunities: YieldOpportunity[];
  asOf: string;
  /** How the list is ordered, in words. */
  ranking: string;
  warnings: string[];
}

/** /api/research/unlocks. Availability is part of the payload, not a status. */
export interface UnlocksResponse {
  configured: boolean;
  reason?: string;
  unlocks: TokenUnlock[];
  summary?: UnlockSummary;
  error?: string | null;
}
