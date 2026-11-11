import { describe, expect, it } from "vitest";
import { THRESHOLDS, factLines, fallbackCoaching, labelTrade, reviewFacts, type ReviewInput } from "@/lib/arena/review";

/* ---------------------------------------------------------------------------
   Trade Review labels a trade by how it was played against its own plan:
   a planned loss is Good, a winner given back is not, and a loss past the
   plan is a Mistake or a Blunder whatever the market did.
--------------------------------------------------------------------------- */

/* A long at 100 with a stop at 98 and a target at 104: 1R is $2 a unit. */
function trade(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return {
    side: "long",
    coin: "BTC",
    mode: "paper",
    size: 10,
    entryPrice: 100,
    exitPrice: 104,
    takeProfit: 104,
    stopLoss: 98,
    leverage: 2,
    exitReason: "take_profit",
    realisedPnlUsd: 40,
    openedAt: "2026-11-10T10:00:00.000Z",
    closedAt: "2026-11-10T14:30:00.000Z",
    ...overrides,
  };
}

const bars = (high: number, low: number) => [
  { high: (high + 100) / 2, low: 99.5 },
  { high, low },
];

describe("reviewFacts", () => {
  it("measures the result in planned risk, and how much of the best move it kept", () => {
    const facts = reviewFacts(trade(), bars(105, 99));
    expect(facts.plannedRiskUsd).toBe(20);
    expect(facts.rMultiple).toBe(2);
    expect(facts.plannedRewardRisk).toBe(2);
    expect(facts.bestPrice).toBe(105);
    expect(facts.capture).toBeCloseTo(0.8);
    expect(facts.heatPct).toBeCloseTo(1);
    expect(facts.heldToPlan).toBe(true);
    expect(facts.holdMinutes).toBe(270);
    expect(facts.sizeUsd).toBe(1_000);
    expect(facts.sizeOfMaxPct).toBe(20);
  });

  it("mirrors best and worst for a short", () => {
    const facts = reviewFacts(
      trade({ side: "short", exitPrice: 96, takeProfit: 96, stopLoss: 102, realisedPnlUsd: 40 }),
      [{ high: 101, low: 95 }],
    );
    expect(facts.bestPrice).toBe(95);
    expect(facts.worstPrice).toBe(101);
    expect(facts.capture).toBeCloseTo(0.8);
    expect(facts.heatPct).toBeCloseTo(1);
  });

  it("estimates fees only on paper, and leaves excursions unknown without bars", () => {
    const paper = reviewFacts(trade(), []);
    expect(paper.feesUsd).toBeCloseTo((10 * 204 * 0.045) / 100);
    expect(paper.bestPrice).toBeNull();
    expect(paper.capture).toBeNull();
    expect(paper.heatPct).toBeNull();
    expect(reviewFacts(trade({ mode: "live" }), []).feesUsd).toBeNull();
  });

  it("has no R when the plan had no risk", () => {
    const facts = reviewFacts(trade({ stopLoss: 100 }), []);
    expect(facts.rMultiple).toBeNull();
    expect(labelTrade(facts)).toBe("good");
    expect(labelTrade(reviewFacts(trade({ stopLoss: 100, realisedPnlUsd: -1 }), []))).toBe("inaccuracy");
  });
});

describe("labelTrade", () => {
  const label = (overrides: Partial<ReviewInput>, high = 105, low = 99) => labelTrade(reviewFacts(trade(overrides), bars(high, low)));

  it("calls a 2R win that kept most of the move brilliant", () => {
    expect(label({})).toBe("brilliant");
  });

  it("calls a 2R win that left too much behind great, not brilliant", () => {
    /* Best 110: kept 4 of 10. */
    expect(label({}, 110)).toBe("great");
  });

  it("calls a 1R win on plan great", () => {
    expect(label({ exitPrice: 102, realisedPnlUsd: 20 }, 102.5)).toBe("great");
  });

  it("calls a small planned win good", () => {
    expect(label({ exitPrice: 101, realisedPnlUsd: 10, exitReason: "exit_rule" }, 101.5)).toBe("good");
  });

  it("calls the planned loss at the stop good", () => {
    expect(label({ exitPrice: 98, realisedPnlUsd: -20, exitReason: "stop_loss" }, 100.5, 98)).toBe("good");
  });

  it("calls a small win that gave back most of the move an inaccuracy", () => {
    /* +0.25R, best 106: kept 0.5 of 6. */
    expect(label({ exitPrice: 100.5, realisedPnlUsd: 5, exitReason: "exit_rule" }, 106)).toBe("inaccuracy");
  });

  it("calls a stop that slipped past 1.1R a mistake", () => {
    expect(label({ exitPrice: 97.6, realisedPnlUsd: -24, exitReason: "stop_loss" }, 100.5, 97.5)).toBe("mistake");
  });

  it("calls abandoning the plan into a loss a mistake, and past 1R a blunder", () => {
    expect(label({ exitPrice: 99, realisedPnlUsd: -10, exitReason: "manual" }, 100.5, 98.8)).toBe("mistake");
    expect(label({ exitPrice: 97.8, realisedPnlUsd: -22, exitReason: null }, 100.5, 97.5)).toBe("blunder");
  });

  it("calls a loss beyond 1.5R a blunder even on a planned exit", () => {
    expect(label({ exitPrice: 96.8, realisedPnlUsd: -32, exitReason: "stop_loss" }, 100.5, 96)).toBe("blunder");
  });

  it("holds the documented thresholds", () => {
    expect(THRESHOLDS).toEqual({
      blunderR: -1.5,
      abandonedBlunderR: -1,
      mistakeR: -1.1,
      brilliantR: 2,
      brilliantCapture: 0.7,
      greatR: 1,
      gaveBackCapture: 0.3,
    });
  });
});

describe("factLines and fallbackCoaching", () => {
  it("states the facts the writer may use, with the computed label", () => {
    const facts = reviewFacts(trade(), bars(105, 99));
    const lines = factLines(facts, "brilliant");
    expect(lines[0]).toBe("Label: Brilliant");
    expect(lines).toContain("Entry $100, exit $104, closed at its take-profit");
    expect(lines).toContain("Result: $40.00 (2.0R)");
    expect(lines).toContain("Kept 80% of the best move");
  });

  it("writes plain coaching from code, with no exclamation marks", () => {
    const facts = reviewFacts(trade({ exitPrice: 98, realisedPnlUsd: -20, exitReason: "stop_loss" }), bars(100.5, 98));
    const text = fallbackCoaching(facts, "good");
    expect(text).toContain("It closed on its plan for -1.0R.");
    expect(text).toContain("Taking the planned loss is the right move");
    expect(text).not.toContain("!");
  });
});
