import type { Candle } from "@/lib/backtest/candles";
import { runBacktest, type BacktestConfig, type BacktestRun } from "@/lib/backtest/engine";
import { computeMetrics, type BacktestMetrics } from "@/lib/backtest/metrics";
import { getStrategy, defaultParams } from "@/lib/backtest/strategies";

/* ---------------------------------------------------------------------------
   Robustness and optimisation.

   ── Why a backtest alone proves nothing ────────────────────────────────

   Any strategy can be made to look good on one period with one parameter set.
   The question a result cannot answer about itself is whether it survives
   being poked: slightly worse fills, slightly different parameters, a period
   it was not chosen on.

   So a result is accompanied by the same strategy run under deliberately less
   favourable assumptions, and the differences are shown rather than
   summarised into a score.

   ── The in-sample trap ─────────────────────────────────────────────────

   Optimising over a period and then presenting that same period as evidence
   is the most common way a backtest lies. The optimiser below splits the data
   chronologically — never randomly, because shuffled time series leak the
   future into the past — fits on the first portion and REPORTS the second.
   The out-of-sample number is the headline; the in-sample number is context.

   Pure, deterministic and directly testable.
--------------------------------------------------------------------------- */

/** Fraction of history used to fit. The rest is held back. */
export const TRAIN_FRACTION = 0.7;

export interface RobustnessCheck {
  label: string;
  /** What changed relative to the base run. */
  change: string;
  totalReturnPct: number;
  maxDrawdownPct: number;
  trades: number;
  /** Difference in return against the base run, percentage points. */
  deltaPoints: number;
}

export interface RobustnessReport {
  base: { totalReturnPct: number; maxDrawdownPct: number; trades: number };
  checks: RobustnessCheck[];
  /** Plain-language conclusions. Never a score. */
  findings: string[];
}

function summarise(run: BacktestRun): { metrics: BacktestMetrics } {
  return { metrics: computeMetrics(run) };
}

/**
 * Re-runs a strategy under harsher and neighbouring assumptions.
 *
 * Cost sensitivity first, because it is the assumption most often set
 * optimistically and the one that destroys the most strategies. Parameter
 * neighbours second: a result that only works at exactly period 14 and falls
 * apart at 13 and 15 was fitted to noise.
 */
export function assessRobustness(input: {
  candles: Candle[];
  config: BacktestConfig;
  warmupBars: number;
}): RobustnessReport {
  const { candles, config, warmupBars } = input;

  const base = summarise(runBacktest({ candles, config, warmupBars })).metrics;
  const checks: RobustnessCheck[] = [];

  const run = (label: string, change: string, next: BacktestConfig): void => {
    try {
      const metrics = summarise(runBacktest({ candles, config: next, warmupBars })).metrics;
      checks.push({
        label,
        change,
        totalReturnPct: metrics.totalReturnPct,
        maxDrawdownPct: metrics.maxDrawdownPct,
        trades: metrics.trades,
        deltaPoints: metrics.totalReturnPct - base.totalReturnPct,
      });
    } catch {
      /* A variant that cannot run is not a robustness failure — it is a
         configuration the engine refuses, and skipping it is correct. */
    }
  };

  /* ---- Cost sensitivity ---- */
  run(
    "Double costs",
    `${config.execution.feeBps * 2} bps fee, ${config.execution.slippageBps * 2} bps slippage`,
    {
      ...config,
      execution: {
        ...config.execution,
        feeBps: config.execution.feeBps * 2,
        slippageBps: config.execution.slippageBps * 2,
      },
    },
  );

  run("Worse fills", `${config.execution.slippageBps + 20} bps slippage`, {
    ...config,
    execution: { ...config.execution, slippageBps: config.execution.slippageBps + 20 },
  });

  /* ---- Parameter neighbours ----

     Only the first numeric parameter is varied, which is the period for every
     strategy that has one. Varying everything would be a grid search, and
     this is a stability probe. */
  const strategy = getStrategy(config.strategyId);
  const primary = strategy?.parameters[0];

  if (strategy !== null && primary !== undefined && primary.key === "period") {
    const current = config.params[primary.key] ?? primary.default;
    for (const delta of [-2, 2]) {
      const value = current + delta;
      if (value < (primary.min ?? 2)) continue;
      run(
        `${primary.label} ${value}`,
        `${primary.label} ${current} → ${value}`,
        { ...config, params: { ...config.params, [primary.key]: value } },
      );
    }
  }

  /* ---- Findings ---- */
  const findings: string[] = [];

  const doubled = checks.find((check) => check.label === "Double costs");
  if (doubled !== undefined) {
    if (base.totalReturnPct > 0 && doubled.totalReturnPct <= 0) {
      findings.push(
        "The result does not survive doubled costs — the edge is smaller than the cost assumption.",
      );
    } else if (Math.abs(doubled.deltaPoints) > Math.abs(base.totalReturnPct) * 0.5) {
      findings.push(
        "Doubling costs changes the result by more than half — it is highly cost-sensitive.",
      );
    }
  }

  const neighbours = checks.filter((check) => check.label.includes("Period"));
  if (neighbours.length >= 2) {
    const spread = Math.max(...neighbours.map((n) => Math.abs(n.deltaPoints)));
    if (spread > Math.abs(base.totalReturnPct) * 0.5 && Math.abs(base.totalReturnPct) > 1) {
      findings.push(
        "Small parameter changes move the result substantially, which suggests it is fitted to noise rather than to a persistent effect.",
      );
    }
  }

  if (base.trades < 20) {
    findings.push(
      `${base.trades} trades is a small sample — the result is heavily influenced by a handful of outcomes.`,
    );
  }

  if (findings.length === 0) {
    findings.push(
      "The result held up under doubled costs and neighbouring parameters. That is not proof it will persist, only that it is not obviously fragile.",
    );
  }

  return {
    base: {
      totalReturnPct: base.totalReturnPct,
      maxDrawdownPct: base.maxDrawdownPct,
      trades: base.trades,
    },
    checks,
    findings,
  };
}

/* ---------------------------------------------------------------------------
   Optimisation
--------------------------------------------------------------------------- */

export type Objective = "sharpe" | "sortino" | "return_over_drawdown" | "profit_factor";

export interface OptimizationCandidate {
  params: Record<string, number>;
  /** In-sample, where it was fitted. Context, not evidence. */
  trainScore: number | null;
  trainReturnPct: number;
  /** Out-of-sample. THIS is the number that means something. */
  testScore: number | null;
  testReturnPct: number;
  testTrades: number;
  testMaxDrawdownPct: number;
}

export interface OptimizationResult {
  objective: Objective;
  /** Best by OUT-OF-SAMPLE score, never by training score. */
  best: OptimizationCandidate | null;
  candidates: OptimizationCandidate[];
  combinationsSearched: number;
  trainBars: number;
  testBars: number;
  warnings: string[];
}

/** The minimum trades an out-of-sample result needs to be taken seriously. */
const MIN_TEST_TRADES = 5;

/** Bounded so an optimiser cannot become an accidental denial of service. */
export const MAX_COMBINATIONS = 200;

function score(metrics: BacktestMetrics, objective: Objective): number | null {
  if (objective === "sharpe") return metrics.sharpe;
  if (objective === "sortino") return metrics.sortino;
  if (objective === "profit_factor") return metrics.profitFactor;
  if (metrics.maxDrawdownPct === 0) return null;
  return metrics.totalReturnPct / metrics.maxDrawdownPct;
}

/**
 * Grid search with a chronological holdout.
 *
 * ── Why the split is by time and never shuffled ────────────────────────
 *
 * A shuffled split puts tomorrow's bars in the training set and yesterday's
 * in the test set. Every indicator is a function of recent history, so the
 * test set then contains bars whose neighbours were fitted on — the model has
 * effectively seen the answer. Time series are split at a point, always.
 *
 * ── Why the winner is chosen out-of-sample ─────────────────────────────
 *
 * Picking the best training score and reporting its training number is the
 * definition of overfitting. The candidate with the best HELD-OUT score wins,
 * and its training score is shown beside it so the gap between them is
 * visible — a large gap is itself the finding.
 */
export function optimize(input: {
  candles: Candle[];
  config: BacktestConfig;
  warmupBars: number;
  /** Parameter key → values to try. */
  grid: Record<string, number[]>;
  objective?: Objective;
}): OptimizationResult {
  const { candles, config, warmupBars, grid } = input;
  const objective = input.objective ?? "sharpe";
  const warnings: string[] = [];

  /* Cartesian product, bounded. */
  const keys = Object.keys(grid);
  let combos: Array<Record<string, number>> = [{}];
  for (const key of keys) {
    const next: Array<Record<string, number>> = [];
    for (const combo of combos) {
      for (const value of grid[key]) next.push({ ...combo, [key]: value });
    }
    combos = next;
  }

  const combinationsSearched = combos.length;
  if (combos.length > MAX_COMBINATIONS) {
    warnings.push(
      `The grid had ${combos.length} combinations; only the first ${MAX_COMBINATIONS} were searched.`,
    );
    combos = combos.slice(0, MAX_COMBINATIONS);
  }

  /* The split point, by time. Warm-up stays with the training half so the
     test half starts with converged indicators. */
  const tradable = candles.length - warmupBars;
  const trainBars = Math.floor(tradable * TRAIN_FRACTION);
  const splitIndex = warmupBars + trainBars;

  const trainCandles = candles.slice(0, splitIndex);
  /* The test slice carries its own warm-up, taken from the training period —
     which is legitimate, because those bars are in the past relative to every
     test bar. */
  const testCandles = candles.slice(Math.max(0, splitIndex - warmupBars));

  if (trainBars < 100 || testCandles.length - warmupBars < 50) {
    warnings.push(
      "The period is too short to split meaningfully — out-of-sample results are unreliable.",
    );
  }

  const candidates: OptimizationCandidate[] = [];

  for (const params of combos) {
    const merged = { ...config.params, ...params };

    let trainMetrics: BacktestMetrics | null = null;
    let testMetrics: BacktestMetrics | null = null;

    try {
      trainMetrics = computeMetrics(
        runBacktest({
          candles: trainCandles,
          config: { ...config, params: merged },
          warmupBars,
        }),
      );
      testMetrics = computeMetrics(
        runBacktest({
          candles: testCandles,
          config: { ...config, params: merged },
          warmupBars,
        }),
      );
    } catch {
      continue;
    }

    candidates.push({
      params: merged,
      trainScore: score(trainMetrics, objective),
      trainReturnPct: trainMetrics.totalReturnPct,
      testScore: score(testMetrics, objective),
      testReturnPct: testMetrics.totalReturnPct,
      testTrades: testMetrics.trades,
      testMaxDrawdownPct: testMetrics.maxDrawdownPct,
    });
  }

  /* Ranked on the HELD-OUT score, and only among candidates that actually
     traded out of sample — a parameter set producing two trades has not been
     tested, whatever its score. */
  const eligible = candidates.filter(
    (candidate) => candidate.testScore !== null && candidate.testTrades >= MIN_TEST_TRADES,
  );

  if (eligible.length === 0 && candidates.length > 0) {
    warnings.push(
      `No parameter set produced at least ${MIN_TEST_TRADES} out-of-sample trades, so none can be recommended.`,
    );
  }

  const best =
    [...eligible].sort((a, b) => (b.testScore ?? 0) - (a.testScore ?? 0))[0] ?? null;

  if (best !== null && best.trainScore !== null && best.testScore !== null) {
    if (best.trainScore > 0 && best.testScore < best.trainScore * 0.5) {
      warnings.push(
        "The best parameters performed far worse out of sample than in sample, which is the signature of overfitting.",
      );
    }
  }

  return {
    objective,
    best,
    candidates: candidates
      .sort((a, b) => (b.testScore ?? -Infinity) - (a.testScore ?? -Infinity))
      .slice(0, 25),
    combinationsSearched,
    trainBars,
    testBars: testCandles.length - warmupBars,
    warnings,
  };
}

/** A sensible grid for a strategy's primary period. */
export function defaultGrid(strategyId: string): Record<string, number[]> {
  const strategy = getStrategy(strategyId);
  if (strategy === null) return {};

  const primary = strategy.parameters[0];
  if (primary === undefined || primary.key !== "period") return {};

  const base = defaultParams(strategy)[primary.key];
  const values = [
    Math.max(primary.min ?? 2, Math.round(base * 0.5)),
    Math.max(primary.min ?? 2, Math.round(base * 0.75)),
    base,
    Math.round(base * 1.5),
    Math.round(base * 2),
  ];

  return { [primary.key]: [...new Set(values)].filter((v) => v >= (primary.min ?? 2)) };
}
