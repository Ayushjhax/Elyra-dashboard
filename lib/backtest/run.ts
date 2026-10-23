import "server-only";

import { serviceClient } from "@/lib/supabase/server";
import {
  binanceCandles,
  isIntraday,
  isSupportedInterval,
  validateCandles,
  INTERVAL_MS,
  type Candle,
} from "@/lib/backtest/candles";
import { runBacktest, type BacktestConfig, ENGINE_VERSION } from "@/lib/backtest/engine";
import { assessQuality, computeMetrics, type BacktestMetrics } from "@/lib/backtest/metrics";
import { assessRobustness, type RobustnessReport } from "@/lib/backtest/robustness";
import { defaultParams, getStrategy } from "@/lib/backtest/strategies";
import { parseBacktestRequest, type ParsedRequest } from "@/lib/backtest/parse";
import type { BacktestRecord, ComparisonResult, ComparisonRow } from "@/lib/backtest/types";

export type { BacktestRecord, ComparisonResult, ComparisonRow, ParsedRequest };
export { parseBacktestRequest };

/* ---------------------------------------------------------------------------
   Running a backtest end to end: data in, verified result out.

   ── Warm-up is fetched, not borrowed ───────────────────────────────────

   A strategy asking for 255 bars of history cannot get them from inside the
   test window without losing the first year of it. So the fetch starts
   `warmup × interval` BEFORE the requested start, and the engine is told how
   many leading bars are warm-up. Those bars drive indicator state and can
   never open a trade.

   ── One dataset per comparison ─────────────────────────────────────────

   `compareStrategies` loads candles once and runs every strategy over the
   same array. Fetching per strategy would give each one a slightly different
   window and silently make the comparison invalid.
--------------------------------------------------------------------------- */

/** Hard ceiling per run, so one request cannot pull years of minute bars. */
const MAX_BARS = 20_000;

/** Comparing more than this at once is a report, not a question. */
export const MAX_COMPARE = 6;

export interface RunRequest {
  symbol: string;
  timeframe: string;
  /** Epoch ms. */
  startAt: number;
  endAt: number;
  strategyId: string;
  params?: Record<string, number>;
  initialCapitalUsd?: number;
  feeBps?: number;
  slippageBps?: number;
  positionFraction?: number;
}

export interface RunOutcome {
  ok: boolean;
  error?: string;
  config?: BacktestConfig;
  metrics?: BacktestMetrics;
  trades?: ReturnType<typeof runBacktest>["trades"];
  equity?: ReturnType<typeof runBacktest>["equity"];
  quality?: ReturnType<typeof assessQuality>;
  robustness?: RobustnessReport;
  warnings?: string[];
  barsLoaded?: number;
  coverage?: number;
}

function configFor(request: RunRequest, params: Record<string, number>): BacktestConfig {
  return {
    instrumentId: request.symbol.toUpperCase(),
    venue: "binance",
    timeframe: request.timeframe,
    startAt: new Date(request.startAt).toISOString(),
    endAt: new Date(request.endAt).toISOString(),
    initialCapitalUsd: request.initialCapitalUsd ?? 10_000,
    strategyId: request.strategyId,
    params,
    direction: "long_only",
    positionFraction: request.positionFraction ?? 1,
    execution: {
      signalTiming: "bar_close",
      entryExecution: "next_bar_open",
      exitExecution: "next_bar_open",
      /* Explicit defaults rather than zero. A frictionless backtest is the
         single easiest way to make any strategy look profitable. */
      feeBps: request.feeBps ?? 10,
      slippageBps: request.slippageBps ?? 10,
      fundingMode: "ignore",
    },
  };
}

/** Validates the request before any network call. */
export function validateRequest(request: RunRequest): string | null {
  if (!isSupportedInterval(request.timeframe)) {
    return `"${request.timeframe}" is not a supported timeframe. Use one of: ${Object.keys(INTERVAL_MS).join(", ")}.`;
  }

  const strategy = getStrategy(request.strategyId);
  if (strategy === null) return `Unknown strategy "${request.strategyId}".`;

  if (strategy.intradayOnly === true && !isIntraday(request.timeframe)) {
    /* A daily bar IS its own session, so session VWAP would equal the typical
       price and every cross would be noise. */
    return `${strategy.name} needs intraday bars — a daily bar is its own session, so the indicator is meaningless on it.`;
  }

  if (request.endAt <= request.startAt) return "The period ends before it starts.";

  const span = request.endAt - request.startAt;
  const bars = span / (INTERVAL_MS[request.timeframe] ?? 1);
  if (bars > MAX_BARS) {
    return `That period is ${Math.round(bars).toLocaleString()} bars, above the ${MAX_BARS.toLocaleString()} limit. Use a longer timeframe or a shorter period.`;
  }

  return null;
}

/** Loads candles including the warm-up the strategy needs. */
async function loadCandles(
  request: RunRequest,
  warmupBars: number,
): Promise<{ candles: Candle[]; coverage: number; warnings: string[] } | { error: string }> {
  const step = INTERVAL_MS[request.timeframe] ?? 3_600_000;

  /* Extra headroom so gaps in the warm-up window do not eat into it. */
  const fetchStart = request.startAt - warmupBars * step * 1.5;

  const fetched = await binanceCandles({
    symbol: request.symbol,
    interval: request.timeframe,
    startAt: Math.floor(fetchStart),
    endAt: request.endAt,
  });

  if (!fetched.ok || fetched.data === undefined) {
    return { error: fetched.error?.message ?? "Historical data could not be loaded." };
  }

  const validated = validateCandles(fetched.data, request.timeframe);
  const warnings: string[] = [];

  if (validated.missingBars > 0) {
    warnings.push(
      `${validated.missingBars} bar(s) are missing from the history (${(validated.coverage * 100).toFixed(1)}% coverage). They were not filled in.`,
    );
  }

  if (validated.candles.length <= warmupBars + 50) {
    return {
      error:
        `Not enough history: ${validated.candles.length} bars loaded, but this strategy ` +
        `needs ${warmupBars} for warm-up before it can trade.`,
    };
  }

  return { candles: validated.candles, coverage: validated.coverage, warnings };
}

/** Where the requested period begins within the loaded array. */
function warmupOffset(candles: Candle[], startAt: number, declared: number): number {
  const firstInPeriod = candles.findIndex((candle) => candle.openTime >= startAt);
  /* Whichever is larger: the bars before the requested start, or the warm-up
     the strategy declared. Using the smaller would let a trade open on an
     indicator that has not converged. */
  return Math.max(declared, firstInPeriod === -1 ? declared : firstInPeriod);
}

export async function runOne(
  request: RunRequest,
  options: { robustness?: boolean } = {},
): Promise<RunOutcome> {
  const invalid = validateRequest(request);
  if (invalid !== null) return { ok: false, error: invalid };

  const strategy = getStrategy(request.strategyId)!;
  const params = { ...defaultParams(strategy), ...(request.params ?? {}) };
  const declaredWarmup = strategy.warmupFor(params);

  const loaded = await loadCandles(request, declaredWarmup);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const warmupBars = warmupOffset(loaded.candles, request.startAt, declaredWarmup);
  const config = configFor(request, params);

  try {
    const run = runBacktest({ candles: loaded.candles, config, warmupBars });
    const metrics = computeMetrics(run);
    const quality = assessQuality(run, metrics);

    const robustness = options.robustness === true
      ? assessRobustness({ candles: loaded.candles, config, warmupBars })
      : undefined;

    return {
      ok: true,
      config,
      metrics,
      trades: run.trades,
      equity: run.equity,
      quality,
      robustness,
      warnings: [...loaded.warnings, ...run.warnings],
      barsLoaded: loaded.candles.length,
      coverage: loaded.coverage,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The simulation failed.",
    };
  }
}

/* ---------------------------------------------------------------------------
   Comparison
--------------------------------------------------------------------------- */

/**
 * Runs several strategies over ONE dataset.
 *
 * The candles are fetched once. Fetching per strategy would give each a
 * slightly different window — different warm-up, possibly a different last
 * bar — and the comparison would quietly stop being like-for-like.
 *
 * Deliberately returns no "winner". Ranking by return over one period on one
 * asset is how a backtester gets used as an oracle; the rows carry drawdown,
 * trade count and quality so the reader can weigh them.
 */
export async function compareStrategies(input: {
  symbol: string;
  timeframe: string;
  startAt: number;
  endAt: number;
  strategyIds: string[];
  feeBps?: number;
  slippageBps?: number;
  initialCapitalUsd?: number;
}): Promise<ComparisonResult> {
  const ids = [...new Set(input.strategyIds)].slice(0, MAX_COMPARE);
  if (ids.length === 0) {
    return { ok: false, error: "No strategies to compare.", rows: [], warnings: [] };
  }

  /* The largest warm-up across the set, so one dataset serves them all. */
  let maxWarmup = 0;
  for (const id of ids) {
    const strategy = getStrategy(id);
    if (strategy === null) continue;
    maxWarmup = Math.max(maxWarmup, strategy.warmupFor(defaultParams(strategy)));
  }

  const base: RunRequest = {
    symbol: input.symbol,
    timeframe: input.timeframe,
    startAt: input.startAt,
    endAt: input.endAt,
    strategyId: ids[0],
    feeBps: input.feeBps,
    slippageBps: input.slippageBps,
    initialCapitalUsd: input.initialCapitalUsd,
  };

  const invalid = validateRequest(base);
  if (invalid !== null) return { ok: false, error: invalid, rows: [], warnings: [] };

  const loaded = await loadCandles(base, maxWarmup);
  if ("error" in loaded) return { ok: false, error: loaded.error, rows: [], warnings: [] };

  const warmupBars = warmupOffset(loaded.candles, input.startAt, maxWarmup);
  const rows: ComparisonRow[] = [];

  for (const id of ids) {
    const strategy = getStrategy(id);
    if (strategy === null) {
      rows.push({ strategyId: id, strategyName: id, ok: false, error: "Unknown strategy." });
      continue;
    }

    if (strategy.intradayOnly === true && !isIntraday(input.timeframe)) {
      rows.push({
        strategyId: id,
        strategyName: strategy.name,
        ok: false,
        error: "Needs intraday bars.",
      });
      continue;
    }

    const params = defaultParams(strategy);
    const config = configFor({ ...base, strategyId: id }, params);

    try {
      const run = runBacktest({ candles: loaded.candles, config, warmupBars });
      const metrics = computeMetrics(run);
      const quality = assessQuality(run, metrics);

      rows.push({
        strategyId: id,
        strategyName: strategy.name,
        ok: true,
        totalReturnPct: metrics.totalReturnPct,
        benchmarkReturnPct: metrics.benchmarkReturnPct,
        maxDrawdownPct: metrics.maxDrawdownPct,
        sharpe: metrics.sharpe,
        trades: metrics.trades,
        winRatePct: metrics.winRatePct,
        quality: quality.level,
      });
    } catch (error: unknown) {
      rows.push({
        strategyId: id,
        strategyName: strategy.name,
        ok: false,
        error: error instanceof Error ? error.message : "Simulation failed.",
      });
    }
  }

  return {
    ok: true,
    assumptions: {
      symbol: input.symbol.toUpperCase(),
      timeframe: input.timeframe,
      startAt: new Date(input.startAt).toISOString(),
      endAt: new Date(input.endAt).toISOString(),
      bars: loaded.candles.length - warmupBars,
      coverage: loaded.coverage,
      feeBps: input.feeBps ?? 10,
      slippageBps: input.slippageBps ?? 10,
      initialCapitalUsd: input.initialCapitalUsd ?? 10_000,
    },
    rows,
    warnings: loaded.warnings,
  };
}

/* ---------------------------------------------------------------------------
   Persistence
--------------------------------------------------------------------------- */

export async function saveResult(input: {
  userId: string;
  query: string | null;
  outcome: RunOutcome;
}): Promise<string | null> {
  const { outcome } = input;
  if (!outcome.ok || outcome.config === undefined) return null;

  const strategy = getStrategy(outcome.config.strategyId);

  const { data, error } = await serviceClient()
    .from("backtest_results")
    .insert({
      user_id: input.userId,
      query: input.query,
      instrument: outcome.config.instrumentId,
      venue: outcome.config.venue,
      timeframe: outcome.config.timeframe,
      strategy_id: outcome.config.strategyId,
      strategy_version: strategy?.version ?? 1,
      engine_version: ENGINE_VERSION,
      started_at: outcome.config.startAt,
      ended_at: outcome.config.endAt,
      status: "complete",
      config: outcome.config,
      metrics: outcome.metrics,
      trades: outcome.trades,
      equity: outcome.equity,
      robustness: outcome.robustness ?? null,
      quality: outcome.quality?.level ?? null,
      warnings: [...(outcome.warnings ?? []), ...(outcome.quality?.issues ?? [])],
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("[backtest] could not save result:", error?.message ?? "no row");
    return null;
  }
  return data.id;
}

export async function listResults(userId: string, limit = 25): Promise<BacktestRecord[]> {
  /* Explicit columns: the trades and equity arrays are tens of kilobytes and
     a history list never needs them. */
  const { data } = await serviceClient()
    .from("backtest_results")
    .select("id, query, instrument, timeframe, strategy_id, status, status_detail, quality, created_at, metrics")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  return (data ?? []).map((row) => ({
    id: row.id,
    query: row.query,
    instrument: row.instrument,
    timeframe: row.timeframe,
    strategyId: row.strategy_id,
    status: row.status,
    statusDetail: row.status_detail,
    quality: row.quality,
    createdAt: row.created_at,
    metrics: (row.metrics as BacktestMetrics | null) ?? null,
  }));
}

/** One result, for its owner. The user filter IS the ownership boundary. */
export async function getResult(id: string, userId: string): Promise<unknown | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const { data } = await serviceClient()
    .from("backtest_results")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  return data ?? null;
}
