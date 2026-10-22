import type { Candle } from "@/lib/market/types";

/* ---------------------------------------------------------------------------
   Candles in, a compact summary out.

   This module is the reason `get_ohlcv_summary` is affordable. Five hundred
   candles of JSON is roughly 20k tokens, and a model asked to compute a mean
   over them does it slowly and often wrongly. Everything here is arithmetic
   the server can do exactly, at a fixed and tiny token cost.

   Every function returns null rather than a partial figure when there is not
   enough history for it — a 20-period average of 11 candles is not a
   20-period average, and the prompt requires the agent to say what it does
   not have rather than fill the gap.
--------------------------------------------------------------------------- */

export interface OhlcvSummary {
  symbol: string;
  interval: string;
  candlesAnalysed: number;
  /** The window as a whole. */
  window: {
    open: number;
    high: number;
    low: number;
    close: number;
    changePct: number;
    from: string;
    to: string;
  };
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  atr14: number | null;
  volume: {
    latest: number;
    average20: number | null;
    /** Latest as a multiple of the 20-period average. */
    ratioToAverage: number | null;
  };
  /** Extremes with the timestamps they printed, which is what gets cited. */
  rangeHigh: { price: number; at: string };
  rangeLow: { price: number; at: string };
  /** At most 20, evenly spaced, so shape survives without the bulk. */
  candles: Array<{
    at: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
}

/** Simple moving average of the last `period` closes. */
export function sma(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  const window = candles.slice(-period);
  const total = window.reduce((sum, candle) => sum + candle.close, 0);
  return total / period;
}

/**
 * Wilder's RSI.
 *
 * The first average is a simple mean of the first `period` changes; every
 * subsequent one smooths with weight 1/period. Using a simple mean throughout
 * is a different and more jagged indicator that does not match what a chart
 * shows, which would make the agent's numbers disagree with the user's screen.
 */
export function rsi(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    changes.push(candles[i].close - candles[i - 1].close);
  }

  let avgGain =
    changes.slice(0, period).reduce((sum, c) => sum + Math.max(c, 0), 0) / period;
  let avgLoss =
    changes.slice(0, period).reduce((sum, c) => sum + Math.max(-c, 0), 0) / period;

  for (let i = period; i < changes.length; i += 1) {
    avgGain = (avgGain * (period - 1) + Math.max(changes[i], 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-changes[i], 0)) / period;
  }

  /* No down moves at all in the window: RSI is 100 by definition, and the
     division below would be by zero. */
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Wilder's ATR over true range. */
export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const previousClose = candles[i - 1].close;
    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previousClose),
        Math.abs(current.low - previousClose),
      ),
    );
  }

  let value = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i += 1) {
    value = (value * (period - 1) + trueRanges[i]) / period;
  }
  return value;
}

/**
 * Evenly spaced sample, always including the first and last candle.
 *
 * Taking the last N instead would hide the start of the window, and the
 * agent is often asked about the shape of a whole session.
 */
export function downsample(candles: Candle[], target: number): Candle[] {
  if (candles.length <= target) return candles;
  if (target <= 1) return candles.slice(-1);

  const step = (candles.length - 1) / (target - 1);
  const sampled: Candle[] = [];
  for (let i = 0; i < target; i += 1) {
    sampled.push(candles[Math.round(i * step)]);
  }
  return sampled;
}

const MAX_RETURNED_CANDLES = 20;

/** Everything above, assembled into what the tool returns. */
export function summarise(
  symbol: string,
  interval: string,
  candles: Candle[],
): OhlcvSummary | null {
  if (candles.length === 0) return null;

  const first = candles[0];
  const last = candles[candles.length - 1];

  let high = candles[0];
  let low = candles[0];
  for (const candle of candles) {
    if (candle.high > high.high) high = candle;
    if (candle.low < low.low) low = candle;
  }

  const average20 =
    candles.length >= 20
      ? candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20
      : null;

  const iso = (ms: number) => new Date(ms).toISOString();

  return {
    symbol,
    interval,
    candlesAnalysed: candles.length,
    window: {
      open: first.open,
      high: high.high,
      low: low.low,
      close: last.close,
      changePct: first.open === 0 ? 0 : (last.close / first.open - 1) * 100,
      from: iso(first.openTime),
      to: iso(last.openTime),
    },
    sma20: sma(candles, 20),
    sma50: sma(candles, 50),
    rsi14: rsi(candles, 14),
    atr14: atr(candles, 14),
    volume: {
      latest: last.volume,
      average20,
      ratioToAverage:
        average20 === null || average20 === 0 ? null : last.volume / average20,
    },
    rangeHigh: { price: high.high, at: iso(high.openTime) },
    rangeLow: { price: low.low, at: iso(low.openTime) },
    candles: downsample(candles, MAX_RETURNED_CANDLES).map((candle) => ({
      at: iso(candle.openTime),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    })),
  };
}
