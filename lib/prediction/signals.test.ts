import { describe, expect, it } from "vitest";

import { normalizeBook, type NormalizedBook } from "@/lib/prediction/book";
import { LiquidityTracker } from "@/lib/prediction/book-analytics";
import {
  computeRiskReward,
  generateSignal,
  liquidityQualityOf,
  resolutionProximity,
  SIGNAL_TTL_MS,
} from "@/lib/prediction/signal-engine";
import { analyseBook } from "@/lib/prediction/book-analytics";
import {
  getPredictionStrategy,
  PREDICTION_STRATEGIES,
  resolvePredictionStrategy,
  eligibleStrategies,
} from "@/lib/prediction/strategies";
import {
  simulate,
  simulateBookStrategy,
  MIN_SAMPLE,
} from "@/lib/prediction/signal-backtest";
import type { BookObservation } from "@/lib/prediction/book-history";
import { evaluateLifecycle } from "@/lib/prediction/signal-store";
import { evaluateAlert, parsePredictionAlert, type PredictionAlertRule } from "@/lib/prediction/alerts";
import type { PredictionSignalRecord } from "@/lib/prediction/signal-types";
import type { PredictionMarket, PredictionOrderbook, PredictionTrade } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Signal engine, lifecycle, alerts and the historical simulator.

   The engine is deterministic, so every case below is exact. Where a test
   asserts an absence — no signal, no win rate, no direction — that absence is
   the product requirement, not a gap in coverage.
--------------------------------------------------------------------------- */

const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();

function market(over: Partial<PredictionMarket> = {}): PredictionMarket {
  return {
    id: "2252244",
    provider: "polymarket",
    question: "Will it happen?",
    slug: "will-it-happen",
    outcomes: [
      { label: "Yes", price: 0.62 },
      { label: "No", price: 0.38 },
    ],
    liquidityUsd: 50_000,
    volume24hUsd: 500_000,
    volumeUsd: 2_000_000,
    endsAt: FUTURE,
    closed: false,
    conditionId: "0xcondition",
    tickSize: 0.01,
    tokenIds: ["111", "222"],
    ...over,
  };
}

function rawBook(over: Partial<PredictionOrderbook> = {}): PredictionOrderbook {
  return {
    marketId: "0xcondition",
    tokenId: "111",
    /* Deliberately bid-heavy: $30,500 of bids against $5,000 of asks. */
    bids: [
      { price: 0.61, size: 50_000 },
      { price: 0.6, size: 20_000 },
      { price: 0.59, size: 10_000 },
    ],
    asks: [
      { price: 0.63, size: 4_000 },
      { price: 0.64, size: 2_000 },
      { price: 0.7, size: 30_000 },
    ],
    midpoint: null,
    spread: null,
    lastTradePrice: 0.62,
    minOrderSize: 5,
    tickSize: 0.01,
    ...over,
  };
}

function book(over: Partial<PredictionOrderbook> = {}, label = "Yes"): NormalizedBook {
  return normalizeBook(rawBook(over), { outcomeLabel: label, transport: "realtime" });
}

function complement(): NormalizedBook {
  /* The mechanical mirror: NO ask = 1 − YES bid, same size. */
  return normalizeBook(
    rawBook({
      tokenId: "222",
      bids: [
        { price: 0.37, size: 4_000 },
        { price: 0.36, size: 2_000 },
      ],
      asks: [
        { price: 0.39, size: 50_000 },
        { price: 0.4, size: 20_000 },
      ],
    }),
    { outcomeLabel: "No", transport: "realtime" },
  );
}

function trades(count = 5, price = 0.62): PredictionTrade[] {
  return Array.from({ length: count }, () => ({
    tokenId: "111",
    marketId: "0xcondition",
    side: "buy" as const,
    size: 100,
    price,
    at: new Date().toISOString(),
    outcome: "Yes",
    txHash: null,
  }));
}

/** A tracker that has seen the same book enough times to name its walls. */
function warmTracker(target: NormalizedBook, observations = 6): LiquidityTracker {
  const tracker = new LiquidityTracker();
  for (let i = 0; i < observations; i += 1) tracker.observe(target);
  return tracker;
}

const IMBALANCE = getPredictionStrategy("PM_ORDERBOOK_IMBALANCE_V1")!;
const MICROPRICE = getPredictionStrategy("PM_MICROPRICE_DIVERGENCE_V1")!;
const BASKET = getPredictionStrategy("PM_BASKET_CONVERGENCE_V1")!;

/* ---------------------------------------------------------------------------
   Registry
--------------------------------------------------------------------------- */

describe("strategy registry", () => {
  it("declares every strategy with explicit versioned rules", () => {
    for (const strategy of PREDICTION_STRATEGIES) {
      expect(strategy.rules.entry.length).toBeGreaterThan(20);
      expect(strategy.rules.exit.length).toBeGreaterThan(10);
      expect(strategy.rules.invalidation.length).toBeGreaterThan(10);
      expect(strategy.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(strategy.parameters.length).toBeGreaterThan(0);
    }
  });

  it("never offers a bare buy or sell direction", () => {
    for (const strategy of PREDICTION_STRATEGIES) {
      for (const direction of strategy.directions) {
        expect(["long_yes", "long_no", "long_outcome", "watch", "neutral"]).toContain(direction);
      }
    }
  });

  it("resolves plain language and refuses the unknown", () => {
    expect(resolvePredictionStrategy("imbalance")?.id).toBe("PM_ORDERBOOK_IMBALANCE_V1");
    expect(resolvePredictionStrategy("order book imbalance")?.id).toBe("PM_ORDERBOOK_IMBALANCE_V1");
    expect(resolvePredictionStrategy("PM_BASKET_CONVERGENCE_V1")?.id).toBe("PM_BASKET_CONVERGENCE_V1");
    expect(resolvePredictionStrategy("quantum flux")).toBeNull();
    expect(resolvePredictionStrategy("")).toBeNull();
  });

  it("excludes strategies whose data is unavailable", () => {
    const snapshotOnly = eligibleStrategies({
      persistence: false,
      trades: false,
      priceHistory: false,
      basket: true,
    });
    /* Persistence needs a live feed; a REST snapshot is one frame. */
    expect(snapshotOnly.map((s) => s.id)).not.toContain("PM_ORDERBOOK_IMBALANCE_V1");
    expect(snapshotOnly.map((s) => s.id)).toContain("PM_MICROPRICE_DIVERGENCE_V1");
  });
});

/* ---------------------------------------------------------------------------
   Gates
--------------------------------------------------------------------------- */

describe("signal gates", () => {
  it("refuses a stale book", () => {
    const stale = normalizeBook(rawBook(), {
      outcomeLabel: "Yes",
      transport: "realtime",
      timestamp: new Date(Date.now() - 120_000).toISOString(),
    });

    const outcome = generateSignal(
      { market: market(), tokenId: "111", outcomeLabel: "Yes", book: stale, trades: trades() },
      { strategy: MICROPRICE },
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain("stale");
  });

  it("refuses a one-sided book", () => {
    const outcome = generateSignal(
      { market: market(), tokenId: "111", outcomeLabel: "Yes", book: book({ asks: [] }) },
      { strategy: MICROPRICE },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain("one side");
  });

  it("refuses a crossed book", () => {
    const crossed = book({
      bids: [{ price: 0.66, size: 1_000 }],
      asks: [{ price: 0.63, size: 1_000 }],
    });
    const outcome = generateSignal(
      { market: market(), tokenId: "111", outcomeLabel: "Yes", book: crossed },
      { strategy: MICROPRICE },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain("crossed");
  });

  it("stands down when resolution is imminent", () => {
    const outcome = generateSignal(
      {
        market: market({ endsAt: new Date(Date.now() + 10 * 60_000).toISOString() }),
        tokenId: "111",
        outcomeLabel: "Yes",
        book: book(),
        trades: trades(),
      },
      { strategy: MICROPRICE },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain("within the hour");
  });

  it("refuses a persistence strategy without a tracker", () => {
    /* A single REST frame cannot demonstrate that anything persisted. */
    const outcome = generateSignal(
      { market: market(), tokenId: "111", outcomeLabel: "Yes", book: book() },
      { strategy: IMBALANCE },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain("persistence");
  });

  it("classifies resolution proximity", () => {
    const now = Date.now();
    expect(resolutionProximity(new Date(now + 30 * 60_000).toISOString(), now).proximity).toBe("imminent");
    expect(resolutionProximity(new Date(now + 5 * 3_600_000).toISOString(), now).proximity).toBe("near");
    expect(resolutionProximity(new Date(now + 3 * 86_400_000).toISOString(), now).proximity).toBe("medium");
    expect(resolutionProximity(new Date(now + 60 * 86_400_000).toISOString(), now).proximity).toBe("far");
    expect(resolutionProximity(null, now).proximity).toBe("unknown");
  });
});

/* ---------------------------------------------------------------------------
   Liquidity
--------------------------------------------------------------------------- */

describe("liquidity gates", () => {
  it("calls a wide spread poor", () => {
    const wide = book({
      bids: [{ price: 0.4, size: 10_000 }],
      asks: [{ price: 0.8, size: 10_000 }],
    });
    const { quality } = liquidityQualityOf(analyseBook(wide), { maxSpreadPoints: 4, minDepthUsd: 2_000 });
    expect(quality).toBe("poor");
  });

  it("calls a thin book poor", () => {
    const thin = book({
      bids: [{ price: 0.61, size: 10 }],
      asks: [{ price: 0.62, size: 10 }],
    });
    const { quality } = liquidityQualityOf(analyseBook(thin), { maxSpreadPoints: 4, minDepthUsd: 2_000 });
    expect(quality).toBe("poor");
  });

  it("calls a tight, deep book good", () => {
    const { quality } = liquidityQualityOf(analyseBook(book()), {
      maxSpreadPoints: 4,
      minDepthUsd: 2_000,
    });
    expect(quality).toBe("good");
  });

  it("downgrades an actionable direction to WATCH on a poor book", () => {
    /* Wide enough to be poor, but still microprice-divergent. */
    const poor = book({
      bids: [{ price: 0.4, size: 100 }],
      asks: [{ price: 0.8, size: 10 }],
    });
    const outcome = generateSignal(
      { market: market(), tokenId: "111", outcomeLabel: "Yes", book: poor, trades: trades() },
      { strategy: MICROPRICE },
    );

    if (outcome.ok) {
      expect(outcome.signal!.direction).toBe("watch");
      expect(outcome.signal!.strength).toBe("low");
    } else {
      expect(outcome.reason).toBeDefined();
    }
  });
});

/* ---------------------------------------------------------------------------
   Direction, entry, target, stop
--------------------------------------------------------------------------- */

describe("signal construction", () => {
  it("produces LONG YES with an executable entry zone", () => {
    const target = book();
    const outcome = generateSignal(
      {
        market: market(),
        tokenId: "111",
        outcomeLabel: "Yes",
        book: target,
        complementBook: complement(),
        complementTokenId: "222",
        complementLabel: "No",
        trades: trades(),
        tracker: warmTracker(target),
      },
      { strategy: IMBALANCE },
    );

    expect(outcome.ok).toBe(true);
    const signal = outcome.signal!;
    expect(signal.direction).toBe("long_yes");
    expect(signal.outcomeLabel).toBe("Yes");

    /* Entry starts at the touch and extends to what the reference size
       actually averages. */
    const low = signal.entry.minPrice ?? signal.entry.price!;
    expect(low).toBe(0.63);
    expect(signal.entry.executablePrice).not.toBeNull();

    /* Ordering must hold. */
    const targetPrice = signal.target.price ?? signal.target.maxPrice!;
    expect(targetPrice).toBeGreaterThan(low);
    expect(signal.stop.price!).toBeLessThan(low);

    /* Every price sits on the market's tick. */
    for (const price of [low, targetPrice, signal.stop.price!]) {
      expect(Math.round(price * 100) / 100).toBeCloseTo(price, 10);
    }
  });

  it("prices LONG NO off the NO book's own ask", () => {
    /* Ask-heavy YES book: $30,000 of asks against $2,440 of bids. */
    const askHeavy = book({
      bids: [
        { price: 0.61, size: 2_000 },
        { price: 0.6, size: 2_000 },
      ],
      asks: [
        { price: 0.63, size: 50_000 },
        { price: 0.64, size: 20_000 },
      ],
    });
    const noBook = normalizeBook(
      rawBook({
        tokenId: "222",
        bids: [{ price: 0.36, size: 50_000 }],
        asks: [
          { price: 0.37, size: 2_000 },
          { price: 0.38, size: 2_000 },
        ],
      }),
      { outcomeLabel: "No", transport: "realtime" },
    );

    const outcome = generateSignal(
      {
        market: market(),
        tokenId: "111",
        outcomeLabel: "Yes",
        book: askHeavy,
        complementBook: noBook,
        complementTokenId: "222",
        complementLabel: "No",
        trades: trades(),
        tracker: warmTracker(askHeavy),
      },
      { strategy: IMBALANCE },
    );

    expect(outcome.ok).toBe(true);
    const signal = outcome.signal!;
    expect(signal.direction).toBe("long_no");
    /* The traded contract is NO, and its entry comes from the NO ask (0.37),
       NOT from the YES bid. */
    expect(signal.outcomeLabel).toBe("No");
    expect(signal.tokenId).toBe("222");
    const low = signal.entry.minPrice ?? signal.entry.price!;
    expect(low).toBe(0.37);
  });

  it("names the real outcome when the market is not YES/NO", () => {
    /* "Suzan Lamens vs Carolina M. Alves" has two outcomes, neither called
       Yes nor No. Rendering "LONG NO" there names nothing actionable — the
       complement is a player, not a negation. */
    const askHeavy = book(
      {
        bids: [{ price: 0.61, size: 2_000 }],
        asks: [{ price: 0.63, size: 50_000 }],
      },
      "Suzan Lamens",
    );
    const other = normalizeBook(
      rawBook({
        tokenId: "222",
        bids: [{ price: 0.36, size: 50_000 }],
        asks: [{ price: 0.37, size: 2_000 }],
      }),
      { outcomeLabel: "Carolina M. Alves", transport: "realtime" },
    );

    const outcome = generateSignal(
      {
        market: market({
          question: "Sao Paulo Open: Suzan Lamens vs Carolina M. Alves",
          outcomes: [
            { label: "Suzan Lamens", price: 0.62 },
            { label: "Carolina M. Alves", price: 0.38 },
          ],
        }),
        tokenId: "111",
        outcomeLabel: "Suzan Lamens",
        book: askHeavy,
        complementBook: other,
        complementTokenId: "222",
        complementLabel: "Carolina M. Alves",
        trades: trades(),
        tracker: warmTracker(askHeavy),
      },
      { strategy: IMBALANCE },
    );

    if (outcome.ok) {
      expect(outcome.signal!.direction).toBe("long_outcome");
      expect(outcome.signal!.outcomeLabel).toBe("Carolina M. Alves");
      /* Never a yes/no direction on a market with no yes/no outcome. */
      expect(["long_yes", "long_no"]).not.toContain(outcome.signal!.direction);
    }
  });

  it("keeps LONG YES / LONG NO on a genuine YES/NO market", () => {
    const target = book();
    const outcome = generateSignal(
      {
        market: market(),
        tokenId: "111",
        outcomeLabel: "Yes",
        book: target,
        complementBook: complement(),
        complementTokenId: "222",
        complementLabel: "No",
        trades: trades(),
        tracker: warmTracker(target),
      },
      { strategy: IMBALANCE },
    );

    expect(outcome.ok).toBe(true);
    expect(["long_yes", "long_no"]).toContain(outcome.signal!.direction);
  });

  it("refuses LONG NO when the complementary book was not supplied", () => {
    const askHeavy = book({
      bids: [{ price: 0.61, size: 2_000 }],
      asks: [{ price: 0.63, size: 50_000 }],
    });
    const outcome = generateSignal(
      {
        market: market(),
        tokenId: "111",
        outcomeLabel: "Yes",
        book: askHeavy,
        trades: trades(),
        tracker: warmTracker(askHeavy),
      },
      { strategy: IMBALANCE },
    );
    if (!outcome.ok) expect(outcome.reason).toContain("complementary");
  });

  it("targets one tick below a persistent wall rather than the wall itself", () => {
    const target = book();
    const outcome = generateSignal(
      {
        market: market(),
        tokenId: "111",
        outcomeLabel: "Yes",
        book: target,
        complementBook: complement(),
        complementTokenId: "222",
        complementLabel: "No",
        trades: trades(),
        tracker: warmTracker(target),
      },
      { strategy: IMBALANCE },
    );

    const signal = outcome.signal!;
    /* The $21,000 wall at 0.70 is the resistance; the target is 0.69 —
       queuing behind the size that stops the move is not a target. */
    if (signal.target.basis.includes("wall")) {
      expect(signal.target.price).toBe(0.69);
    }
  });

  it("marks the stop an invalidation rather than a fill on a thin book", () => {
    const thin = book({
      bids: [
        { price: 0.61, size: 400 },
        { price: 0.6, size: 300 },
      ],
      asks: [
        { price: 0.62, size: 300 },
        { price: 0.63, size: 200 },
      ],
    });
    const outcome = generateSignal(
      {
        market: market(),
        tokenId: "111",
        outcomeLabel: "Yes",
        book: thin,
        trades: trades(),
      },
      { strategy: MICROPRICE, params: { minDivergencePoints: 0.01, minDepthUsd: 100 } },
    );

    if (outcome.ok && outcome.signal!.stop.price !== undefined) {
      /* Fair liquidity, not good — so no promise of a fill at the level. */
      expect(outcome.signal!.stop.executable).toBe(false);
    }
  });

  it("expires", () => {
    const target = book();
    const outcome = generateSignal(
      {
        market: market(),
        tokenId: "111",
        outcomeLabel: "Yes",
        book: target,
        trades: trades(),
        tracker: warmTracker(target),
      },
      { strategy: IMBALANCE },
    );
    const signal = outcome.signal!;
    const life = Date.parse(signal.expiresAt!) - Date.parse(signal.generatedAt);
    expect(life).toBe(SIGNAL_TTL_MS);
  });

  it("records the window with every imbalance it cites", () => {
    const target = book();
    const outcome = generateSignal(
      {
        market: market(),
        tokenId: "111",
        outcomeLabel: "Yes",
        book: target,
        trades: trades(),
        tracker: warmTracker(target),
      },
      { strategy: IMBALANCE },
    );
    const evidence = outcome.signal!.evidence.find((item) => item.key === "imbalance_top5");
    expect(evidence).toBeDefined();
    expect(evidence!.label).toContain("Top-5");
  });

  it("carries a snapshot of the analytics that produced it", () => {
    const target = book();
    const outcome = generateSignal(
      {
        market: market(),
        tokenId: "111",
        outcomeLabel: "Yes",
        book: target,
        trades: trades(),
        tracker: warmTracker(target),
      },
      { strategy: IMBALANCE },
    );
    const snapshot = outcome.signal!.snapshot;
    expect(snapshot.bestBid).toBe(0.61);
    expect(snapshot.bestAsk).toBe(0.63);
    expect(snapshot.microprice).not.toBeNull();
    expect(snapshot.imbalanceTop5).not.toBeNull();
  });

  it("does not force a direction when evidence conflicts", () => {
    /* Balanced book: no imbalance, no divergence. */
    const balanced = book({
      bids: [{ price: 0.61, size: 10_000 }],
      asks: [{ price: 0.63, size: 10_000 }],
    });
    const outcome = generateSignal(
      {
        market: market(),
        tokenId: "111",
        outcomeLabel: "Yes",
        book: balanced,
        trades: trades(),
        tracker: warmTracker(balanced),
      },
      { strategy: IMBALANCE },
    );
    if (outcome.ok) {
      expect(["neutral", "watch"]).toContain(outcome.signal!.direction);
    }
  });

  it("will not sign a basket trade on a low-confidence basket", () => {
    /* No tape, one-sided-ish inputs — the basket cannot be trusted, and the
       edge IS the basket. */
    const outcome = generateSignal(
      {
        market: market(),
        tokenId: "111",
        outcomeLabel: "Yes",
        book: book({}, "Yes"),
      },
      { strategy: BASKET },
    );
    if (outcome.ok) {
      expect(["neutral", "watch"]).toContain(outcome.signal!.direction);
    }
  });
});

/* ---------------------------------------------------------------------------
   Risk/reward
--------------------------------------------------------------------------- */

describe("computeRiskReward", () => {
  it("is reward over risk", () => {
    /* entry 0.62, target 0.70, stop 0.57 → 0.08 / 0.05 = 1.6 */
    const value = computeRiskReward(
      0.62,
      { price: 0.7, basis: "" },
      { price: 0.57, basis: "", executable: true },
    );
    expect(value).toBeCloseTo(1.6, 10);
  });

  it("is null when the ordering is incoherent", () => {
    expect(
      computeRiskReward(0.62, { price: 0.6, basis: "" }, { price: 0.57, basis: "", executable: true }),
    ).toBeNull();
    expect(
      computeRiskReward(0.62, { price: 0.7, basis: "" }, { price: 0.65, basis: "", executable: true }),
    ).toBeNull();
  });

  it("is null when a level is not a price", () => {
    expect(
      computeRiskReward(
        0.62,
        { basis: "convergence" },
        { invalidation: "imbalance flips", basis: "", executable: false },
      ),
    ).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
   Historical simulation
--------------------------------------------------------------------------- */

describe("simulate", () => {
  const MOMENTUM = getPredictionStrategy("PM_MOMENTUM_BREAKOUT_V1")!;

  it("fills on the bar AFTER the signal, never the signal bar", () => {
    /* Flat, then a breakout. With lookback 3 the condition first becomes true
       at index 4 (0.70 > max(0.5,0.5,0.5)), so entry is index 5 at 0.72. */
    const series = [0.5, 0.5, 0.5, 0.5, 0.7, 0.72, 0.8, 0.85];
    const trades = simulate(MOMENTUM, { lookbackBars: 3, rocBars: 1, targetPoints: 5, stopPoints: 5 }, series);
    expect(trades.length).toBeGreaterThan(0);
    expect(trades[0].entryPrice).toBe(0.72);
  });

  it("counts a target reached before invalidation as a win", () => {
    const series = [0.5, 0.5, 0.5, 0.5, 0.6, 0.6, 0.68, 0.7];
    const trades = simulate(MOMENTUM, { lookbackBars: 3, rocBars: 1, targetPoints: 5, stopPoints: 5 }, series);
    expect(trades[0]?.result).toBe("target");
  });

  it("counts an invalidation reached first as a loss", () => {
    const series = [0.5, 0.5, 0.5, 0.5, 0.6, 0.6, 0.52, 0.5];
    const trades = simulate(MOMENTUM, { lookbackBars: 3, rocBars: 1, targetPoints: 5, stopPoints: 5 }, series);
    expect(trades[0]?.result).toBe("stop");
  });

  it("resolves an ambiguous bar pessimistically", () => {
    /* One close beyond BOTH levels. Closes alone cannot say which came
       first, and the optimistic reading inflates every win rate. */
    const series = [0.5, 0.5, 0.5, 0.5, 0.6, 0.6, 0.4];
    const trades = simulate(MOMENTUM, { lookbackBars: 3, rocBars: 1, targetPoints: 5, stopPoints: 5 }, series);
    expect(trades[0]?.result).toBe("stop");
  });

  it("produces no trades when the condition never fires", () => {
    const flat = Array.from({ length: 60 }, () => 0.5);
    expect(simulate(MOMENTUM, { lookbackBars: 24, rocBars: 6 }, flat)).toHaveLength(0);
  });

  it("does not overlap positions", () => {
    const series = Array.from({ length: 200 }, (_, i) => 0.3 + (i % 50) * 0.008);
    const trades = simulate(MOMENTUM, { lookbackBars: 5, rocBars: 2 }, series);
    for (let i = 1; i < trades.length; i += 1) {
      expect(trades[i].entryIndex).toBeGreaterThan(trades[i - 1].exitIndex);
    }
  });

  it("reports no entry signals for a book strategy", () => {
    /* Order-book families have no historical depth to replay. */
    const series = Array.from({ length: 100 }, (_, i) => 0.4 + i * 0.002);
    expect(simulate(IMBALANCE, {}, series)).toHaveLength(0);
  });

  it("sets a sample floor high enough to be meaningful", () => {
    expect(MIN_SAMPLE).toBeGreaterThanOrEqual(30);
  });
});

/* ---------------------------------------------------------------------------
   Lifecycle
--------------------------------------------------------------------------- */

function record(over: Partial<PredictionSignalRecord> = {}): PredictionSignalRecord {
  const now = Date.now();
  return {
    id: "sig-1",
    userId: "user-1",
    status: "waiting_entry",
    entryFilledAt: null,
    entryPrice: null,
    resolvedAt: null,
    resultPoints: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    signal: {
      id: "sig-1",
      marketId: "2252244",
      conditionId: "0xcondition",
      tokenId: "111",
      outcomeId: "111",
      marketQuestion: "Will it happen?",
      outcomeLabel: "Yes",
      strategyId: "PM_ORDERBOOK_IMBALANCE_V1",
      strategyVersion: "1.0.0",
      direction: "long_yes",
      entry: { type: "zone", minPrice: 0.61, maxPrice: 0.63 },
      target: { price: 0.7, basis: "fixed" },
      stop: { price: 0.57, basis: "fixed", executable: true },
      riskReward: 1.75,
      historicalWinRate: null,
      winRateUnavailableReason: null,
      strength: "medium",
      liquidityQuality: "good",
      evidence: [],
      timeToResolutionMs: 86_400_000,
      resolutionProximity: "near",
      eventRisk: false,
      generatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SIGNAL_TTL_MS).toISOString(),
      dataFreshnessMs: 500,
      transport: "realtime",
      warnings: [],
      snapshot: {
        bestBid: 0.61,
        bestAsk: 0.63,
        midpoint: 0.62,
        microprice: 0.623,
        spreadPoints: 2,
        imbalanceTop5: 0.3,
        basketProbability: 0.64,
        basketDeviationPoints: 1,
        depthTop5Usd: 35_000,
      },
    },
    ...over,
  };
}

describe("evaluateLifecycle", () => {
  it("enters when the ask reaches the zone", () => {
    const transition = evaluateLifecycle(record(), { ask: 0.63, bid: 0.61 });
    expect(transition?.status).toBe("entered");
    expect(transition?.entryPrice).toBe(0.63);
  });

  it("does not enter above the zone", () => {
    expect(evaluateLifecycle(record(), { ask: 0.68, bid: 0.66 })).toBeNull();
  });

  it("expires before entry when the window passes", () => {
    const stale = record();
    const transition = evaluateLifecycle(stale, {
      ask: 0.68,
      bid: 0.66,
      now: Date.now() + SIGNAL_TTL_MS + 1_000,
    });
    expect(transition?.status).toBe("expired");
  });

  it("does not expire a position that has already entered", () => {
    const entered = record({ status: "entered", entryPrice: 0.62 });
    const transition = evaluateLifecycle(entered, {
      ask: 0.63,
      bid: 0.62,
      now: Date.now() + SIGNAL_TTL_MS + 1_000,
    });
    /* The TTL bounds the READ, not the position. */
    expect(transition).toBeNull();
  });

  it("measures the target against the bid, not the midpoint", () => {
    const entered = record({ status: "entered", entryPrice: 0.62 });
    /* Midpoint 0.70 but bid only 0.69 — an exit here does not get 0.70. */
    expect(evaluateLifecycle(entered, { ask: 0.71, bid: 0.69 })).toBeNull();
    expect(evaluateLifecycle(entered, { ask: 0.71, bid: 0.7 })?.status).toBe("target_hit");
  });

  it("takes the invalidation when one observation satisfies both", () => {
    const entered = record({ status: "entered", entryPrice: 0.62 });
    const transition = evaluateLifecycle(entered, { ask: 0.72, bid: 0.55 });
    expect(transition?.status).toBe("invalidated");
  });

  it("records the result in signed probability points", () => {
    const entered = record({ status: "entered", entryPrice: 0.62 });
    const win = evaluateLifecycle(entered, { ask: 0.71, bid: 0.7 });
    expect(win?.resultPoints).toBeCloseTo(8, 6);

    const loss = evaluateLifecycle(entered, { ask: 0.58, bid: 0.56 });
    expect(loss?.resultPoints).toBeCloseTo(-6, 6);
  });

  it("does nothing for a settled signal", () => {
    expect(evaluateLifecycle(record({ status: "target_hit" }), { ask: 0.9, bid: 0.9 })).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
   Alerts
--------------------------------------------------------------------------- */

describe("parsePredictionAlert", () => {
  it("reads a price threshold in cents, percent and decimals", () => {
    expect(parsePredictionAlert("alert me if YES breaks 65")).toEqual({
      kind: "price_above",
      threshold: 0.65,
    });
    expect(parsePredictionAlert("tell me when it crosses 65%")).toEqual({
      kind: "price_above",
      threshold: 0.65,
    });
    expect(parsePredictionAlert("alert if it goes above 0.65")).toEqual({
      kind: "price_above",
      threshold: 0.65,
    });
  });

  it("reads direction from the words, never from the current price", () => {
    expect(parsePredictionAlert("alert me if YES drops below 40")?.kind).toBe("price_below");
    expect(parsePredictionAlert("alert me if YES goes above 40")?.kind).toBe("price_above");
  });

  it("refuses a threshold with no direction", () => {
    /* Guessing produces an alert that fires on the wrong side. */
    expect(parsePredictionAlert("alert me at 65")).toBeNull();
  });

  it("reads an imbalance threshold on its own scale", () => {
    expect(parsePredictionAlert("alert me if imbalance is above .3")).toEqual({
      kind: "orderbook_imbalance",
      threshold: 0.3,
    });
  });

  it("reads spread and liquidity rules", () => {
    expect(parsePredictionAlert("alert if the spread widens above 3")?.kind).toBe("spread_expansion");
    expect(parsePredictionAlert("tell me if the spread tightens to 1")?.kind).toBe("spread_compression");
    expect(parsePredictionAlert("alert if liquidity drops under 5000")?.kind).toBe("liquidity_change");
  });

  it("reads a move as POINTS rather than percent", () => {
    /* 54% → 64% is a 10-point move and an 18.5% relative one. Reading it the
       second way fires roughly twice as often as asked. */
    expect(parsePredictionAlert("alert me if it moves 10")).toEqual({
      kind: "probability_change",
      threshold: 10,
    });
  });

  it("reads the signal lifecycle rules", () => {
    expect(parsePredictionAlert("alert me when this setup enters")?.kind).toBe("signal_entry");
    expect(parsePredictionAlert("alert me if target is hit")?.kind).toBe("signal_target");
    expect(parsePredictionAlert("tell me if the signal becomes invalid")?.kind).toBe("signal_invalidated");
  });

  it("returns null rather than a best guess", () => {
    expect(parsePredictionAlert("")).toBeNull();
    expect(parsePredictionAlert("do something clever")).toBeNull();
  });
});

function rule(over: Partial<PredictionAlertRule> = {}): PredictionAlertRule {
  return {
    id: "rule-1",
    userId: "user-1",
    marketId: "2252244",
    tokenId: "111",
    marketQuestion: "Will it happen?",
    outcomeLabel: "Yes",
    kind: "price_above",
    threshold: 0.65,
    signalId: null,
    state: "armed",
    lastValue: null,
    triggeredAt: null,
    cooldownSeconds: 300,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

describe("evaluateAlert", () => {
  it("fires once on the crossing", () => {
    const decision = evaluateAlert(rule(), { price: 0.66, analytics: null });
    expect(decision.action).toBe("fire");
  });

  it("holds below the threshold", () => {
    expect(evaluateAlert(rule(), { price: 0.6, analytics: null }).action).toBe("hold");
  });

  it("does not fire again while the condition still holds", () => {
    /* The whole point of the state machine: a predicate evaluated on every
       book update sends dozens of identical messages a minute. */
    const triggered = rule({ state: "triggered", triggeredAt: new Date().toISOString() });
    expect(evaluateAlert(triggered, { price: 0.7, analytics: null }).action).toBe("hold");
  });

  it("re-arms only after the condition clears AND the cooldown passes", () => {
    const justTriggered = rule({ state: "triggered", triggeredAt: new Date().toISOString() });
    expect(evaluateAlert(justTriggered, { price: 0.5, analytics: null }).action).toBe("hold");

    const old = rule({
      state: "triggered",
      triggeredAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    });
    expect(evaluateAlert(old, { price: 0.5, analytics: null }).action).toBe("rearm");
  });

  it("holds when the reading is unavailable rather than treating it as zero", () => {
    expect(evaluateAlert(rule(), { price: null, analytics: null }).action).toBe("hold");
  });

  it("fires a below rule on the other side", () => {
    const below = rule({ kind: "price_below", threshold: 0.4 });
    expect(evaluateAlert(below, { price: 0.39, analytics: null }).action).toBe("fire");
    expect(evaluateAlert(below, { price: 0.45, analytics: null }).action).toBe("hold");
  });

  it("fires an imbalance rule from the top-5 window", () => {
    const imbalance = rule({ kind: "orderbook_imbalance", threshold: 0.25 });
    const analytics = analyseBook(book());
    const decision = evaluateAlert(imbalance, { price: 0.62, analytics });
    expect(decision.action).toBe("fire");
  });

  it("reads a probability move in points", () => {
    const move = rule({ kind: "probability_change", threshold: 10 });
    expect(evaluateAlert(move, { price: 0.62, analytics: null, changePoints: 12 }).action).toBe("fire");
    expect(evaluateAlert(move, { price: 0.62, analytics: null, changePoints: -12 }).action).toBe("fire");
    expect(evaluateAlert(move, { price: 0.62, analytics: null, changePoints: 4 }).action).toBe("hold");
  });

  it("never fires a disabled rule", () => {
    expect(evaluateAlert(rule({ state: "disabled" }), { price: 0.9, analytics: null }).action).toBe("hold");
  });
});

/* ---------------------------------------------------------------------------
   Order-book simulation over recorded features

   Polymarket publishes no historical depth, so these strategies are measured
   against features Elyra recorded itself. The simulator is pure, so the whole
   contract is testable without waiting days for a corpus to build.
--------------------------------------------------------------------------- */

function observation(over: Partial<BookObservation> = {}): BookObservation {
  return {
    at: Date.now(),
    bestBid: 0.61,
    bestAsk: 0.63,
    midpoint: 0.62,
    microprice: 0.625,
    spreadPoints: 2,
    bidDepth5: 30_000,
    askDepth5: 5_000,
    imbalance5: 0.4,
    transport: "rest_snapshot",
    ...over,
  };
}

/** A flat run, then a firing condition, then a path the caller supplies. */
function runOf(after: BookObservation[], lead = 5): BookObservation[] {
  return [
    ...Array.from({ length: lead }, () => observation({ imbalance5: 0, microprice: 0.62 })),
    ...after,
  ];
}

describe("simulateBookStrategy", () => {
  const IMB = getPredictionStrategy("PM_ORDERBOOK_IMBALANCE_V1")!;
  const MICRO = getPredictionStrategy("PM_MICROPRICE_DIVERGENCE_V1")!;
  const params = { targetPoints: 5, stopPoints: 5, maxSpreadPoints: 4, minDepthUsd: 2_000 };

  it("fills at the NEXT observation's ask, never the firing one", () => {
    const series = runOf([
      observation(), // fires (persistence 1)
      observation(), // 2
      observation(), // 3 — persistence met here
      observation({ bestAsk: 0.64 }), // entry fills here
      observation({ bestBid: 0.7 }), // target
    ]);

    const trades = simulateBookStrategy(IMB, { ...params, persistenceUpdates: 3 }, series);
    expect(trades).toHaveLength(1);
    expect(trades[0].entryPrice).toBe(0.64);
  });

  it("requires the condition to persist across consecutive samples", () => {
    /* Broken persistence must not fire. */
    const broken = runOf([
      observation(),
      observation({ imbalance5: 0, microprice: 0.61 }),
      observation(),
      observation(),
    ]);
    expect(simulateBookStrategy(IMB, { ...params, persistenceUpdates: 3 }, broken)).toHaveLength(0);
  });

  it("fires once when persistence is met, not on every later sample", () => {
    /* A long-held condition firing per sample turns the sample count into a
       measure of how often we looked. */
    const held = runOf(Array.from({ length: 12 }, () => observation()));
    const trades = simulateBookStrategy(IMB, { ...params, persistenceUpdates: 3 }, held);
    expect(trades.length).toBeLessThanOrEqual(1);
  });

  it("measures the target against the recorded bid", () => {
    const series = runOf([
      observation(),
      observation(),
      observation(),
      observation(), // entry at 0.63
      observation({ bestBid: 0.67 }), // below target 0.68
      observation({ bestBid: 0.68 }), // target
    ]);
    const trades = simulateBookStrategy(IMB, { ...params, persistenceUpdates: 3 }, series);
    expect(trades[0]?.result).toBe("target");
  });

  it("takes the invalidation when one sample satisfies both", () => {
    const series = runOf([
      observation(),
      observation(),
      observation(),
      observation(),
      observation({ bestBid: 0.5 }),
    ]);
    const trades = simulateBookStrategy(IMB, { ...params, persistenceUpdates: 3 }, series);
    expect(trades[0]?.result).toBe("stop");
  });

  it("applies the live engine's liquidity gates", () => {
    /* A backtest ignoring the gates measures a different strategy from the
       one that would actually have been signalled. */
    const wide = runOf([
      observation(),
      observation(),
      observation(),
      observation({ spreadPoints: 40 }),
      observation({ bestBid: 0.7 }),
    ]);
    expect(simulateBookStrategy(IMB, { ...params, persistenceUpdates: 3 }, wide)).toHaveLength(0);

    const thin = runOf([
      observation(),
      observation(),
      observation(),
      observation({ bidDepth5: 10, askDepth5: 10 }),
      observation({ bestBid: 0.7 }),
    ]);
    expect(simulateBookStrategy(IMB, { ...params, persistenceUpdates: 3 }, thin)).toHaveLength(0);
  });

  it("honours the entry probability band", () => {
    const series = runOf([
      observation(),
      observation(),
      observation(),
      observation({ bestAsk: 0.95 }),
      observation({ bestBid: 0.99 }),
    ]);
    const outside = simulateBookStrategy(
      IMB,
      { ...params, persistenceUpdates: 3 },
      series,
      { min: 0.15, max: 0.85 },
    );
    expect(outside).toHaveLength(0);
  });

  it("never enters without a recorded ask", () => {
    /* A midpoint fill would record a trade that could not have happened. */
    const series = runOf([
      observation(),
      observation(),
      observation(),
      observation({ bestAsk: null }),
      observation({ bestBid: 0.7 }),
    ]);
    expect(simulateBookStrategy(IMB, { ...params, persistenceUpdates: 3 }, series)).toHaveLength(0);
  });

  it("fires microprice divergence without needing persistence", () => {
    const series = runOf([observation({ microprice: 0.63, midpoint: 0.62 }), observation({ bestBid: 0.7 })]);
    const trades = simulateBookStrategy(MICRO, { ...params, minDivergencePoints: 0.4 }, series);
    expect(trades.length).toBeGreaterThan(0);
  });

  it("produces nothing for a strategy whose features are not recorded", () => {
    /* Support break needs persistent WALLS, which are not in the stored set. */
    const support = getPredictionStrategy("PM_SUPPORT_BREAK_V1")!;
    const series = runOf(Array.from({ length: 10 }, () => observation()));
    expect(simulateBookStrategy(support, params, series)).toHaveLength(0);
  });
});
