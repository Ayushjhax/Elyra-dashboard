import type { Candle } from "@/lib/market/types";

/* ---------------------------------------------------------------------------
   Support and resistance, as classic floor-trader pivots.

   Computed from the last COMPLETED daily candle — the one before today's,
   which is still forming and would move the levels all day:

     P  = (high + low + close) / 3
     R1 = 2P − low        S1 = 2P − high
     R2 = P + (high − low) S2 = P − (high − low)

   A standard, deterministic calculation with nothing fitted or predicted: the
   same candle always gives the same levels, and the levels say where the
   prior session's range puts reference points, not where price will go.

   Pure, so it is tested directly.
--------------------------------------------------------------------------- */

export interface PivotLevels {
  s2: number;
  s1: number;
  pivot: number;
  r1: number;
  r2: number;
  /** Open time of the daily candle they come from, epoch ms. */
  basedOn: number;
}

/**
 * Pivots from a series of daily candles, oldest first. Null when there is no
 * completed day to compute from, or its range is empty.
 */
export function pivotLevels(daily: readonly Candle[], now: number = Date.now()): PivotLevels | null {
  const DAY = 86_400_000;
  /* The newest candle whose day has fully closed. */
  const completed = [...daily]
    .sort((a, b) => a.openTime - b.openTime)
    .filter((candle) => candle.openTime + DAY <= now);
  const day = completed.at(-1);
  if (!day) return null;
  const { high, low, close } = day;
  if (!(high > 0 && low > 0 && high >= low && close > 0)) return null;

  const pivot = (high + low + close) / 3;
  const range = high - low;
  return {
    s2: pivot - range,
    s1: 2 * pivot - high,
    pivot,
    r1: 2 * pivot - low,
    r2: pivot + range,
    basedOn: day.openTime,
  };
}

/** The level just above and just below `price`, with their distances in %. */
export function nearestLevels(
  levels: PivotLevels,
  price: number,
): { above: { name: string; value: number; pct: number } | null; below: { name: string; value: number; pct: number } | null } {
  const named: Array<[string, number]> = [
    ["S2", levels.s2],
    ["S1", levels.s1],
    ["Pivot", levels.pivot],
    ["R1", levels.r1],
    ["R2", levels.r2],
  ];
  let above: { name: string; value: number; pct: number } | null = null;
  let below: { name: string; value: number; pct: number } | null = null;
  for (const [name, value] of named) {
    const pct = ((value - price) / price) * 100;
    if (value > price && (above === null || value < above.value)) above = { name, value, pct };
    if (value <= price && (below === null || value > below.value)) below = { name, value, pct };
  }
  return { above, below };
}
