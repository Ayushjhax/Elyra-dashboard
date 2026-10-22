import type { Candle } from "@/lib/backtest/intervals";
import { getStrategy, type StrategyDefinition } from "@/lib/backtest/strategies";

/* ---------------------------------------------------------------------------
   The simulation.

   ── The one rule everything else serves ────────────────────────────────

   A signal computed from bar i's CLOSE is executed at bar i+1's OPEN.

   That single constraint is what separates a backtest from a fantasy. The
   tempting alternative — signal on close, fill at that same close — is
   physically impossible: the close is only known once the bar has ended, so
   filling at it means trading in the past. It is also almost undetectable in
   the output, because the equity curve looks merely good rather than absurd.

   `SIGNAL_INDEX_OFFSET` below is that rule, expressed once.

   ── Determinism ────────────────────────────────────────────────────────

   No clock, no randomness, no floating-point ordering surprises. The same
   candles and the same config produce byte-identical trades, which is what
   makes a stored result still meaningful next month.

   Pure — no I/O, no `server-only` — so the whole thing is directly testable.
--------------------------------------------------------------------------- */

/** Bumped when a change would alter results for an unchanged config. */
export const ENGINE_VERSION = "1.0.0";

/**
 * Signals act on the NEXT bar. Not configurable, because the alternative is
 * lookahead and there is no legitimate reason to want it.
 */
const SIGNAL_INDEX_OFFSET = 1;

export type Direction = "long_only" | "short_only" | "long_short";

export interface ExecutionConfig {
  /** Only `bar_close` exists: a signal cannot be known mid-bar. */
  signalTiming: "bar_close";
  entryExecution: "next_bar_open" | "next_bar_close";
  exitExecution: "next_bar_open" | "next_bar_close";
  feeBps: number;
  slippageBps: number;
  fundingMode?: "ignore" | "historical";
  maxLeverage?: number;
}

export interface BacktestConfig {
  instrumentId: string;
  venue: string;
  timeframe: string;
  startAt: string;
  endAt: string;
  initialCapitalUsd: number;
  strategyId: string;
  params: Record<string, number>;
  direction: Direction;
  /** Fraction of equity committed per trade, 0–1. */
  positionFraction: number;
  execution: ExecutionConfig;
}

export interface Trade {
  direction: "long" | "short";
  entryTime: number;
  exitTime: number | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  grossPnl: number;
  fees: number;
  slippage: number;
  funding: number;
  netPnl: number;
  returnPct: number;
  barsHeld: number;
  entryReason: string;
  exitReason: string;
}

export interface EquityPoint {
  time: number;
  equity: number;
  /** Peak equity to date, for the drawdown curve. */
  peak: number;
}

export interface BacktestRun {
  engineVersion: string;
  strategyId: string;
  strategyVersion: number;
  config: BacktestConfig;
  trades: Trade[];
  equity: EquityPoint[];
  /** Bars actually simulated, excluding warm-up. */
  barsSimulated: number;
  warmupBars: number;
  /** Buy-and-hold on the same bars, same costs. */
  benchmarkReturnPct: number | null;
  totalFees: number;
  totalSlippage: number;
  totalFunding: number;
  warnings: string[];
}

export class BacktestError extends Error {}

/** Applies slippage against the trader, in both directions. */
function slip(price: number, bps: number, side: "buy" | "sell"): number {
  const factor = bps / 10_000;
  /* Slippage always hurts. Modelling it as symmetric noise would let it
     cancel out over many trades and quietly restore a frictionless result. */
  return side === "buy" ? price * (1 + factor) : price * (1 - factor);
}

function feeOn(notional: number, bps: number): number {
  return Math.abs(notional) * (bps / 10_000);
}

/**
 * Runs the simulation.
 *
 * `candles` must already include warm-up bars at the front; `warmupBars` says
 * how many. Indicators are computed over the WHOLE array so their state is
 * correct, but no trade may open before the warm-up boundary — otherwise the
 * first trades run on an indicator that has not converged.
 */
export function runBacktest(input: {
  candles: Candle[];
  config: BacktestConfig;
  warmupBars: number;
}): BacktestRun {
  const { candles, config, warmupBars } = input;

  const strategy: StrategyDefinition | null = getStrategy(config.strategyId);
  if (strategy === null) {
    throw new BacktestError(`Unknown strategy "${config.strategyId}".`);
  }

  if (config.direction !== "long_only") {
    /* Shorting needs a borrow model or a perpetual venue with funding and
       liquidation. Neither exists here, and simulating shorts without them
       produces returns nobody could have earned. */
    throw new BacktestError(
      "Only long-only backtests are supported. Short simulation needs a borrow " +
        "or perpetual margin model, including funding and liquidation, which is not implemented.",
    );
  }

  const leverage = config.execution.maxLeverage ?? 1;
  if (leverage > 1) {
    throw new BacktestError(
      "Leverage above 1x is disabled. Simulating leverage without liquidation " +
        "mechanics reports returns that a real position would not have survived.",
    );
  }

  if (candles.length <= warmupBars + 2) {
    throw new BacktestError(
      `Not enough history: ${candles.length} bars with ${warmupBars} needed for warm-up.`,
    );
  }

  const warnings: string[] = [];

  if (strategy.requiresVolume && candles.some((candle) => candle.volume <= 0)) {
    warnings.push(
      "Some bars report zero volume, which this strategy depends on. Its signals may be unreliable in those periods.",
    );
  }

  if (config.execution.feeBps <= 0 && config.execution.slippageBps <= 0) {
    /* A zero-cost backtest is a well-known way to make any strategy look
       profitable. Stated rather than silently allowed. */
    warnings.push(
      "This run assumes zero fees and zero slippage. Real results would be worse.",
    );
  }

  if (config.execution.fundingMode !== "historical") {
    warnings.push("Funding is excluded from this simulation.");
  }

  /* Signals over the full series, so indicator state is correct through the
     warm-up. Trading is gated below, not here. */
  const signals = strategy.evaluate(candles, config.params);

  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];

  let cash = config.initialCapitalUsd;
  let position: {
    quantity: number;
    entryPrice: number;
    entryTime: number;
    entryIndex: number;
    entryReason: string;
    entryFees: number;
    entrySlippage: number;
  } | null = null;

  let peak = config.initialCapitalUsd;
  let totalFees = 0;
  let totalSlippage = 0;

  /* The first bar that may TRADE. Signals before this are read for indicator
     state only. */
  const firstTradableIndex = Math.max(warmupBars, 1);

  for (let i = firstTradableIndex; i < candles.length; i += 1) {
    const bar = candles[i];

    /* ---- The no-lookahead boundary ----

       The signal acted on at bar i was produced by bar i − 1's close. Reading
       `signals[i]` here instead would execute a decision made from data this
       bar has not finished producing. */
    const signalIndex = i - SIGNAL_INDEX_OFFSET;
    const signal = signals[signalIndex];

    if (signal !== undefined && position === null && signal.enterLong) {
      const reference =
        config.execution.entryExecution === "next_bar_open" ? bar.open : bar.close;
      const fillPrice = slip(reference, config.execution.slippageBps, "buy");

      const budget = cash * config.positionFraction;

      /* ---- The fee comes OUT of the budget ----

         Sizing as `budget / price` and charging the fee on top means that at
         100% sizing the trade costs more than the account holds, so it is
         rejected — and the backtest silently produces zero trades whenever
         fees are switched on. Dividing by (1 + feeRate) sizes the position so
         that notional plus fee equals the budget, which is what actually
         happens when someone spends their whole balance. */
      const feeRate = config.execution.feeBps / 10_000;
      const quantity = budget / (fillPrice * (1 + feeRate));

      if (quantity > 0) {
        const notional = quantity * fillPrice;
        const fee = feeOn(notional, config.execution.feeBps);
        const slippageCost = quantity * Math.abs(fillPrice - reference);

        /* Cash can never go negative: there is no margin model here. A
           floating-point epsilon is allowed so an exactly-full-size trade is
           not rejected by a rounding artefact. */
        if (notional + fee <= cash + 1e-9) {
          cash -= notional + fee;
          totalFees += fee;
          totalSlippage += slippageCost;

          position = {
            quantity,
            entryPrice: fillPrice,
            entryTime: bar.openTime,
            entryIndex: i,
            entryReason: signal.reason ?? "Entry signal",
            entryFees: fee,
            entrySlippage: slippageCost,
          };
        }
      }
    } else if (signal !== undefined && position !== null && signal.exitLong) {
      const reference =
        config.execution.exitExecution === "next_bar_open" ? bar.open : bar.close;
      const fillPrice = slip(reference, config.execution.slippageBps, "sell");

      const proceeds = position.quantity * fillPrice;
      const fee = feeOn(proceeds, config.execution.feeBps);
      const slippageCost = position.quantity * Math.abs(reference - fillPrice);

      cash += proceeds - fee;
      totalFees += fee;
      totalSlippage += slippageCost;

      const gross = (fillPrice - position.entryPrice) * position.quantity;
      const fees = position.entryFees + fee;
      const slippageTotal = position.entrySlippage + slippageCost;
      const net = gross - fees;

      trades.push({
        direction: "long",
        entryTime: position.entryTime,
        exitTime: bar.openTime,
        entryPrice: position.entryPrice,
        exitPrice: fillPrice,
        quantity: position.quantity,
        grossPnl: gross,
        fees,
        slippage: slippageTotal,
        funding: 0,
        netPnl: net,
        returnPct:
          position.entryPrice === 0
            ? 0
            : ((fillPrice - position.entryPrice) / position.entryPrice) * 100,
        barsHeld: i - position.entryIndex,
        entryReason: position.entryReason,
        exitReason: signal.reason ?? "Exit signal",
      });

      position = null;
    }

    /* Equity is marked at this bar's close, including any open position. */
    const markToMarket = position === null ? 0 : position.quantity * bar.close;
    const value = cash + markToMarket;
    peak = Math.max(peak, value);
    equity.push({ time: bar.openTime, equity: value, peak });
  }

  /* An open position at the end is closed at the last close, and labelled as
     such. Leaving it open would make the final equity depend on an unrealised
     mark that the trade list does not explain. */
  if (position !== null) {
    const last = candles[candles.length - 1];
    const fillPrice = slip(last.close, config.execution.slippageBps, "sell");
    const proceeds = position.quantity * fillPrice;
    const fee = feeOn(proceeds, config.execution.feeBps);

    cash += proceeds - fee;
    totalFees += fee;

    const gross = (fillPrice - position.entryPrice) * position.quantity;
    const fees = position.entryFees + fee;

    trades.push({
      direction: "long",
      entryTime: position.entryTime,
      exitTime: last.openTime,
      entryPrice: position.entryPrice,
      exitPrice: fillPrice,
      quantity: position.quantity,
      grossPnl: gross,
      fees,
      slippage: position.entrySlippage,
      funding: 0,
      netPnl: gross - fees,
      returnPct:
        position.entryPrice === 0
          ? 0
          : ((fillPrice - position.entryPrice) / position.entryPrice) * 100,
      barsHeld: candles.length - 1 - position.entryIndex,
      entryReason: position.entryReason,
      exitReason: "Position closed at the end of the test period",
    });

    warnings.push(
      "A position was still open at the end of the period and was closed at the final bar's close.",
    );
    position = null;
  }

  /* ---- Benchmark ----

     Buy-and-hold over the SAME tradable bars with the SAME costs. Comparing a
     costed strategy against a frictionless hold flatters the hold. */
  const first = candles[firstTradableIndex];
  const last = candles[candles.length - 1];

  let benchmarkReturnPct: number | null = null;
  if (first !== undefined && last !== undefined && first.open > 0) {
    const buyPrice = slip(first.open, config.execution.slippageBps, "buy");
    const sellPrice = slip(last.close, config.execution.slippageBps, "sell");
    const feeFactor = 1 - config.execution.feeBps / 10_000;
    const gross = (sellPrice / buyPrice) * feeFactor * feeFactor;
    benchmarkReturnPct = (gross - 1) * 100;
  }

  return {
    engineVersion: ENGINE_VERSION,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    config,
    trades,
    equity,
    barsSimulated: candles.length - firstTradableIndex,
    warmupBars,
    benchmarkReturnPct,
    totalFees,
    totalSlippage,
    totalFunding: 0,
    warnings,
  };
}
