import { describe, expect, it } from "vitest";

import {
  ageMs,
  isCrossed,
  isEmpty,
  isOnTick,
  isTwoSided,
  normalizeBook,
  roundToTick,
  type NormalizedBook,
} from "@/lib/prediction/book";
import {
  analyseBook,
  depthOver,
  LiquidityTracker,
  microprice,
  nearestZone,
  TOP_1,
  TOP_5,
  WALL_MIN_OBSERVATIONS,
  WITHIN_2C,
  weightedImbalance,
} from "@/lib/prediction/book-analytics";
import { buildBasket, lastTradeOf, recentVwapOf } from "@/lib/prediction/basket";
import { estimateExecution, estimateExitLadder } from "@/lib/prediction/execution";
import { parseFrame } from "@/lib/prediction/realtime";
import type { PredictionOrderbook, PredictionTrade } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Microstructure tests.

   Hand-computed expectations throughout. A test that recomputes the
   implementation's own formula passes when both are wrong, which for this
   layer is the failure that matters: every number here reaches a screen
   labelled as fact.
--------------------------------------------------------------------------- */

function rawBook(over: Partial<PredictionOrderbook> = {}): PredictionOrderbook {
  return {
    marketId: "0xmarket",
    tokenId: "111",
    bids: [
      { price: 0.61, size: 1_000 },
      { price: 0.6, size: 2_000 },
      { price: 0.59, size: 3_000 },
    ],
    asks: [
      { price: 0.63, size: 500 },
      { price: 0.64, size: 1_500 },
      { price: 0.65, size: 2_500 },
    ],
    midpoint: null,
    spread: null,
    lastTradePrice: 0.62,
    minOrderSize: 5,
    tickSize: 0.01,
    ...over,
  };
}

function book(over: Partial<PredictionOrderbook> = {}, options = {}): NormalizedBook {
  return normalizeBook(rawBook(over), { outcomeLabel: "Yes", ...options });
}

/* ---------------------------------------------------------------------------
   Normalisation
--------------------------------------------------------------------------- */

describe("normalizeBook", () => {
  it("puts the best price first on both sides", () => {
    /* The venue returns both sides with the best price LAST. */
    const normalized = normalizeBook(
      rawBook({
        bids: [
          { price: 0.59, size: 3_000 },
          { price: 0.6, size: 2_000 },
          { price: 0.61, size: 1_000 },
        ],
        asks: [
          { price: 0.65, size: 2_500 },
          { price: 0.64, size: 1_500 },
          { price: 0.63, size: 500 },
        ],
      }),
    );

    expect(normalized.bestBid).toBe(0.61);
    expect(normalized.bestAsk).toBe(0.63);
    expect(normalized.bids[0].price).toBe(0.61);
    expect(normalized.asks[0].price).toBe(0.63);
  });

  it("computes midpoint and spread", () => {
    const normalized = book();
    expect(normalized.midpoint).toBeCloseTo(0.62, 10);
    expect(normalized.spread).toBeCloseTo(0.02, 10);
  });

  it("drops zero-size levels, which are removals rather than orders", () => {
    const normalized = normalizeBook(
      rawBook({
        bids: [
          { price: 0.61, size: 0 },
          { price: 0.6, size: 2_000 },
        ],
      }),
    );
    /* 0.61 would otherwise become a best bid nobody is bidding at. */
    expect(normalized.bestBid).toBe(0.6);
  });

  it("drops prices outside the 0–1 probability domain", () => {
    const normalized = normalizeBook(
      rawBook({ bids: [{ price: 1.2, size: 10 }, { price: 0.6, size: 20 }] }),
    );
    expect(normalized.bestBid).toBe(0.6);
  });

  it("carries notional per level", () => {
    expect(book().bids[0].notional).toBeCloseTo(0.61 * 1_000, 10);
  });

  it("has no midpoint on a one-sided book", () => {
    const normalized = normalizeBook(rawBook({ asks: [] }));
    expect(normalized.midpoint).toBeNull();
    expect(normalized.spread).toBeNull();
    expect(isTwoSided(normalized)).toBe(false);
  });

  it("recognises empty and crossed books", () => {
    expect(isEmpty(normalizeBook(rawBook({ bids: [], asks: [] })))).toBe(true);
    const crossed = normalizeBook(
      rawBook({ bids: [{ price: 0.66, size: 10 }], asks: [{ price: 0.63, size: 10 }] }),
    );
    expect(isCrossed(crossed)).toBe(true);
  });

  it("reports age from the venue's own stamp", () => {
    const at = new Date(Date.now() - 4_000).toISOString();
    expect(ageMs(book({}, { timestamp: at }))).toBeGreaterThanOrEqual(4_000);
  });
});

/* ---------------------------------------------------------------------------
   Tick normalisation
--------------------------------------------------------------------------- */

describe("roundToTick", () => {
  it("rounds an entry up so the price is reachable", () => {
    expect(roundToTick(0.6234, 0.01, "up")).toBe(0.63);
  });

  it("rounds a target down so the reward is not overstated", () => {
    expect(roundToTick(0.6789, 0.01, "down")).toBe(0.67);
  });

  it("leaves a price that is already on the tick alone", () => {
    /* 0.29 / 0.01 is 28.999999999999996 in binary floating point. Without the
       epsilon this floors to 28 and silently moves the price a whole tick. */
    expect(roundToTick(0.29, 0.01, "down")).toBe(0.29);
    expect(roundToTick(0.07, 0.01, "down")).toBe(0.07);
    expect(roundToTick(0.58, 0.01, "up")).toBe(0.58);
  });

  it("produces a clean decimal rather than a float artefact", () => {
    /* 3 * 0.01 is 0.030000000000000002, which reads as a bug on a card. */
    expect(roundToTick(0.0299, 0.01, "up")).toBe(0.03);
    expect(String(roundToTick(0.0299, 0.01, "up"))).toBe("0.03");
  });

  it("honours a finer tick", () => {
    expect(roundToTick(0.6234, 0.001, "up")).toBe(0.624);
    expect(roundToTick(0.6234, 0.001, "down")).toBe(0.623);
  });

  it("stays inside the probability domain", () => {
    expect(roundToTick(1.4, 0.01, "up")).toBe(1);
    expect(roundToTick(-0.2, 0.01, "down")).toBe(0);
  });

  it("recognises an on-tick price", () => {
    expect(isOnTick(0.63, 0.01)).toBe(true);
    expect(isOnTick(0.6321, 0.01)).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
   Depth and imbalance
--------------------------------------------------------------------------- */

describe("depth and imbalance", () => {
  it("sums notional over the top-1 window", () => {
    const reading = depthOver(book(), TOP_1);
    expect(reading.bidUsd).toBeCloseTo(610, 6);
    expect(reading.askUsd).toBeCloseTo(315, 6);
    /* (610 − 315) / 925 = 0.3189… */
    expect(reading.imbalance).toBeCloseTo(0.318918, 5);
  });

  it("sums notional over the top-5 window", () => {
    const reading = depthOver(book(), TOP_5);
    /* 610 + 1200 + 1770 = 3580; 315 + 960 + 1625 = 2900 */
    expect(reading.bidUsd).toBeCloseTo(3_580, 6);
    expect(reading.askUsd).toBeCloseTo(2_900, 6);
    expect(reading.imbalance).toBeCloseTo(680 / 6_480, 6);
  });

  it("measures notional, not shares, so price is respected", () => {
    /* Equal share counts on a 10¢/90¢ market are nine-to-one in money. */
    const skewed = normalizeBook(
      rawBook({
        bids: [{ price: 0.1, size: 1_000 }],
        asks: [{ price: 0.9, size: 1_000 }],
      }),
    );
    const reading = depthOver(skewed, TOP_1);
    expect(reading.bidShares).toBe(reading.askShares);
    expect(reading.imbalance).toBeCloseTo((100 - 900) / 1_000, 6);
  });

  it("windows by price distance from the touch", () => {
    const reading = depthOver(book(), WITHIN_2C);
    /* Bids within 2¢ of 0.61: 0.61, 0.60, 0.59. Asks within 2¢ of 0.63:
       0.63, 0.64, 0.65. */
    expect(reading.bidUsd).toBeCloseTo(3_580, 6);
    expect(reading.askUsd).toBeCloseTo(2_900, 6);
  });

  it("carries the window with the reading", () => {
    expect(depthOver(book(), TOP_5).window).toEqual(TOP_5);
  });

  it("returns a null imbalance rather than zero on an empty book", () => {
    const reading = depthOver(normalizeBook(rawBook({ bids: [], asks: [] })), TOP_5);
    /* Zero would claim balance; null says it could not be measured. */
    expect(reading.imbalance).toBeNull();
  });

  it("discounts distant levels relative to the undiscounted reading", () => {
    const far = normalizeBook(
      rawBook({
        bids: [{ price: 0.61, size: 1_000 }],
        asks: [
          { price: 0.63, size: 10 },
          { price: 0.9, size: 100_000 },
        ],
      }),
    );

    /* Undiscounted, the $90k wall 27 ticks away swamps everything:
       (610 − 90,006) / 90,616 = −0.987. The distance discount pulls that
       back to roughly −0.68. The wall still counts — it is real money — but
       it no longer defines the number on its own. */
    const raw = depthOver(far, { kind: "levels", levels: 10 }).imbalance!;
    const weighted = weightedImbalance(far)!;

    expect(raw).toBeLessThan(-0.95);
    expect(weighted).toBeGreaterThan(raw + 0.2);
  });

  it("is near zero when both sides are balanced at the touch", () => {
    const near = normalizeBook(
      rawBook({
        bids: [{ price: 0.61, size: 1_000 }],
        asks: [{ price: 0.63, size: 1_000 }],
      }),
    );
    expect(Math.abs(weightedImbalance(near)!)).toBeLessThan(0.05);
  });
});

/* ---------------------------------------------------------------------------
   Microprice
--------------------------------------------------------------------------- */

describe("microprice", () => {
  it("weights each price by the OPPOSITE side's size", () => {
    /* bid 0.61 × askSize 500 + ask 0.63 × bidSize 1000, over 1500
       = (305 + 630) / 1500 = 0.6233… — leaning toward the ask, because the
       heavy bid queue means the next trade more likely prints at the ask. */
    expect(microprice(book())).toBeCloseTo(0.623333, 5);
  });

  it("sits above the midpoint when the bid is heavier", () => {
    const value = microprice(book())!;
    expect(value).toBeGreaterThan(book().midpoint!);
  });

  it("sits below the midpoint when the ask is heavier", () => {
    const heavyAsk = normalizeBook(
      rawBook({
        bids: [{ price: 0.61, size: 100 }],
        asks: [{ price: 0.63, size: 5_000 }],
      }),
    );
    expect(microprice(heavyAsk)!).toBeLessThan(heavyAsk.midpoint!);
  });

  it("equals the midpoint when both sides are equal", () => {
    const balanced = normalizeBook(
      rawBook({
        bids: [{ price: 0.61, size: 1_000 }],
        asks: [{ price: 0.63, size: 1_000 }],
      }),
    );
    expect(microprice(balanced)).toBeCloseTo(0.62, 10);
  });

  it("is null on a one-sided or crossed book", () => {
    expect(microprice(normalizeBook(rawBook({ asks: [] })))).toBeNull();
    expect(
      microprice(
        normalizeBook(
          rawBook({ bids: [{ price: 0.66, size: 10 }], asks: [{ price: 0.63, size: 10 }] }),
        ),
      ),
    ).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
   The analytics pass
--------------------------------------------------------------------------- */

describe("analyseBook", () => {
  it("reports spread in points and basis points of the midpoint", () => {
    const analytics = analyseBook(book());
    expect(analytics.spreadPoints).toBeCloseTo(2, 6);
    /* 0.02 / 0.62 × 10,000 = 322.58 bps */
    expect(analytics.spreadBps).toBeCloseTo(322.58, 1);
  });

  it("refuses a midpoint and spread on a crossed book", () => {
    const analytics = analyseBook(
      normalizeBook(
        rawBook({ bids: [{ price: 0.66, size: 10 }], asks: [{ price: 0.63, size: 10 }] }),
      ),
    );
    expect(analytics.crossed).toBe(true);
    /* A negative spread on screen reads as a data-entry error. */
    expect(analytics.spread).toBeNull();
    expect(analytics.midpoint).toBeNull();
  });

  it("finds no walls without a tracker, rather than guessing", () => {
    const analytics = analyseBook(book());
    expect(analytics.bidWalls).toEqual([]);
    expect(analytics.askWalls).toEqual([]);
  });

  it("detects a gap in the ladder", () => {
    const gapped = normalizeBook(
      rawBook({
        asks: [
          { price: 0.63, size: 100 },
          { price: 0.69, size: 100 },
        ],
      }),
    );
    expect(analyseBook(gapped).askVacuumTicks).toBe(6);
  });

  it("reports no vacuum on a contiguous ladder", () => {
    expect(analyseBook(book()).askVacuumTicks).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
   Persistence
--------------------------------------------------------------------------- */

describe("LiquidityTracker", () => {
  it("names no wall until a level has persisted", () => {
    const tracker = new LiquidityTracker();
    const heavy = normalizeBook(
      rawBook({ bids: [{ price: 0.61, size: 50_000 }, { price: 0.6, size: 10 }] }),
    );

    tracker.observe(heavy);
    /* One frame is a screenshot, not support. */
    expect(tracker.walls(heavy, "bid")).toHaveLength(0);

    for (let i = 1; i < WALL_MIN_OBSERVATIONS; i += 1) tracker.observe(heavy);
    expect(tracker.walls(heavy, "bid").length).toBeGreaterThan(0);
    expect(tracker.walls(heavy, "bid")[0].price).toBe(0.61);
    expect(tracker.walls(heavy, "bid")[0].persistenceCount).toBe(WALL_MIN_OBSERVATIONS);
  });

  it("forgets a level that disappears rather than decaying it", () => {
    const tracker = new LiquidityTracker();
    const withWall = normalizeBook(
      rawBook({ bids: [{ price: 0.61, size: 50_000 }, { price: 0.6, size: 10 }] }),
    );
    for (let i = 0; i < 5; i += 1) tracker.observe(withWall);
    expect(tracker.walls(withWall, "bid").length).toBeGreaterThan(0);

    const pulled = normalizeBook(rawBook({ bids: [{ price: 0.6, size: 10 }] }));
    tracker.observe(pulled);
    /* An order that is gone is gone — reporting support at a price with
       nothing resting on it is the failure this prevents. */
    expect(tracker.walls(pulled, "bid")).toHaveLength(0);
  });

  it("ignores a level too small to matter relative to its side", () => {
    const tracker = new LiquidityTracker();
    const flat = normalizeBook(
      rawBook({
        bids: [
          { price: 0.61, size: 1_000 },
          { price: 0.6, size: 1_000 },
          { price: 0.59, size: 1_000 },
          { price: 0.58, size: 1_000 },
          { price: 0.57, size: 1_000 },
          { price: 0.56, size: 1_000 },
          { price: 0.55, size: 1_000 },
        ],
      }),
    );
    for (let i = 0; i < 6; i += 1) tracker.observe(flat);
    /* Evenly spread depth has no wall in it. */
    expect(tracker.walls(flat, "bid")).toHaveLength(0);
  });

  it("finds the nearest zone, not the largest", () => {
    const tracker = new LiquidityTracker();
    const laddered = normalizeBook(
      rawBook({
        asks: [
          { price: 0.63, size: 50_000 },
          { price: 0.64, size: 100 },
          { price: 0.65, size: 100 },
          /* Larger, and further away. The nearer wall is what price meets. */
          { price: 0.7, size: 60_000 },
          { price: 0.71, size: 100 },
        ],
      }),
    );
    for (let i = 0; i < 5; i += 1) tracker.observe(laddered);
    const analytics = analyseBook(laddered, tracker);
    const zone = nearestZone(analytics, 0.62, "resistance");
    expect(zone?.price).toBe(0.63);
  });
});

/* ---------------------------------------------------------------------------
   Execution
--------------------------------------------------------------------------- */

describe("estimateExecution", () => {
  it("fills inside one level without slippage", () => {
    /* $300 at 0.63 buys 476.19 shares; the level holds 500. */
    const estimate = estimateExecution(book(), { side: "buy", notionalUsd: 300 });
    expect(estimate.averagePrice).toBeCloseTo(0.63, 10);
    expect(estimate.levelsConsumed).toBe(1);
    expect(estimate.slippagePoints).toBeCloseTo(0, 10);
    expect(estimate.filled).toBe(true);
  });

  it("walks the ladder and reports the real average", () => {
    /* $1,000: 500 shares at 0.63 costs $315; $685 remains, buying
       1070.3125 shares at 0.64. Total 1570.3125 shares for $1,000 →
       average 0.636813… */
    const estimate = estimateExecution(book(), { side: "buy", notionalUsd: 1_000 });
    expect(estimate.levelsConsumed).toBe(2);
    expect(estimate.shares).toBeCloseTo(1_570.3125, 3);
    expect(estimate.averagePrice).toBeCloseTo(0.636813, 5);
    expect(estimate.worstPrice).toBe(0.64);
    /* Worse than the touch by 0.68 points. */
    expect(estimate.slippagePoints).toBeCloseTo(0.6813, 3);
  });

  it("converts a dollar budget at each level's own price", () => {
    /* At 0.63 a dollar buys 1.587 shares; at 0.66 it buys 1.515. A single
       conversion price reintroduces exactly the error this prevents. */
    const estimate = estimateExecution(book(), { side: "buy", notionalUsd: 5_000 });
    expect(estimate.notionalUsd).toBeLessThanOrEqual(5_000 + 1e-6);
  });

  it("reports an unfilled remainder rather than quoting a smaller trade", () => {
    /* The whole ask side is 315 + 960 + 1625 = $2,900. */
    const estimate = estimateExecution(book(), { side: "buy", notionalUsd: 10_000 });
    expect(estimate.filled).toBe(false);
    expect(estimate.unfilledUsd).toBeCloseTo(7_100, 6);
    expect(estimate.warnings.join(" ")).toContain("could not fill");
  });

  it("signs slippage so positive is always worse for the trader", () => {
    const buy = estimateExecution(book(), { side: "buy", notionalUsd: 1_000 });
    const sell = estimateExecution(book(), { side: "sell", shares: 2_500 });
    expect(buy.slippagePoints!).toBeGreaterThan(0);
    expect(sell.slippagePoints!).toBeGreaterThan(0);
  });

  it("sells into bids, not asks", () => {
    const estimate = estimateExecution(book(), { side: "sell", shares: 500 });
    expect(estimate.averagePrice).toBeCloseTo(0.61, 10);
    expect(estimate.referencePrice).toBe(0.61);
  });

  it("refuses an ambiguous or empty request", () => {
    expect(estimateExecution(book(), { side: "buy" }).averagePrice).toBeNull();
    expect(
      estimateExecution(book(), { side: "buy", notionalUsd: 100, shares: 10 }).averagePrice,
    ).toBeNull();
    expect(estimateExecution(normalizeBook(rawBook({ asks: [] })), { side: "buy", notionalUsd: 100 }).filled).toBe(false);
  });

  it("warns when an order clears five or more levels", () => {
    const deep = normalizeBook(
      rawBook({
        asks: Array.from({ length: 8 }, (_, index) => ({
          price: 0.63 + index * 0.01,
          size: 100,
        })),
      }),
    );
    const estimate = estimateExecution(deep, { side: "buy", notionalUsd: 500 });
    expect(estimate.levelsConsumed).toBeGreaterThanOrEqual(5);
    expect(estimate.warnings.join(" ")).toContain("price levels");
  });
});

describe("estimateExitLadder", () => {
  it("shows execution worsening with size", () => {
    const rungs = estimateExitLadder(book(), 4_000);
    expect(rungs).toHaveLength(3);
    const [quarter, , full] = rungs;
    expect(quarter.estimate.averagePrice!).toBeGreaterThan(full.estimate.averagePrice!);
    expect(full.estimate.levelsConsumed).toBeGreaterThan(quarter.estimate.levelsConsumed);
  });
});

/* ---------------------------------------------------------------------------
   Basket
--------------------------------------------------------------------------- */

function trade(over: Partial<PredictionTrade> = {}): PredictionTrade {
  return {
    tokenId: "111",
    marketId: "0xmarket",
    side: "buy",
    size: 100,
    price: 0.62,
    at: new Date().toISOString(),
    outcome: "Yes",
    txHash: null,
    ...over,
  };
}

describe("recentVwapOf", () => {
  it("weights by size and filters to the token", () => {
    const trades = [
      trade({ price: 0.6, size: 100 }),
      trade({ price: 0.64, size: 300 }),
      trade({ price: 0.62, size: 100 }),
      /* The NO leg of the same market. Including it would average 0.62 with
         0.38 and describe nothing. */
      trade({ tokenId: "222", price: 0.38, size: 10_000 }),
    ];
    /* (0.6×100 + 0.64×300 + 0.62×100) / 500 = 0.628 */
    expect(recentVwapOf(trades, "111").value).toBeCloseTo(0.628, 10);
    expect(recentVwapOf(trades, "111").sampleSize).toBe(3);
  });

  it("requires a minimum number of prints", () => {
    expect(recentVwapOf([trade(), trade()], "111").value).toBeNull();
  });

  it("ignores prints outside the window", () => {
    const old = new Date(Date.now() - 60 * 60_000).toISOString();
    const trades = [trade({ at: old }), trade({ at: old }), trade({ at: old })];
    expect(recentVwapOf(trades, "111").value).toBeNull();
  });
});

describe("lastTradeOf", () => {
  it("takes the newest print for THIS token only", () => {
    const now = Date.now();
    const trades = [
      trade({ price: 0.61, at: new Date(now - 5_000).toISOString() }),
      /* The complement, more recent. `book.lastTradePrice` would report this
         value on the YES book too — it is market-level. */
      trade({ tokenId: "222", price: 0.38, at: new Date(now - 1_000).toISOString() }),
    ];
    expect(lastTradeOf(trades, "111", now).value).toBe(0.61);
  });

  it("returns null when this token has not printed recently", () => {
    const now = Date.now();
    expect(lastTradeOf([trade({ tokenId: "222" })], "111", now).value).toBeNull();
  });
});

describe("buildBasket", () => {
  it("blends the observable prices and stays between the quotes", () => {
    const basket = buildBasket({
      book: book(),
      trades: [trade(), trade(), trade()],
    });
    expect(basket.basketProbability).not.toBeNull();
    expect(basket.basketProbability!).toBeGreaterThanOrEqual(0.6);
    expect(basket.basketProbability!).toBeLessThanOrEqual(0.64);
  });

  it("never lets a complement price contaminate the blend", () => {
    /* The regression. `book.lastTradePrice` is market-level, so a NO print at
       0.88 arrives on the YES book. Observed live: it dragged a 0.115 market
       to a 0.19 basket and manufactured a seven-point edge. */
    const basket = buildBasket({
      book: book({ lastTradePrice: 0.88 }),
      trades: [
        trade({ price: 0.62 }),
        trade({ price: 0.62 }),
        trade({ price: 0.62 }),
        trade({ tokenId: "222", price: 0.88 }),
      ],
    });
    expect(basket.observedLastTrade).toBe(0.62);
    expect(basket.basketProbability!).toBeLessThan(0.65);
  });

  it("renormalises weights over the components actually present", () => {
    const basket = buildBasket({ book: book() });
    const total = basket.components.reduce((sum, part) => sum + part.weight, 0);
    expect(total).toBeCloseTo(1, 10);
    /* No tape, so no VWAP and no last trade. */
    expect(basket.components.map((part) => part.source).sort()).toEqual([
      "microprice",
      "midpoint",
    ]);
  });

  it("gives the YES/NO complement zero weight", () => {
    /* The two books are mechanically mirrored on this venue, so the
       normalised complement carries no independent information. */
    const complement = normalizeBook(
      rawBook({
        tokenId: "222",
        bids: [{ price: 0.37, size: 500 }],
        asks: [{ price: 0.39, size: 1_000 }],
      }),
      { outcomeLabel: "No" },
    );
    const basket = buildBasket({ book: book(), complementBook: complement });
    expect(basket.complementCheck).not.toBeNull();
    expect(
      basket.components.some((part) => String(part.source).includes("complement")),
    ).toBe(false);
  });

  it("warns when the two books stop mirroring", () => {
    /* YES mid 0.62 with NO mid 0.20 sums to 0.82 — one side is stale, the
       book is crossed, or an arbitrage is open. */
    const dislocated = normalizeBook(
      rawBook({
        tokenId: "222",
        bids: [{ price: 0.19, size: 500 }],
        asks: [{ price: 0.21, size: 500 }],
      }),
      { outcomeLabel: "No" },
    );
    const basket = buildBasket({ book: book(), complementBook: dislocated });
    expect(basket.warnings.join(" ")).toContain("exact complements");
    expect(basket.confidence).toBe("low");
  });

  it("drops to low confidence on a one-sided book", () => {
    const basket = buildBasket({ book: normalizeBook(rawBook({ asks: [] })) });
    expect(basket.confidence).toBe("low");
  });

  it("reports a null basket rather than a default when nothing is fresh", () => {
    const stale = book({}, { timestamp: new Date(Date.now() - 10 * 60_000).toISOString() });
    const basket = buildBasket({ book: stale });
    expect(basket.basketProbability).toBeNull();
    expect(basket.components).toHaveLength(0);
  });

  it("calls a sub-tick deviation aligned rather than an edge", () => {
    /* Basket near 0.622 against an ask of 0.63 is a 0.8-point gap, inside
       the 1¢ tick. Reporting that as a mispricing would manufacture an edge
       out of rounding. */
    const basket = buildBasket({ book: book(), trades: [trade(), trade(), trade()] });
    expect(basket.deviationFromAskPoints!).toBeLessThan(0);
    expect(Math.abs(basket.deviationFromAskPoints!)).toBeLessThan(1);
    expect(basket.reading).toBe("aligned");
  });

  it("reads the market as above the basket when the gap exceeds a tick", () => {
    /* An ask five points clear of where every input says the price is. */
    const rich = book({
      asks: [
        { price: 0.68, size: 500 },
        { price: 0.7, size: 500 },
      ],
    });
    const basket = buildBasket({
      book: rich,
      trades: [trade({ price: 0.61 }), trade({ price: 0.61 }), trade({ price: 0.61 })],
    });
    expect(basket.deviationFromAskPoints!).toBeLessThan(-1);
    expect(basket.reading).toBe("market_above_basket");
  });

  it("stays inside 0–1", () => {
    const extreme = normalizeBook(
      rawBook({ bids: [{ price: 0.001, size: 10 }], asks: [{ price: 0.002, size: 10 }] }),
    );
    const basket = buildBasket({ book: extreme });
    expect(basket.basketProbability!).toBeGreaterThan(0);
    expect(basket.basketProbability!).toBeLessThan(1);
  });
});

/* ---------------------------------------------------------------------------
   Realtime frame parsing
--------------------------------------------------------------------------- */

describe("parseFrame", () => {
  it("reads a book snapshot", () => {
    const events = parseFrame({
      event_type: "book",
      market: "0xmarket",
      asset_id: "111",
      timestamp: "1789571707981",
      hash: "abc",
      tick_size: "0.01",
      last_trade_price: "0.62",
      bids: [{ price: "0.61", size: "1000" }],
      asks: [{ price: "0.63", size: "500" }],
    });

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.kind).toBe("book");
    if (event.kind !== "book") throw new Error("wrong kind");
    expect(event.bids[0]).toEqual({ price: 0.61, size: 1_000, notional: 0.61 * 1_000 });
    expect(event.tickSize).toBe(0.01);
    /* Milliseconds, not seconds. */
    expect(Date.parse(event.at)).toBe(1_789_571_707_981);
  });

  it("accepts the live feed's snake_case touch fields", () => {
    /* The documentation says bestBid/bestAsk; the live feed sends
       best_bid/best_ask. Trusting the documented spelling reads undefined as
       "no touch" on every delta. */
    const events = parseFrame({
      event_type: "price_change",
      market: "0xmarket",
      timestamp: "1789571707981",
      price_changes: [
        { asset_id: "111", price: "0.62", size: "900", side: "BUY", best_bid: "0.62", best_ask: "0.63" },
      ],
    });

    const event = events[0];
    if (event.kind !== "price_change") throw new Error("wrong kind");
    expect(event.bestBid).toBe(0.62);
    expect(event.bestAsk).toBe(0.63);
  });

  it("also accepts the documented camelCase spelling", () => {
    const events = parseFrame({
      event_type: "price_change",
      market: "0xmarket",
      price_changes: [
        { asset_id: "111", price: "0.62", size: "900", side: "SELL", bestBid: "0.61", bestAsk: "0.63" },
      ],
    });
    const event = events[0];
    if (event.kind !== "price_change") throw new Error("wrong kind");
    expect(event.bestBid).toBe(0.61);
    expect(event.changes[0].side).toBe("ask");
  });

  it("splits a multi-token delta frame per token", () => {
    /* Both outcomes arrive in one frame. Folding them together corrupts
       both books. */
    const events = parseFrame({
      event_type: "price_change",
      market: "0xmarket",
      price_changes: [
        { asset_id: "111", price: "0.62", size: "900", side: "BUY" },
        { asset_id: "222", price: "0.38", size: "900", side: "SELL" },
      ],
    });

    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.tokenId))).toEqual(new Set(["111", "222"]));
  });

  it("preserves a zero size, which means the level was removed", () => {
    const events = parseFrame({
      event_type: "price_change",
      market: "0xmarket",
      price_changes: [{ asset_id: "111", price: "0.61", size: "0", side: "BUY" }],
    });
    const event = events[0];
    if (event.kind !== "price_change") throw new Error("wrong kind");
    expect(event.changes[0].size).toBe(0);
  });

  it("reads a trade and a tick-size change", () => {
    const trades = parseFrame({
      event_type: "last_trade_price",
      market: "0xmarket",
      asset_id: "111",
      price: "0.62",
      size: "36.36",
      side: "BUY",
      transaction_hash: "0xdead",
    });
    expect(trades[0].kind).toBe("trade");

    const ticks = parseFrame({
      event_type: "tick_size_change",
      market: "0xmarket",
      asset_id: "111",
      new_tick_size: "0.001",
    });
    const tick = ticks[0];
    if (tick.kind !== "tick_size") throw new Error("wrong kind");
    expect(tick.tickSize).toBe(0.001);
  });

  it("handles an array frame and ignores unknown types", () => {
    expect(
      parseFrame([
        { event_type: "book", market: "m", asset_id: "111", bids: [], asks: [] },
        { event_type: "something_new", market: "m" },
      ]),
    ).toHaveLength(1);
  });

  it("survives malformed input without throwing", () => {
    expect(parseFrame(null)).toEqual([]);
    expect(parseFrame("PONG")).toEqual([]);
    expect(parseFrame({ event_type: "book" })).toEqual([]);
    expect(parseFrame({ event_type: "price_change", price_changes: "nope" })).toEqual([]);
  });
});
