import type { BacktestConfig, EquityPoint, Trade } from "@/lib/backtest/engine";
import type { BacktestMetrics, QualityAssessment } from "@/lib/backtest/metrics";
import type { RobustnessReport } from "@/lib/backtest/robustness";
import type { StrategyCategory, StrategyParameter } from "@/lib/backtest/strategies";

/* ---------------------------------------------------------------------------
   What the backtest routes return — the strategy catalogue, one run, a
   comparison and the saved results — apart from the modules that run them,
   which are server-only, so the website and the Android app read one
   definition of each.
--------------------------------------------------------------------------- */

/** One strategy in /api/backtest/strategies, with the controls it takes. */
export interface CatalogueStrategy {
  id: string;
  name: string;
  category: StrategyCategory;
  rules: { entry: string; exit: string };
  parameters: StrategyParameter[];
  requiresVolume: boolean;
  intradayOnly: boolean;
  version: number;
}

/** /api/backtest/strategies. */
export interface StrategyCatalogue {
  categories: Array<{ id: StrategyCategory; label: string }>;
  strategies: CatalogueStrategy[];
}

/** /api/backtest/run. Trades are capped at 500; the full arrays are stored. */
export interface RunResponse {
  id: string | null;
  strategy: { id: string; name: string; rules: { entry: string; exit: string } };
  config: BacktestConfig;
  metrics: BacktestMetrics;
  quality: QualityAssessment;
  robustness: RobustnessReport | null;
  warnings: string[];
  barsLoaded: number;
  coverage: number;
  trades: Trade[];
  equity: EquityPoint[];
  /** Whether the result was saved, and so has a PDF. */
  persisted: boolean;
}

export interface ComparisonRow {
  strategyId: string;
  strategyName: string;
  ok: boolean;
  error?: string;
  totalReturnPct?: number;
  benchmarkReturnPct?: number | null;
  maxDrawdownPct?: number;
  sharpe?: number | null;
  trades?: number;
  winRatePct?: number | null;
  quality?: string;
}

export interface ComparisonResult {
  ok: boolean;
  error?: string;
  /** The assumptions every row shares. Shown once, above the table. */
  assumptions?: {
    symbol: string;
    timeframe: string;
    startAt: string;
    endAt: string;
    bars: number;
    coverage: number;
    feeBps: number;
    slippageBps: number;
    initialCapitalUsd: number;
  };
  rows: ComparisonRow[];
  warnings: string[];
}

export interface BacktestRecord {
  id: string;
  query: string | null;
  instrument: string;
  timeframe: string;
  strategyId: string;
  status: string;
  statusDetail: string | null;
  quality: string | null;
  createdAt: string;
  metrics: BacktestMetrics | null;
}

/** /api/backtest/compare. */
export type CompareResponse = ComparisonResult & { unresolved: string[] };

/** /api/backtest/results. */
export interface ResultsResponse {
  results: BacktestRecord[];
}
