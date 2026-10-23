/* ---------------------------------------------------------------------------
   The shape of a market signal (lib/research/signals.ts) and of
   /api/market/signals, apart from the generator, which is server-only — so
   the website and the Android app read one definition.
--------------------------------------------------------------------------- */

export type EvaluationState =
  "evaluated" | "unavailable" | "stale" | "unsupported";
export interface SignalEvaluation {
  price: EvaluationState;
  funding: EvaluationState;
  divergence: EvaluationState;
  generatedAt: string;
}

export type SignalType =
  | "price_momentum"
  | "volatility_expansion"
  | "volume_confirmation"
  | "funding_dislocation"
  | "spot_perp_basis"
  | "cross_venue_divergence";

export type SignalStrength = "low" | "medium" | "high";
export type SignalDirection = "positive" | "negative" | "neutral";

export interface SignalEvidence {
  /** Where the reading came from. */
  source: string;
  label: string;
  value: string;
  /** When this reading was taken. Staleness is visible, not implied. */
  asOf: string;
}

export interface MarketSignal {
  instrumentId: string;
  symbol: string;
  type: SignalType;
  direction: SignalDirection;
  strength: SignalStrength;
  title: string;
  summary: string;
  evidence: SignalEvidence[];
  /** Independent readings that agree. */
  confirmationCount: number;
  /** Readings that point the other way. Listed, never suppressed. */
  contradictions: string[];
  generatedAt: string;
  /** Oldest reading used, so a caller can judge freshness. */
  dataFreshness: string;
}

/** One symbol's signals, as /api/market/signals returns them. */
export interface SymbolSignals {
  symbol: string;
  signals: MarketSignal[];
  asOf: string;
  warnings: string[];
}

export interface MarketSignalsResponse {
  results: SymbolSignals[];
  generatedAt: string;
}
