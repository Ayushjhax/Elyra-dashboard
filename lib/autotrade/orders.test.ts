import { describe, expect, it } from "vitest";
import { analysePaperTrades, leverageBand, MIN_SAMPLE, type ClosedTrade } from "@/lib/autotrade/analysis";
import { paperLimitFill, validateLimitOrder } from "@/lib/autotrade/orders";
import { dexOf, marketFor } from "@/lib/autotrade/rules";

const LONG = { coin: "btc", side: "long", price: 95, sizeUsd: 100, leverage: 2, takeProfit: 105, stopLoss: 90, mode: "paper" };

describe("markets", () => {
  it("finds a market whatever its case, and knows which exchange it is on", () => {
    expect(marketFor("kpepe")?.coin).toBe("kPEPE");
    expect(marketFor("XYZ:nvda")?.coin).toBe("xyz:NVDA");
    expect(marketFor("PEPE")).toBeNull();
    expect(dexOf("xyz:NVDA")).toBe("xyz");
    expect(dexOf("BTC")).toBeNull();
  });
});

describe("validateLimitOrder", () => {
  it("accepts a long below the market with its stop below and target above", () => {
    expect(validateLimitOrder(LONG, 100)).toEqual({ order: { ...LONG, coin: "BTC", side: "long", mode: "paper" } });
  });

  it("accepts a short above the market with its target below and stop above", () => {
    const short = { ...LONG, side: "short", price: 105, takeProfit: 95, stopLoss: 110 };
    expect(validateLimitOrder(short, 100)).toMatchObject({ order: { side: "short", price: 105 } });
  });

  it("refuses a level on the wrong side of the market, saying where the market is", () => {
    expect(validateLimitOrder({ ...LONG, price: 101, takeProfit: 110, stopLoss: 95 }, 100)).toMatchObject({ error: expect.stringMatching(/\$100.*below/) });
    expect(validateLimitOrder({ ...LONG, side: "short", price: 99, takeProfit: 90, stopLoss: 105 }, 100)).toMatchObject({ error: expect.stringMatching(/above/) });
  });

  it("refuses exits on the wrong side of the entry", () => {
    expect(validateLimitOrder({ ...LONG, takeProfit: 90, stopLoss: 105 }, 100)).toMatchObject({ error: expect.stringMatching(/stop-loss must be below/) });
  });

  it("refuses a stop the position would be liquidated before, a level far from the market, and no price at all", () => {
    expect(validateLimitOrder({ ...LONG, leverage: 5, stopLoss: 70 }, 100)).toMatchObject({ error: expect.stringMatching(/liquidated/) });
    expect(validateLimitOrder({ ...LONG, price: 40, stopLoss: 39, takeProfit: 60 }, 100)).toMatchObject({ error: expect.stringMatching(/50%/) });
    expect(validateLimitOrder(LONG, null)).toMatchObject({ error: expect.stringMatching(/no live price/) });
  });

  it("holds size and leverage to the limits, and refuses unknown markets", () => {
    expect(validateLimitOrder({ ...LONG, sizeUsd: 5 }, 100)).toMatchObject({ error: expect.stringMatching(/Size/) });
    expect(validateLimitOrder({ ...LONG, leverage: 10 }, 100)).toMatchObject({ error: expect.stringMatching(/Leverage/) });
    expect(validateLimitOrder({ ...LONG, coin: "PEPE" }, 100)).toMatchObject({ error: expect.stringMatching(/markets/) });
  });
});

describe("paperLimitFill", () => {
  const bars = [
    { closeTime: 1_000, low: 90, high: 110 },
    { closeTime: 2_000, low: 96, high: 99 },
    { closeTime: 3_000, low: 94, high: 98 },
  ];

  it("fills a long when a bar after the order trades down to it, ignoring bars before it", () => {
    expect(paperLimitFill({ side: "long", price: 95, createdAt: 1_500 }, bars)).toBe(bars[2]);
    expect(paperLimitFill({ side: "long", price: 93, createdAt: 1_500 }, bars)).toBeNull();
  });

  it("fills a short when a bar trades up to it", () => {
    expect(paperLimitFill({ side: "short", price: 98.5, createdAt: 1_500 }, bars)).toBe(bars[1]);
  });
});

describe("analysePaperTrades", () => {
  function trade(pnlUsd: number, overrides: Partial<ClosedTrade> = {}): ClosedTrade {
    return { side: "long", leverage: 2, coin: "BTC", pnlUsd, exitReason: pnlUsd > 0 ? "take_profit" : "stop_loss", openedAt: "2026-11-10T09:00:00Z", closedAt: "2026-11-10T10:00:00Z", ...overrides };
  }

  it("computes the real win rate, net result, profit factor and hold time", () => {
    const result = analysePaperTrades([trade(10), trade(10), trade(-5), trade(-5)]);
    expect(result.overall).toMatchObject({ trades: 4, wins: 2, losses: 2, winRate: 50, netPnlUsd: 10, profitFactor: 2, avgWinUsd: 10, avgLossUsd: -5, avgHoldMinutes: 60 });
    expect(result.smallSample).toBe(true);
  });

  it("bands leverage, splits long against short, and buckets entries into four-hour UTC windows", () => {
    expect([1, 2, 3, 4, 5, null].map(leverageBand)).toEqual(["1x", "2x", "3x", "4-5x", "4-5x", "unknown"]);
    const result = analysePaperTrades([trade(5, { side: "short", leverage: 5, openedAt: "2026-11-10T22:30:00Z" }), trade(-3)]);
    expect(result.bySide.map((group) => [group.key, group.trades])).toEqual([["long", 1], ["short", 1]]);
    expect(result.byLeverage.map((group) => group.key)).toEqual(["2x", "4-5x"]);
    expect(result.byWindow.map((group) => group.label)).toEqual(["08:00–12:00 UTC", "20:00–24:00 UTC"]);
  });

  it(`names a sharpest window and paying or bleeding leverage only with ${MIN_SAMPLE} trades behind it`, () => {
    const few = analysePaperTrades([trade(10), trade(10)]);
    expect(few.sharpestWindow).toBeNull();
    expect(few.bestLeverage).toBeNull();

    const morning = Array.from({ length: MIN_SAMPLE }, () => trade(4));
    const night = Array.from({ length: MIN_SAMPLE }, () => trade(-6, { leverage: 5, openedAt: "2026-11-10T02:00:00Z" }));
    const result = analysePaperTrades([...morning, ...night]);
    expect(result.sharpestWindow?.label).toBe("08:00–12:00 UTC");
    expect(result.bestLeverage?.key).toBe("2x");
    expect(result.worstLeverage?.key).toBe("4-5x");
  });
});
