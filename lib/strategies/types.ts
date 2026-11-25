import type { QualityLevel } from "@/lib/backtest/metrics";
import type { StrategyDesign } from "@/lib/strategies/spec";

/* ---------------------------------------------------------------------------
   The strategy designer's routes, as the page reads them. Pure.
--------------------------------------------------------------------------- */

export type DesignSource = "designer" | "library" | "ai";

/** A design's backtest, kept small enough to store beside it. */
export interface DesignResult {
  symbol: string;
  timeframe: string;
  days: number;
  startAt: string;
  endAt: string;
  metrics: {
    totalReturnPct: number;
    benchmarkReturnPct: number | null;
    maxDrawdownPct: number;
    cagrPct: number | null;
    sharpe: number | null;
    trades: number;
    winRatePct: number | null;
    profitFactor: number | null;
    exposurePct: number;
    averageBarsHeld: number | null;
    totalFees: number;
  };
  quality: { level: QualityLevel; issues: string[] };
  /** Equity over the test, at most 240 points. */
  equity: Array<{ time: number; equity: number }>;
  initialCapitalUsd: number;
  /** The last 40 trades, newest first. */
  trades: Array<{ entryTime: number; exitTime: number | null; entryPrice: number; exitPrice: number | null; returnPct: number; netPnl: number; exitReason: string }>;
  warnings: string[];
  testedAt: string;
}

export interface SavedDesign {
  id: string;
  design: StrategyDesign;
  source: DesignSource;
  result: DesignResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedStrategy {
  design: StrategyDesign;
  /** The AI's own words about the idea, held to the design's figures; null when they were not. */
  aiSummary: string | null;
  result: DesignResult | null;
  error: string | null;
}

export interface GenerateResponse {
  strategies: GeneratedStrategy[];
  /** Proposals that broke the rules and were dropped, by code. */
  rejected: number;
}
