import { describe, expect, it } from "vitest";
import {
  bestPerformer,
  boundsOf,
  byEvent,
  byOutcome,
  exposureOf,
  largestPosition,
  matchingSymbol,
  moveInPoints,
  nextResolution,
  resolvingWithin,
  shareOfPortfolio,
  worstPerformer,
} from "@/lib/prediction/analytics";
import type { PredictionPosition } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Prediction-market arithmetic.

   These are the figures a model reports as facts, so they have to BE facts.
   The interesting cases are all about what a prediction position is: shares
   that settle at exactly $1 or $0, which makes downside bounded and knowable
   in a way a spot holding's never is.
--------------------------------------------------------------------------- */

const NOW = Date.parse("2026-09-16T00:00:00.000Z");

function position(over: Partial<PredictionPosition> = {}): PredictionPosition {
  return {
    id: "tok-1",
    provider: "polymarket",
    accountId: "0xabc",
    marketId: "0xcond",
    eventId: "ev-1",
    marketTitle: "Will BTC be above $100k on Dec 31?",
    slug: null,
    outcome: "Yes",
    outcomeIndex: 0,
    quantity: 100,
    entryPrice: 0.4,
    currentPrice: 0.6,
    costBasisUsd: 40,
    currentValueUsd: 60,
    pnlUsd: 20,
    pnlPct: 50,
    endsAt: "2026-12-31T00:00:00.000Z",
    status: "open",
    ...over,
  };
}

describe("exposureOf", () => {
  it("bounds loss at current value and payout at share count", () => {
    /* The defining property. 100 shares worth $60 today can lose exactly $60
       and can pay exactly $100 — both are arithmetic, not forecasts, which is
       why they may be stated as facts. */
    const exposure = exposureOf([position()]);

    expect(exposure.currentValueUsd).toBe(60);
    expect(exposure.maxLossUsd).toBe(60);
    expect(exposure.maxPayoutUsd).toBe(100);
    expect(exposure.maxProfitUsd).toBe(40);
  });

  it("measures risk from current value, not cost basis", () => {
    /* A position bought for $400 now worth $60 has $60 at risk. Counting the
       $340 already lost would overstate what is actually exposed today. */
    const exposure = exposureOf([position({ costBasisUsd: 400, currentValueUsd: 60 })]);

    expect(exposure.maxLossUsd).toBe(60);
    expect(exposure.unrealisedPnlUsd).toBe(-340);
  });

  it("counts an unvalued position separately instead of as zero", () => {
    /* Treating a null as 0 understates exposure while looking complete. */
    const exposure = exposureOf([position(), position({ id: "t2", currentValueUsd: null })]);

    expect(exposure.currentValueUsd).toBe(60);
    expect(exposure.unvaluedCount).toBe(1);
    expect(exposure.openCount).toBe(2);
  });

  it("ignores positions that are already closed", () => {
    const exposure = exposureOf([position({ status: "closed" })]);
    expect(exposure.openCount).toBe(0);
    expect(exposure.currentValueUsd).toBe(0);
  });

  it("surfaces unclaimed winnings separately", () => {
    /* Money that settled in the user's favour and is sitting unclaimed is the
       single most actionable thing in a prediction portfolio. */
    const exposure = exposureOf([
      position(),
      position({ id: "t2", status: "claimable", currentValueUsd: 250 }),
    ]);

    expect(exposure.claimableCount).toBe(1);
    expect(exposure.claimableValueUsd).toBe(250);
    expect(exposure.currentValueUsd).toBe(310);
  });
});

describe("boundsOf", () => {
  it("returns null rather than guessing when shares are unknown", () => {
    expect(boundsOf(position({ quantity: null })).maxPayoutUsd).toBeNull();
    expect(boundsOf(position({ currentValueUsd: null })).maxLossUsd).toBeNull();
  });
});

describe("ranking", () => {
  const set = [
    position({ id: "a", currentValueUsd: 60, pnlUsd: 20 }),
    position({ id: "b", currentValueUsd: 500, pnlUsd: -80 }),
    position({ id: "c", currentValueUsd: 120, pnlUsd: 5 }),
  ];

  it("finds the largest by value", () => {
    expect(largestPosition(set)?.id).toBe("b");
  });

  it("finds the best and worst performers", () => {
    expect(bestPerformer(set)?.id).toBe("a");
    expect(worstPerformer(set)?.id).toBe("b");
  });

  it("reports no best performer when nothing is up", () => {
    /* A "best performer" that is losing money is not a winner, and calling it
       one would read as good news. */
    const losing = [position({ pnlUsd: -5 }), position({ id: "x", pnlUsd: -50 })];
    expect(bestPerformer(losing)).toBeNull();
    expect(worstPerformer(losing)?.id).toBe("x");
  });
});

describe("resolution windows", () => {
  it("returns positions resolving inside the window, soonest first", () => {
    const soon = position({ id: "soon", endsAt: "2026-09-17T00:00:00.000Z" });
    const later = position({ id: "later", endsAt: "2026-09-20T00:00:00.000Z" });
    const far = position({ id: "far", endsAt: "2026-12-31T00:00:00.000Z" });

    const rows = resolvingWithin([far, later, soon], 24 * 7, NOW);
    expect(rows.map((r) => r.id)).toEqual(["soon", "later"]);
  });

  it("excludes a position whose end date cannot be parsed", () => {
    /* Unknown is not "soon". Guessing either way would alarm or reassure
       without cause. */
    const rows = resolvingWithin([position({ endsAt: "whenever" })], 24 * 7, NOW);
    expect(rows).toHaveLength(0);
  });

  it("excludes an already-past date", () => {
    const rows = resolvingWithin([position({ endsAt: "2026-01-01T00:00:00.000Z" })], 24, NOW);
    expect(rows).toHaveLength(0);
  });

  it("finds the next resolution", () => {
    const rows = [
      position({ id: "far", endsAt: "2026-12-31T00:00:00.000Z" }),
      position({ id: "near", endsAt: "2026-09-18T00:00:00.000Z" }),
    ];
    expect(nextResolution(rows, NOW)?.id).toBe("near");
  });
});

describe("concentration", () => {
  it("groups several outcomes of one event as one bet", () => {
    /* Three positions across one event's outcomes is one bet on one question.
       A by-market view would report it as diversified, which is the opposite
       of what is true. */
    const rows = byEvent([
      position({ id: "a", eventId: "fed", currentValueUsd: 100 }),
      position({ id: "b", eventId: "fed", currentValueUsd: 200 }),
      position({ id: "c", eventId: "btc", currentValueUsd: 100 }),
    ]);

    expect(rows[0].valueUsd).toBe(300);
    expect(rows[0].positionCount).toBe(2);
    expect(rows[0].pctOfPrediction).toBeCloseTo(75, 5);
  });

  it("does not lump ungrouped positions into one fake event", () => {
    const rows = byEvent([
      position({ id: "a", eventId: null, marketId: "m1", currentValueUsd: 100 }),
      position({ id: "b", eventId: null, marketId: "m2", currentValueUsd: 100 }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("groups by outcome label", () => {
    const rows = byOutcome([
      position({ id: "a", outcome: "Yes", currentValueUsd: 300 }),
      position({ id: "b", outcome: "No", currentValueUsd: 100 }),
    ]);
    expect(rows[0].label).toBe("Yes");
    expect(rows[0].pctOfPrediction).toBeCloseTo(75, 5);
  });
});

describe("shareOfPortfolio", () => {
  it("computes a share when equity is known", () => {
    expect(shareOfPortfolio(1_000, 10_000)).toBeCloseTo(10, 6);
  });

  it("is null when equity is unknown or non-positive", () => {
    /* A percentage of an unknown denominator is not a small number — it is
       not a number, and rendering it as 0% or 100% would both be claims. */
    expect(shareOfPortfolio(1_000, null)).toBeNull();
    expect(shareOfPortfolio(1_000, 0)).toBeNull();
  });
});

describe("moveInPoints", () => {
  it("reports percentage points, not relative change", () => {
    /* 54% to 64% is a TEN POINT move and an 18.5% relative move. An alert
       built on the second fires about twice as often as asked. */
    expect(moveInPoints(0.54, 0.64)).toBeCloseTo(10, 6);
    expect(moveInPoints(0.02, 0.04)).toBeCloseTo(2, 6);
  });

  it("is signed", () => {
    expect(moveInPoints(0.64, 0.54)).toBeCloseTo(-10, 6);
  });
});

describe("matchingSymbol", () => {
  it("matches an asset named in the market title", () => {
    const rows = matchingSymbol([position()], "BTC");
    expect(rows).toHaveLength(1);
  });

  it("matches the asset's full name", () => {
    const rows = matchingSymbol(
      [position({ marketTitle: "Will Ethereum flip Bitcoin in 2026?" })],
      "ETH",
    );
    expect(rows).toHaveLength(1);
  });

  it("does not match a symbol embedded inside another word", () => {
    /* A substring search matches "ETH" inside "whether" and reports an
       unrelated market as ETH exposure. */
    const rows = matchingSymbol(
      [position({ marketTitle: "Will they decide whether to proceed?" })],
      "ETH",
    );
    expect(rows).toHaveLength(0);
  });

  it("returns nothing for a symbol too short to be meaningful", () => {
    expect(matchingSymbol([position()], "B")).toHaveLength(0);
  });

  it("returns nothing for a symbol that is only punctuation", () => {
    /* The length check ran on the raw string while the pattern used the
       stripped one, so "$$" compiled to /\b\b/ and reported every market
       with a word in its title as exposure to it. */
    expect(matchingSymbol([position()], "$$")).toHaveLength(0);
    expect(matchingSymbol([position()], "---")).toHaveLength(0);
  });

  it("ignores a leading ticker sigil", () => {
    expect(matchingSymbol([position()], "$BTC")).toHaveLength(1);
  });
});
