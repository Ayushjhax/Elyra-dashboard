import { describe, expect, it } from "vitest";
import {
  atr,
  downsample,
  rsi,
  sma,
  summarise,
} from "@/lib/market/indicators";
import type { Candle } from "@/lib/market/types";

const HOUR = 3_600_000;

/** Candles from closes, with a plausible high/low band around each. */
function fromCloses(closes: number[], spread = 0.5): Candle[] {
  return closes.map((close, index) => ({
    openTime: index * HOUR,
    open: index === 0 ? close : closes[index - 1],
    high: close + spread,
    low: close - spread,
    close,
    volume: 100,
  }));
}

describe("sma", () => {
  it("averages the last n closes, ignoring earlier ones", () => {
    const candles = fromCloses([1, 2, 3, 10, 20, 30]);
    expect(sma(candles, 3)).toBeCloseTo(20, 10);
  });

  it("returns null rather than a shorter average", () => {
    /* A 20-period average of 11 candles is not a 20-period average, and the
       agent is required to say what it does not have. */
    expect(sma(fromCloses([1, 2, 3]), 20)).toBeNull();
  });

  it("computes across exactly enough candles", () => {
    expect(sma(fromCloses([2, 4, 6]), 3)).toBeCloseTo(4, 10);
  });
});

describe("rsi", () => {
  it("matches Wilder's worked example", () => {
    /* The canonical 15-close series. With exactly period+1 closes the result
       is the seed average alone, before any smoothing iteration runs. */
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08,
      45.89, 46.03, 45.61, 46.28, 46.28,
    ];
    expect(rsi(fromCloses(closes), 14)).toBeCloseTo(70.46, 1);
  });

  it("is 100 when nothing fell", () => {
    const rising = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(rsi(fromCloses(rising), 14)).toBe(100);
  });

  it("is 50 on a flat series rather than dividing by zero", () => {
    const flat = Array.from({ length: 20 }, () => 100);
    expect(rsi(fromCloses(flat), 14)).toBe(50);
  });

  it("returns null below period + 1 closes", () => {
    expect(rsi(fromCloses([1, 2, 3]), 14)).toBeNull();
  });

  it("smooths past the seed window", () => {
    /* More candles than period+1 exercises the Wilder smoothing loop; a
       simple mean would give a different, more jagged number. */
    const closes = Array.from({ length: 40 }, (_, i) =>
      100 + Math.sin(i / 3) * 5,
    );
    const value = rsi(fromCloses(closes), 14);
    expect(value).not.toBeNull();
    expect(value as number).toBeGreaterThan(0);
    expect(value as number).toBeLessThan(100);
  });
});

describe("atr", () => {
  it("averages true range over the seed window", () => {
    /* Every candle spans exactly 2.0 and closes at its midpoint, so each true
       range is 2.0 and the average must be too. */
    const candles = Array.from({ length: 20 }, (_, index) => ({
      openTime: index * HOUR,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1,
    }));
    expect(atr(candles, 14)).toBeCloseTo(2, 10);
  });

  it("accounts for gaps against the previous close", () => {
    /* A candle that opens far above the prior close has a true range larger
       than its own high-low span. Ignoring that understates volatility.
       Here the span is 2, but |high - prevClose| is 21, so 21 wins. */
    const candles: Candle[] = [
      { openTime: 0, open: 100, high: 101, low: 99, close: 100, volume: 1 },
      { openTime: HOUR, open: 120, high: 121, low: 119, close: 120, volume: 1 },
    ];
    expect(atr(candles, 1)).toBeCloseTo(21, 10);
  });

  it("returns null below period + 1 candles", () => {
    expect(atr(fromCloses([1, 2, 3]), 14)).toBeNull();
  });
});

describe("downsample", () => {
  it("returns everything when already under the target", () => {
    const candles = fromCloses([1, 2, 3]);
    expect(downsample(candles, 20)).toHaveLength(3);
  });

  it("hits the target length exactly", () => {
    expect(downsample(fromCloses(Array.from({ length: 500 }, (_, i) => i)), 20))
      .toHaveLength(20);
  });

  it("keeps the first and last candle", () => {
    /* Taking the last N instead would hide the start of the window, which is
       what a question about a whole session is asking about. */
    const candles = fromCloses(Array.from({ length: 500 }, (_, i) => i));
    const sampled = downsample(candles, 20);
    expect(sampled[0].openTime).toBe(candles[0].openTime);
    expect(sampled[19].openTime).toBe(candles[499].openTime);
  });
});

describe("summarise", () => {
  const candles = fromCloses(Array.from({ length: 200 }, (_, i) => 100 + i));

  it("returns at most 20 candles regardless of input size", () => {
    /* The whole point of this module: 200 candles of JSON would be thousands
       of tokens, and the model does arithmetic on them badly. */
    expect(summarise("SOL", "1H", candles)?.candles).toHaveLength(20);
  });

  it("reports the window extremes with the timestamps they printed", () => {
    const summary = summarise("SOL", "1H", candles);
    expect(summary?.rangeHigh.price).toBeCloseTo(299.5, 10);
    expect(summary?.rangeHigh.at).toBe(new Date(199 * HOUR).toISOString());
    expect(summary?.rangeLow.price).toBeCloseTo(99.5, 10);
  });

  it("reports volume against its 20-period average", () => {
    const summary = summarise("SOL", "1H", candles);
    expect(summary?.volume.average20).toBeCloseTo(100, 10);
    expect(summary?.volume.ratioToAverage).toBeCloseTo(1, 10);
  });

  it("nulls the indicators it lacks history for", () => {
    const short = fromCloses([1, 2, 3]);
    const summary = summarise("SOL", "1H", short);
    expect(summary?.sma20).toBeNull();
    expect(summary?.sma50).toBeNull();
    expect(summary?.rsi14).toBeNull();
    expect(summary?.volume.average20).toBeNull();
    /* The window itself is still reportable from three candles. */
    expect(summary?.window.close).toBe(3);
  });

  it("returns null on no candles at all", () => {
    expect(summarise("SOL", "1H", [])).toBeNull();
  });
});
