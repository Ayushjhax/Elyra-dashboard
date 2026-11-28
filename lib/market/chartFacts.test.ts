import { describe, expect, it } from "vitest";
import { leadLevel, priceContextLine, signedGap } from "@/lib/market/chartBrief";
import { chartFacts, completedCandles, distance, ema, nearestLevel, nextCloseAt, pctText, type LegendResponse } from "@/lib/market/chartFacts";
import type { PivotLevels } from "@/lib/market/levels";
import type { PriceRow } from "@/lib/market/pyth/types";
import type { Candle } from "@/lib/market/types";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-28T19:19:00Z");
const THIS_HOUR = Date.parse("2026-11-28T19:00:00Z");

const candle = (openTime: number, close: number): Candle => ({ openTime, open: close, high: close, low: close, close, volume: 1 });

/* The brief's own figures: a SOL/USD live quote of $72.1446, a completed 1h
   close of $72.1340, a 1h EMA 20 of $72.1880 and R1 at $72.0833. */
const QUOTE = 72.1446;
const row: PriceRow = {
  id: 1,
  symbol: "SOL",
  price: QUOTE,
  change24hPct: 1.15,
  high24h: 73.93,
  low24h: 70.12,
  volume24h: 186e6,
  confidence: 0.0206,
  emaPrice: 72.1,
  publisherCount: 21,
  marketSession: "regular",
  publishedAt: "2026-11-28T19:18:42.000Z",
};
const levels: PivotLevels = { s2: 67.5, s1: 69.02, pivot: 70.51, r1: 72.0833, r2: 74.6, basedOn: THIS_HOUR - 19 * HOUR - 24 * HOUR };
const facts: LegendResponse = {
  symbol: "SOL",
  interval: "1H",
  period: 20,
  close: { value: 72.134, openTime: THIS_HOUR - HOUR },
  ema: 72.188,
  source: "binance",
  error: null,
};

describe("the chart's candle facts", () => {
  it("reads the last completed candle, never the one still forming", () => {
    const candles = [candle(THIS_HOUR - 2 * HOUR, 71.9), candle(THIS_HOUR - HOUR, 72.134), candle(THIS_HOUR, 72.1446)];
    expect(completedCandles(candles, "1H", NOW).map((c) => c.close)).toEqual([71.9, 72.134]);
    expect(chartFacts(candles, "1H", NOW).close).toEqual({ value: 72.134, openTime: THIS_HOUR - HOUR });
  });

  it("follows the interval: the same candles are all still forming on 4h", () => {
    const fourHour = Date.parse("2026-11-28T16:00:00Z");
    expect(completedCandles([candle(fourHour, 72)], "4H", NOW)).toEqual([]);
    expect(chartFacts([candle(fourHour, 72)], "4H", NOW)).toEqual({ close: null, ema: null });
  });

  it("computes an EMA only with a full period of closes", () => {
    expect(ema([1, 2, 3], 20)).toBeNull();
    expect(ema(Array.from({ length: 20 }, () => 5), 20)).toBe(5);
    /* Seeded with the average of the first 20, then alpha = 2 / 21. */
    const closes = [...Array.from({ length: 20 }, () => 10), 31];
    expect(ema(closes, 20)).toBeCloseTo(12, 10);
  });

  it("orders candles by time before reading them", () => {
    const candles = [candle(THIS_HOUR - HOUR, 2), candle(THIS_HOUR - 2 * HOUR, 1)];
    expect(chartFacts(candles, "1H", NOW).close?.value).toBe(2);
  });

  it("knows when the next candle closes", () => {
    expect(nextCloseAt(THIS_HOUR - HOUR, "1H")).toBe(THIS_HOUR + HOUR);
  });
});

describe("relationships are computed from the figures", () => {
  it("puts R1 0.08% below the live quote", () => {
    const level = nearestLevel(levels, QUOTE);
    expect(level?.name).toBe("R1");
    expect(pctText(level!.pct)).toBe("0.08");
    expect(level!.pct).toBeLessThan(0);
  });

  it("puts the live quote 0.06% below the EMA, $0.0434 under it", () => {
    const { pct, diff } = distance(QUOTE, 72.188);
    expect(pctText(pct)).toBe("0.06");
    expect(signedGap(diff, QUOTE)).toBe("-$0.0434");
  });

  it("chooses the nearer pivot whichever side it is on", () => {
    expect(nearestLevel(levels, 74.5)?.name).toBe("R2");
    expect(nearestLevel(levels, 69.1)?.name).toBe("S1");
  });
});

describe("the decision brief's words", () => {
  it("leads with the nearest level and what an alert on it would watch", () => {
    const lead = leadLevel("SOL", row, levels, false);
    expect(lead).toEqual({
      kind: "ready",
      title: "R1 at $72.0833",
      detail: "0.08% below the live quote.",
      source: "Prior-day pivots",
      target: 72.0833,
      direction: "below",
    });
  });

  it("falls back to the 24h range where there are no pivots", () => {
    const lead = leadLevel("SOL", row, null, false);
    expect(lead.kind === "ready" && lead.title).toBe("24h high at $73.9300");
    expect(lead.kind === "ready" && lead.direction).toBe("above");
  });

  it("names the indicator and the interval when it compares the quote with the EMA", () => {
    const line = priceContextLine("SOL", row, facts, false, "1H", NOW);
    expect(line).toEqual({
      kind: "ready",
      text: "Live quote is below the 1h EMA 20 ($72.1880) by 0.06% (-$0.0434).",
      source: "Pyth quote · Binance 1h candles · just now",
    });
  });

  it("says when there is no EMA rather than borrowing another", () => {
    const none = priceContextLine("AAPL", { ...row, symbol: "AAPL" }, { ...facts, close: null, ema: null, source: null }, false, "4H", NOW);
    expect(none.kind).toBe("unavailable");
    expect(none.kind === "unavailable" && none.text).toContain("No 4h candles for AAPL");
    const young = priceContextLine("SOL", row, { ...facts, ema: null }, false, "1W", NOW);
    expect(young.kind === "unavailable" && young.text).toContain("Fewer than 20 completed 1w candles");
  });

  it("makes no call on direction or trade", () => {
    const words = [leadLevel("SOL", row, levels, false), priceContextLine("SOL", row, facts, false, "1H", NOW)]
      .map((line) => JSON.stringify(line))
      .join(" ");
    expect(words).not.toMatch(/breakout|rejection|bullish|bearish|momentum|consider|entry|buy|sell/i);
  });
});
