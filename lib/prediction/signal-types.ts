/* ---------------------------------------------------------------------------
   The shape of a prediction signal.

   Every numeric field here is produced by `lib/prediction/signal-engine.ts`
   from a book that was read from the venue, or by
   `lib/prediction/signal-backtest.ts` from a historical simulation. No model
   writes into this object. The Agent and the Telegram renderer read it and
   describe it; they do not compute anything it contains.

   Client-safe: the signal panel renders these types in the browser.
--------------------------------------------------------------------------- */

/**
 * Which contract to be long, stated as an outcome.
 *
 * Never a bare BUY or SELL. On a two-sided prediction market "sell YES" and
 * "buy NO" are the same trade, and a direction that does not name the outcome
 * leaves the reader to guess which leg was meant.
 */
export type SignalDirection =
  /** Buy the YES contract. */
  | "long_yes"
  /** Buy the NO contract — the executable way to be bearish on YES. */
  | "long_no"
  /** Buy a named outcome of a multi-outcome market. */
  | "long_outcome"
  /** Conditions are close but not met. Watch, do not act. */
  | "watch"
  /** Evidence conflicts or the market is uninteresting. */
  | "neutral";

export type SignalStrength = "low" | "medium" | "high";
export type LiquidityQuality = "poor" | "fair" | "good";

export interface SignalEvidence {
  key: string;
  label: string;
  value: number | string;
  /** Whether this observation argues FOR the direction taken. */
  direction: "supports" | "contradicts" | "neutral";
  /** Which service produced it, e.g. "orderbook_analytics". */
  source: string;
  timestamp: string;
}

export interface SignalEntry {
  type: "limit" | "zone" | "breakout" | "confirmation";
  price?: number;
  minPrice?: number;
  maxPrice?: number;
  /** The condition in words, for a breakout or confirmation entry. */
  trigger?: string;
  /**
   * The price a real order of the reference size would average.
   *
   * Walked through the ladder, not read off the touch. Null when the book
   * cannot absorb the reference size at all.
   */
  executablePrice?: number | null;
  /** True when the market has already left the zone. Never silently revised. */
  missed?: boolean;
}

export interface SignalTarget {
  price?: number;
  minPrice?: number;
  maxPrice?: number;
  /** How this level was derived. Shown verbatim. */
  basis: string;
}

export interface SignalStop {
  price?: number;
  /** The condition that voids the setup, where it is not a price. */
  invalidation?: string;
  basis: string;
  /**
   * Whether a resting order could be expected to fill here.
   *
   * False on a thin book, where the level is an INVALIDATION — a point at
   * which the idea is wrong — and not a price anyone is promising.
   */
  executable: boolean;
}

/**
 * A win rate, with everything needed to know what it measures.
 *
 * The qualifying fields are not decoration. "58% win rate" over eleven
 * signals, or over a universe that mixes 3¢-spread binaries with illiquid
 * long-dated markets, is not the same claim as one over a tight universe with
 * a real sample, and a reader given only the percentage cannot tell them
 * apart.
 */
export interface HistoricalWinRate {
  valuePct: number;
  sampleSize: number;
  wins: number;
  losses: number;
  /** Entries that never triggered. Not wins and not losses. */
  noEntry: number;
  strategyId: string;
  strategyVersion: string;
  lookback: string;
  marketUniverse: string;
  successDefinition: string;
  dataSource: string;
  /** True when the sample is too small to headline. */
  insufficientSample: boolean;
  averageRiskReward: number | null;
  warnings: string[];
}

export type SignalStatus =
  | "generated"
  | "waiting_entry"
  | "entered"
  | "target_hit"
  | "invalidated"
  | "expired"
  | "cancelled";

/** How close resolution is. Some strategies stand down when it is imminent. */
export type ResolutionProximity = "far" | "medium" | "near" | "imminent" | "unknown";

export interface PredictionTechnicalSignal {
  id: string;

  marketId: string;
  conditionId: string | null;
  tokenId: string;
  outcomeId: string;

  marketQuestion: string;
  outcomeLabel: string;

  strategyId: string;
  strategyVersion: string;

  direction: SignalDirection;

  entry: SignalEntry;
  target: SignalTarget;
  stop: SignalStop;

  /** (target − entry) / (entry − stop). Computed in the engine, never by a model. */
  riskReward: number | null;

  historicalWinRate: HistoricalWinRate | null;
  /**
   * Why there is no win rate, when there is none.
   *
   * Travels WITH the signal so every surface prints the same sentence. For an
   * order-book strategy this carries the forward-collection progress — "no
   * win rate yet, 120 observations across 40 outcomes" — which is a very
   * different message from "no win rate", and the difference decides whether
   * a reader concludes the feature is broken.
   */
  winRateUnavailableReason: string | null;

  strength: SignalStrength;
  liquidityQuality: LiquidityQuality;

  evidence: SignalEvidence[];

  /** Milliseconds to resolution, and the bucket it falls in. */
  timeToResolutionMs: number | null;
  resolutionProximity: ResolutionProximity;
  /** A known discontinuity is expected inside the setup's horizon. */
  eventRisk: boolean;

  generatedAt: string;
  expiresAt: string | null;

  /** Age of the book this was built from. */
  dataFreshnessMs: number;
  /** How that book was obtained. A snapshot is not a live feed. */
  transport: "realtime" | "rest_snapshot";

  warnings: string[];

  /** Snapshot of the analytics that produced it, for the audit trail. */
  snapshot: {
    bestBid: number | null;
    bestAsk: number | null;
    midpoint: number | null;
    microprice: number | null;
    spreadPoints: number | null;
    imbalanceTop5: number | null;
    basketProbability: number | null;
    basketDeviationPoints: number | null;
    depthTop5Usd: number | null;
  };
}

/** A generated signal plus its lifecycle state, as stored. */
export interface PredictionSignalRecord {
  id: string;
  userId: string | null;
  signal: PredictionTechnicalSignal;
  status: SignalStatus;
  /** Where the market went after generation. Forward tracking only. */
  entryFilledAt: string | null;
  entryPrice: number | null;
  resolvedAt: string | null;
  resultPoints: number | null;
  createdAt: string;
  updatedAt: string;
}
