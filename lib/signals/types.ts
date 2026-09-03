/* ---------------------------------------------------------------------------
   The engine's wire shape, as this app sees it.

   Mirrors `SignalDto` in `elyra-signals/packages/api/src/dto.ts`. Declared
   again here rather than imported because the two are separate pnpm
   workspaces, and a cross-workspace type import would tie the dashboard's
   build to the engine's `tsconfig`.

   The duplication is real, so `assertSignalDto` below validates at the
   boundary instead of trusting the shape. A mirrored type that silently
   drifts is worse than no type at all: it would let a missing `disclaimer`
   or a missing fixture label render as an ordinary card.
--------------------------------------------------------------------------- */

export type SignalDirection = "long" | "short";

export type EngineSignalStatus =
  | "pending"
  | "live"
  | "triggered"
  | "target_hit"
  | "stopped_out"
  | "expired"
  | "invalidated";

export type EdgeFamily =
  | "fundamental"
  | "flow"
  | "technical"
  | "prediction"
  | "macro";

export interface SourceDto {
  provider: string;
  endpoint: string;
  fetchedAt: string;
  /** When the datum first became publicly knowable. */
  availableAt: string;
  rawPreview: string | null;
  rawTruncated: boolean;
}

export interface EdgeDto {
  family: EdgeFamily;
  key: string;
  label: string;
  /** -100..100. Sign is direction. */
  score: number;
  confidence: number;
  halfLifeHours: number;
  observedAt: string;
  value: number | string | null;
  source: SourceDto;
}

export interface BacktestDto {
  ruleId: string;
  origin: "measured" | "fixture";
  /** False means these numbers were not measured. The card must say so. */
  statisticsAreMeasured: boolean;
  fires: number;
  wins: number;
  /** Pre-formatted fraction: "24/64 (37.5%)" or "—" below the floor. */
  winRateText: string;
  winRate: number | null;
  expectancyR: number;
  oosFires: number;
  oosExpectancyR: number | null;
  deflatedSharpe: number | null;
  trials: number;
  ambiguousFires: number;
  survivorshipCoverage: number | null;
  sampleWarning: string | null;
  windowStart: string;
  windowEnd: string;
  configHash: string;
  dataSnapshotId: string;
  gitSha: string;
}

export interface MetricRowDto {
  label: string;
  value: string;
  family?: EdgeFamily;
  observedAt?: string;
  tone?: "positive" | "negative" | "neutral";
}

export interface SignalDto {
  id: string;
  symbol: string;
  instrumentId: string;
  assetClass: string;
  venue: string;
  direction: SignalDirection;
  status: EngineSignalStatus;
  createdAt: string;
  expiresAt: string;
  regime: string;
  conviction: number;
  levels: {
    entry: number;
    entryType: string;
    target: number;
    targetPct: number;
    stop: number;
    stopPct: number;
    rMultiple: number;
    breakevenWinRate: number;
    maxChasePct: number;
    invalidation: string;
  };
  thesis: string;
  supportingMetrics: MetricRowDto[];
  suggestedSizePct: number;
  sizeConstraint: string;
  edges: EdgeDto[];
  backtest: BacktestDto;
  sources: SourceDto[];
  disclaimer: string;
}

export interface SignalListDto {
  signals: SignalDto[];
  count: number;
  disclaimer: string;
}

/** Statuses that mean the setup is over. Kept as a record, shown recessed. */
const CLOSED: readonly EngineSignalStatus[] = [
  "target_hit",
  "stopped_out",
  "expired",
  "invalidated",
];

export function isClosed(status: EngineSignalStatus): boolean {
  return CLOSED.includes(status);
}

/**
 * Reject a payload that is missing anything the card must not render without.
 *
 * The checks are narrow on purpose. This is not a schema validator — it
 * guards the specific fields whose absence would produce a *plausible but
 * dishonest* card: a signal with no disclaimer, or one whose statistics are
 * unmeasured with nothing saying so.
 */
export function assertSignalDto(value: unknown): SignalDto {
  const signal = value as Partial<SignalDto> | null;
  if (signal === null || typeof signal !== "object") {
    throw new Error("signal payload is not an object");
  }
  if (typeof signal.id !== "string" || signal.id === "") {
    throw new Error("signal payload has no id");
  }
  if (typeof signal.disclaimer !== "string" || signal.disclaimer === "") {
    throw new Error(`signal ${signal.id} arrived without a disclaimer`);
  }
  if (signal.backtest === undefined || typeof signal.backtest !== "object") {
    throw new Error(`signal ${signal.id} arrived without backtest statistics`);
  }
  if (typeof signal.backtest.statisticsAreMeasured !== "boolean") {
    /* Absent means the card cannot tell a measurement from a fixture, and a
       card that cannot tell must not guess. */
    throw new Error(`signal ${signal.id} does not say whether its statistics were measured`);
  }
  if (typeof signal.backtest.winRateText !== "string") {
    throw new Error(`signal ${signal.id} has no formatted win rate`);
  }
  if (signal.levels === undefined || typeof signal.levels.entry !== "number") {
    throw new Error(`signal ${signal.id} has no levels`);
  }
  return signal as SignalDto;
}
