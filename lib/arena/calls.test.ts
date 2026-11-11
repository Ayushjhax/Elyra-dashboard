import { describe, expect, it } from "vitest";
import {
  MIN_RATED,
  WEEKLY_POINTS,
  brierScore,
  calibration,
  canonicalStatement,
  isoWeek,
  receiptPayload,
  settleBacking,
  settleCall,
  validateBacking,
  validateCall,
  type CallStatus,
} from "@/lib/arena/calls";

/* ---------------------------------------------------------------------------
   A call is a statement and a probability, scored on calibration: the Brier
   score rewards saying 70% and being right seven times in ten, not saying
   99% on everything.
--------------------------------------------------------------------------- */

const NOW = Date.parse("2026-11-11T12:00:00.000Z");
const HOUR = 3_600_000;

const input = (overrides: Record<string, unknown> = {}) => ({
  market: "BTC",
  direction: "above",
  price: 95_000,
  resolvesAt: new Date(NOW + 24 * HOUR + 37_000).toISOString(),
  confidence: 70,
  visibility: "groups",
  ...overrides,
});

describe("validateCall", () => {
  it("accepts a call and rounds its resolution down to the minute", () => {
    const checked = validateCall(input(), NOW);
    expect(checked).toEqual({
      call: { market: "BTC", direction: "above", price: 95_000, resolvesAt: "2026-11-12T12:00:00.000Z", confidence: 70, visibility: "groups" },
    });
  });

  it("normalises the market to Hyperliquid's name and defaults visibility to private", () => {
    const checked = validateCall(input({ market: "btc", visibility: "everyone" }), NOW);
    expect("call" in checked && checked.call.market).toBe("BTC");
    expect("call" in checked && checked.call.visibility).toBe("private");
  });

  it.each([
    [{ market: "NOPE" }, "Choose one of Elyra's markets."],
    [{ direction: "sideways" }, "Choose above or below."],
    [{ price: 0 }, "Enter a price."],
    [{ price: "95000" }, "Enter a price."],
    [{ resolvesAt: "soon" }, "Choose when the call resolves."],
    [{ resolvesAt: new Date(NOW + 30 * 60_000).toISOString() }, "A call must resolve at least an hour from now."],
    [{ resolvesAt: new Date(NOW + 31 * 24 * HOUR).toISOString() }, "A call can look at most 30 days ahead."],
    [{ confidence: 49 }, "Confidence is a whole number from 50 to 99."],
    [{ confidence: 100 }, "Confidence is a whole number from 50 to 99."],
    [{ confidence: 70.5 }, "Confidence is a whole number from 50 to 99."],
  ])("refuses %o", (overrides, error) => {
    expect(validateCall(input(overrides), NOW)).toEqual({ error });
  });
});

describe("the receipt's text", () => {
  it("is fixed: changing it would change every receipt ever issued", () => {
    const statement = canonicalStatement({ market: "BTC", direction: "above", price: 95_000, resolvesAt: "2026-11-12T12:00:00.000Z", confidence: 70 });
    expect(statement).toBe("BTC closes above $95000 at 2026-11-12T12:00:00.000Z, 70% confident");
    expect(receiptPayload(statement, "2026-11-11T12:00:00.000Z")).toBe(
      "BTC closes above $95000 at 2026-11-12T12:00:00.000Z, 70% confident|2026-11-11T12:00:00.000Z",
    );
  });
});

describe("settling", () => {
  it("hits only strictly past the price", () => {
    expect(settleCall({ direction: "above", price: 100 }, 100.01)).toBe("hit");
    expect(settleCall({ direction: "above", price: 100 }, 100)).toBe("miss");
    expect(settleCall({ direction: "below", price: 100 }, 99.99)).toBe("hit");
    expect(settleCall({ direction: "below", price: 100 }, 100)).toBe("miss");
  });

  it("scores with the Brier score", () => {
    expect(brierScore(50, true)).toBe(0.25);
    expect(brierScore(50, false)).toBe(0.25);
    expect(brierScore(70, true)).toBeCloseTo(0.09);
    expect(brierScore(70, false)).toBeCloseTo(0.49);
    expect(brierScore(99, false)).toBeCloseTo(0.9801);
  });
});

describe("calibration", () => {
  const call = (status: CallStatus, confidence: number) => ({ status, confidence, brier: null });

  it("ignores open and void calls, and ranks only after MIN_RATED settled", () => {
    const some = [call("hit", 70), call("miss", 70), call("open", 90), call("void", 90)];
    const result = calibration(some);
    expect(result.settled).toBe(2);
    expect(result.hits).toBe(1);
    expect(result.brier).toBeCloseTo((0.09 + 0.49) / 2);
    expect(result.rated).toBe(false);
    expect(calibration(Array.from({ length: MIN_RATED }, () => call("hit", 60))).rated).toBe(true);
  });

  it("buckets what was said against how often it hit", () => {
    const result = calibration([call("hit", 72), call("hit", 78), call("miss", 75), call("hit", 95)]);
    const seventies = result.buckets.find((bucket) => bucket.label === "70–79%");
    expect(seventies).toEqual({ label: "70–79%", calls: 3, saidPct: 75, hitPct: (2 / 3) * 100 });
    expect(result.buckets.find((bucket) => bucket.label === "50–59%")).toEqual({ label: "50–59%", calls: 0, saidPct: null, hitPct: null });
    expect(result.buckets).toHaveLength(5);
  });

  it("has no score with nothing settled", () => {
    expect(calibration([]).brier).toBeNull();
  });
});

describe("isoWeek", () => {
  it.each([
    ["2026-11-11T12:00:00Z", "2026-W46"],
    ["2026-01-01T00:00:00Z", "2026-W01"],
    /* 1 January 2027 is a Friday: it belongs to 2026's last week. */
    ["2027-01-01T00:00:00Z", "2026-W53"],
    ["2024-12-30T00:00:00Z", "2025-W01"],
  ])("puts %s in %s", (at, week) => {
    expect(isoWeek(Date.parse(at))).toBe(week);
  });
});

describe("backing", () => {
  const context = { now: NOW, resolvesAt: new Date(NOW + 3 * HOUR).toISOString(), ownCall: false, status: "open" as CallStatus, spentThisWeek: 0 };

  it("accepts a tail or a fade within the week's budget", () => {
    expect(validateBacking({ stance: "tail", points: 25 }, context)).toEqual({ stance: "tail", points: 25 });
    expect(validateBacking({ stance: "fade", points: WEEKLY_POINTS }, context)).toEqual({ stance: "fade", points: WEEKLY_POINTS });
  });

  it.each([
    [{ stance: "tail", points: 10 }, { ownCall: true }, "You cannot back your own call."],
    [{ stance: "tail", points: 10 }, { status: "hit" as CallStatus }, "That call has settled."],
    [{ stance: "tail", points: 10 }, { resolvesAt: new Date(NOW + 59 * 60_000).toISOString() }, "Backing closes an hour before a call resolves."],
    [{ stance: "double", points: 10 }, {}, "Choose tail or fade."],
    [{ stance: "tail", points: 0 }, {}, "Back with a whole number of points."],
    [{ stance: "tail", points: 2.5 }, {}, "Back with a whole number of points."],
    [{ stance: "tail", points: 31 }, { spentThisWeek: 70 }, `You have 30 of this week's ${WEEKLY_POINTS} points left.`],
  ])("refuses %o with %o", (body, overrides, error) => {
    expect(validateBacking(body, { ...context, ...overrides })).toEqual({ error });
  });

  it("wins the points when the stance matched, loses them when not, and nothing on a void", () => {
    expect(settleBacking("tail", 20, "hit")).toBe(20);
    expect(settleBacking("tail", 20, "miss")).toBe(-20);
    expect(settleBacking("fade", 20, "miss")).toBe(20);
    expect(settleBacking("fade", 20, "hit")).toBe(-20);
    expect(settleBacking("tail", 20, "void")).toBe(0);
  });
});
