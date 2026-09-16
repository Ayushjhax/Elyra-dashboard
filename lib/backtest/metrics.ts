import { INTERVAL_MS } from "@/lib/backtest/candles";
import type { BacktestRun, Trade } from "@/lib/backtest/engine";

/* ---------------------------------------------------------------------------
   Metrics.

   ── Crypto does not have 252 trading days ──────────────────────────────

   The 252 in every finance textbook is the number of days a US equity market
   is open. Crypto trades continuously, so annualising a crypto Sharpe with
   252 understates volatility by about 20% and inflates the ratio accordingly.
   Everything here annualises on a 365-day year, and the periods-per-year
   figure is derived from the bar interval rather than assumed.

   ── Null where the statistic is meaningless ────────────────────────────

   A Sharpe ratio over eleven bars is a number, not a measurement. A CAGR over
   three weeks is an extrapolation with no basis. A profit factor with no
   losing trades is infinity. Each of these returns null, because printing the
   number invites someone to compare it with a real one.

   Pure — directly testable.
--------------------------------------------------------------------------- */

/** Crypto trades every day. Not 252. */
const DAYS_PER_YEAR = 365;

/** Below this, a risk statistic describes noise. */
const MIN_SAMPLES_FOR_RISK = 30;

/** Below this, trade statistics are not a distribution. */
const MIN_TRADES_FOR_STATS = 5;

export interface BacktestMetrics {
  initialCapital: number;
  endingEquity: number;
  totalReturnPct: number;
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;

  /** Null for periods too short to annualise honestly. */
  cagrPct: number | null;
  annualisedVolatilityPct: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdownPct: number;
  calmar: number | null;

  trades: number;
  winRatePct: number | null;
  profitFactor: number | null;
  expectancyUsd: number | null;
  averageTradeUsd: number | null;
  averageWinUsd: number | null;
  averageLossUsd: number | null;
  largestWinUsd: number | null;
  largestLossUsd: number | null;
  averageBarsHeld: number | null;
  /** Fraction of bars holding a position, 0–100. */
  exposurePct: number;

  totalFees: number;
  totalSlippage: number;
  totalFunding: number;

  /** Why a statistic is null, where one is. */
  notes: string[];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  /* Sample standard deviation: these are observed returns from a longer
     process, not the entire population. */
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** How many bars of this interval fall in a 365-day year. */
export function periodsPerYear(interval: string): number | null {
  const ms = INTERVAL_MS[interval];
  if (ms === undefined || ms <= 0) return null;
  return (DAYS_PER_YEAR * 86_400_000) / ms;
}

export function computeMetrics(run: BacktestRun): BacktestMetrics {
  const notes: string[] = [];

  const initialCapital = run.config.initialCapitalUsd;
  const endingEquity =
    run.equity.length === 0 ? initialCapital : run.equity[run.equity.length - 1].equity;

  const totalReturnPct =
    initialCapital === 0 ? 0 : ((endingEquity - initialCapital) / initialCapital) * 100;

  /* ---- Bar-to-bar returns, the basis of every risk statistic ---- */
  const returns: number[] = [];
  for (let i = 1; i < run.equity.length; i += 1) {
    const previous = run.equity[i - 1].equity;
    if (previous <= 0) continue;
    returns.push((run.equity[i].equity - previous) / previous);
  }

  const bars = periodsPerYear(run.config.timeframe);

  let annualisedVolatilityPct: number | null = null;
  let sharpe: number | null = null;
  let sortino: number | null = null;

  if (returns.length < MIN_SAMPLES_FOR_RISK) {
    notes.push(
      `Risk statistics are unavailable: ${returns.length} return observations is too few to be meaningful (minimum ${MIN_SAMPLES_FOR_RISK}).`,
    );
  } else if (bars === null) {
    notes.push(`Risk statistics are unavailable: unknown timeframe "${run.config.timeframe}".`);
  } else {
    const periodMean = mean(returns);
    const periodStd = stdDev(returns);
    const scale = Math.sqrt(bars);

    annualisedVolatilityPct = periodStd * scale * 100;

    /* Excess return over a zero risk-free rate, stated rather than implied.
       A non-zero rate would need a rate series for the period. */
    sharpe = periodStd === 0 ? null : (periodMean / periodStd) * scale;
    if (periodStd === 0) {
      notes.push("Sharpe is unavailable: the equity curve had zero variance.");
    }

    const downside = returns.filter((value) => value < 0);
    if (downside.length < 2) {
      notes.push("Sortino is unavailable: too few losing periods to measure downside risk.");
    } else {
      const downsideDeviation = Math.sqrt(
        downside.reduce((sum, value) => sum + value ** 2, 0) / downside.length,
      );
      sortino = downsideDeviation === 0 ? null : (periodMean / downsideDeviation) * scale;
    }
  }

  /* ---- Drawdown ---- */
  let maxDrawdownPct = 0;
  for (const point of run.equity) {
    if (point.peak <= 0) continue;
    const drawdown = ((point.peak - point.equity) / point.peak) * 100;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdown);
  }

  /* ---- CAGR ---- */
  let cagrPct: number | null = null;
  const spanMs =
    run.equity.length < 2
      ? 0
      : run.equity[run.equity.length - 1].time - run.equity[0].time;
  const years = spanMs / (DAYS_PER_YEAR * 86_400_000);

  if (years < 0.25) {
    /* Annualising a three-week result multiplies noise by seventeen. */
    notes.push(
      `CAGR is unavailable: the period is ${(years * 12).toFixed(1)} months, too short to annualise meaningfully.`,
    );
  } else if (initialCapital <= 0 || endingEquity <= 0) {
    notes.push("CAGR is unavailable: equity reached zero.");
  } else {
    cagrPct = ((endingEquity / initialCapital) ** (1 / years) - 1) * 100;
  }

  const calmar =
    cagrPct === null || maxDrawdownPct === 0 ? null : cagrPct / maxDrawdownPct;
  if (calmar === null && cagrPct !== null && maxDrawdownPct === 0) {
    notes.push("Calmar is unavailable: there was no drawdown to divide by.");
  }

  /* ---- Trades ---- */
  const trades: Trade[] = run.trades;
  const wins = trades.filter((trade) => trade.netPnl > 0);
  const losses = trades.filter((trade) => trade.netPnl < 0);

  const grossProfit = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnl, 0));

  let profitFactor: number | null = null;
  if (trades.length < MIN_TRADES_FOR_STATS) {
    notes.push(
      `Trade statistics are weak: ${trades.length} trade(s) is too few to describe a distribution (minimum ${MIN_TRADES_FOR_STATS}).`,
    );
  }
  if (grossLoss === 0) {
    if (trades.length > 0) {
      notes.push("Profit factor is unavailable: there were no losing trades to divide by.");
    }
  } else {
    profitFactor = grossProfit / grossLoss;
  }

  const exposureBars = trades.reduce((sum, trade) => sum + trade.barsHeld, 0);

  return {
    initialCapital,
    endingEquity,
    totalReturnPct,
    benchmarkReturnPct: run.benchmarkReturnPct,
    excessReturnPct:
      run.benchmarkReturnPct === null ? null : totalReturnPct - run.benchmarkReturnPct,

    cagrPct,
    annualisedVolatilityPct,
    sharpe,
    sortino,
    maxDrawdownPct,
    calmar,

    trades: trades.length,
    winRatePct: trades.length === 0 ? null : (wins.length / trades.length) * 100,
    profitFactor,
    expectancyUsd:
      trades.length === 0
        ? null
        : trades.reduce((sum, trade) => sum + trade.netPnl, 0) / trades.length,
    averageTradeUsd:
      trades.length === 0 ? null : mean(trades.map((trade) => trade.netPnl)),
    averageWinUsd: wins.length === 0 ? null : mean(wins.map((trade) => trade.netPnl)),
    averageLossUsd: losses.length === 0 ? null : mean(losses.map((trade) => trade.netPnl)),
    largestWinUsd:
      wins.length === 0 ? null : Math.max(...wins.map((trade) => trade.netPnl)),
    largestLossUsd:
      losses.length === 0 ? null : Math.min(...losses.map((trade) => trade.netPnl)),
    averageBarsHeld:
      trades.length === 0 ? null : mean(trades.map((trade) => trade.barsHeld)),
    exposurePct:
      run.barsSimulated === 0 ? 0 : Math.min(100, (exposureBars / run.barsSimulated) * 100),

    totalFees: run.totalFees,
    totalSlippage: run.totalSlippage,
    totalFunding: run.totalFunding,

    notes,
  };
}

/* ---------------------------------------------------------------------------
   Quality
--------------------------------------------------------------------------- */

export type QualityLevel =
  | "insufficient_data"
  | "insufficient_trades"
  | "valid"
  | "valid_with_warnings";

export interface QualityAssessment {
  level: QualityLevel;
  /** Everything wrong or worth caveating, written for a person. */
  issues: string[];
}

/**
 * Whether a result should be believed.
 *
 * Deliberately NOT a 0–100 score. A score implies a measurement and invites
 * comparison between runs whose problems are not commensurable — "72" tells
 * you nothing about whether the issue was three trades or a missing month of
 * data.
 */
export function assessQuality(
  run: BacktestRun,
  metrics: BacktestMetrics,
): QualityAssessment {
  const issues: string[] = [...run.warnings];

  if (run.barsSimulated < 100) {
    issues.push(
      `Only ${run.barsSimulated} bars were simulated. That is too little history to draw a conclusion from.`,
    );
    return { level: "insufficient_data", issues };
  }

  if (metrics.trades === 0) {
    issues.push("The strategy produced no trades over this period.");
    return { level: "insufficient_trades", issues };
  }

  if (metrics.trades < MIN_TRADES_FOR_STATS) {
    issues.push(
      `${metrics.trades} trade(s) is too few to distinguish skill from chance.`,
    );
    return { level: "insufficient_trades", issues };
  }

  issues.push(...metrics.notes);

  /* A strategy holding a position almost always is closer to buy-and-hold
     than to a trading system, and its outperformance should be read that way. */
  if (metrics.exposurePct > 95) {
    issues.push(
      `The strategy held a position ${metrics.exposurePct.toFixed(0)}% of the time — this is close to buy-and-hold.`,
    );
  }

  if (metrics.totalFees + metrics.totalSlippage > Math.abs(metrics.endingEquity - metrics.initialCapital)) {
    issues.push(
      "Costs exceeded the net result — the outcome is dominated by fees and slippage rather than by the signal.",
    );
  }

  return { level: issues.length > 0 ? "valid_with_warnings" : "valid", issues };
}
