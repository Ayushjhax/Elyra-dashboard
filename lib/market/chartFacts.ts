import { nearestLevels, type PivotLevels } from "@/lib/market/levels";
import { INTERVAL_MS, type Candle, type SourceId } from "@/lib/market/types";
import type { Interval } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The figures the chart's legend and the decision brief both show, so the
   two can never disagree:

   - the last COMPLETED candle's close at the chart's interval — never the
     candle still forming, whose "close" is just the latest trade;
   - the EMA 20 of those completed closes, the same study the chart draws;
   - the pivot level nearest the live quote.

   Every relationship is computed here from the numbers, never written by
   hand: "R1 is 0.08% below the live quote" is `distance(r1, quote)`.

   Pure, so it is tested directly with the brief's own figures.
--------------------------------------------------------------------------- */

/** The chart's EMA study and this one share a period (lib/market/chartWidget.ts). */
export const EMA_PERIOD = 20;

/** Candles whose interval has fully closed by `now`, oldest first. */
export function completedCandles(candles: readonly Candle[], interval: Interval, now: number): Candle[] {
  const span = INTERVAL_MS[interval];
  return [...candles]
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
    .sort((a, b) => a.openTime - b.openTime)
    .filter((candle) => candle.openTime + span <= now);
}

/**
 * The exponential moving average of `values` (oldest first) over `period`,
 * seeded with the simple average of the first `period` values. Null with
 * fewer than `period` values: a 20-period average of 11 closes is not one.
 */
export function ema(values: readonly number[], period: number): number | null {
  if (period < 1 || values.length < period) return null;
  const alpha = 2 / (period + 1);
  let value = values.slice(0, period).reduce((sum, close) => sum + close, 0) / period;
  for (let index = period; index < values.length; index += 1) {
    value = alpha * values[index] + (1 - alpha) * value;
  }
  return value;
}

export interface ChartFacts {
  /** The last completed candle: its close, and when it opened (epoch ms). */
  close: { value: number; openTime: number } | null;
  /** EMA `EMA_PERIOD` of the completed closes, as of that candle. */
  ema: number | null;
}

export function chartFacts(candles: readonly Candle[], interval: Interval, now: number): ChartFacts {
  const done = completedCandles(candles, interval, now);
  const last = done.at(-1);
  return {
    close: last === undefined ? null : { value: last.close, openTime: last.openTime },
    ema: ema(
      done.map((candle) => candle.close),
      EMA_PERIOD,
    ),
  };
}

/**
 * Where `subject` sits against `reference`: the gap as a percentage of the
 * reference, and in price. Negative means below.
 */
export function distance(subject: number, reference: number): { pct: number; diff: number } {
  return { pct: ((subject - reference) / reference) * 100, diff: subject - reference };
}

/** A distance as words read: "0.08", unsigned, at two places. */
export function pctText(pct: number): string {
  return Math.abs(pct).toFixed(2);
}

export interface NearestLevel {
  /** "S2", "S1", "Pivot", "R1" or "R2". */
  name: string;
  value: number;
  /** The level against the quote, as a percentage of the quote. */
  pct: number;
}

/** The one prior-day pivot nearest the quote, above or below it. */
export function nearestLevel(levels: PivotLevels, price: number): NearestLevel | null {
  const { above, below } = nearestLevels(levels, price);
  if (above === null) return below;
  if (below === null) return above;
  return Math.abs(above.pct) <= Math.abs(below.pct) ? above : below;
}

/** When the next candle at `interval` closes after the one that opened at `openTime`. */
export function nextCloseAt(openTime: number, interval: Interval): number {
  return openTime + 2 * INTERVAL_MS[interval];
}

/** GET /api/market/legend — shared by the route and the website's hook. */
export interface LegendResponse extends ChartFacts {
  symbol: string;
  interval: Interval;
  period: number;
  /** The exchange whose candles these are, or null when none answered. */
  source: SourceId | null;
  error: string | null;
}

/** Each candle source's own name, untranslated. */
export const CANDLE_SOURCE_NAME: Record<SourceId, string> = {
  binance: "Binance",
  okx: "OKX",
  hyperliquid: "Hyperliquid",
};

/** "1h", "4h", "1d": the interval as the chart's toolbar writes it. */
export function intervalLabel(interval: Interval): string {
  return interval.toLowerCase();
}
