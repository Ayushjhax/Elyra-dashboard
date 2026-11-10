import { describe, expect, it } from "vitest";
import {
  HIDDEN_BARS,
  PUZZLE_MARKETS,
  START_RATING,
  VISIBLE_BARS,
  buildPuzzle,
  fnv1a,
  nextRating,
  nextStreak,
  puzzleNumber,
  puzzleSpec,
  ratingScore,
  shareText,
  utcDate,
  type Bar,
} from "@/lib/arena/puzzle";

/* ---------------------------------------------------------------------------
   One real chart per UTC day, chosen from the date alone, with the market
   and moment hidden; a rating that rewards calibration, so a coin-flip
   never moves it and confident misses cost more than confident hits gain.
--------------------------------------------------------------------------- */

const HOUR = 3_600_000;

/* Hourly bars in Hyperliquid's shape: closeTime is the last millisecond. */
function hourly(from: number, closes: number[]): Bar[] {
  return closes.map((close, index) => {
    const openTime = from + index * HOUR;
    const open = index === 0 ? close : closes[index - 1];
    return { openTime, closeTime: openTime + HOUR - 1, open, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1, close };
  });
}

describe("puzzleSpec", () => {
  it("is the same for everyone on a date, and differs across dates", () => {
    expect(puzzleSpec("2026-11-11")).toEqual(puzzleSpec("2026-11-11"));
    const specs = new Set(["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"].map((date) => JSON.stringify(puzzleSpec(date))));
    expect(specs.size).toBe(4);
  });

  it("picks a listed market, a moment 20 to 180 days back on the hour, and spans 72 + 12 bars", () => {
    for (let day = 0; day < 60; day += 1) {
      const date = utcDate(Date.parse("2026-11-11T00:00:00Z") + day * 86_400_000);
      const spec = puzzleSpec(date);
      const midnight = Date.parse(`${date}T00:00:00Z`);
      expect(PUZZLE_MARKETS).toContain(spec.market);
      expect(midnight - spec.endsAt).toBeGreaterThanOrEqual(20 * 86_400_000 - 23 * HOUR);
      expect(midnight - spec.endsAt).toBeLessThanOrEqual(180 * 86_400_000);
      expect(spec.endsAt % HOUR).toBe(0);
      expect(spec.endsAt - spec.startAt).toBe(VISIBLE_BARS * HOUR);
      expect(spec.revealUntil - spec.endsAt).toBe(HIDDEN_BARS * HOUR);
    }
  });

  it("hashes with FNV-1a", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
  });
});

describe("puzzleNumber and utcDate", () => {
  it("numbers from the first puzzle, 11 November 2026", () => {
    expect(puzzleNumber("2026-11-11")).toBe(1);
    expect(puzzleNumber("2026-12-11")).toBe(31);
    expect(utcDate(Date.parse("2026-11-11T23:59:59Z"))).toBe("2026-11-11");
  });
});

describe("buildPuzzle", () => {
  const endsAt = 1_000 * HOUR;
  const from = endsAt - (VISIBLE_BARS + 2) * HOUR;

  it("shows 72 bars up to the moment, hides the next 12, and rebases to 100", () => {
    /* Two spare bars before, 72 visible rising from 50, then 12 hidden falling. */
    const visible = Array.from({ length: VISIBLE_BARS + 2 }, (_, index) => 48 + index);
    const hidden = Array.from({ length: HIDDEN_BARS + 3 }, (_, index) => 120 - index);
    const built = buildPuzzle(hourly(from, [...visible, ...hidden]), { endsAt });
    expect(built).not.toBeNull();
    expect(built!.visible).toHaveLength(VISIBLE_BARS);
    expect(built!.reveal).toHaveLength(HIDDEN_BARS);
    expect(built!.visible[0].close).toBe(100);
    expect(built!.visible.at(-1)!.closeTime).toBe(endsAt - 1);
    expect(built!.reveal[0].openTime).toBe(endsAt);
    /* Last visible close 121, last hidden close 109. */
    expect(built!.outcome).toBe("down");
    expect(built!.changePct).toBeCloseTo(((109 - 121) / 121) * 100);
    /* Momentum: the last 12 visible bars rose. */
    expect(built!.botDirection).toBe("up");
  });

  it("counts an exact tie as down", () => {
    const flat = Array.from({ length: VISIBLE_BARS + 2 + HIDDEN_BARS }, () => 100);
    expect(buildPuzzle(hourly(from, flat), { endsAt })!.outcome).toBe("down");
  });

  it("refuses a chart without enough bars", () => {
    expect(buildPuzzle(hourly(from, Array.from({ length: VISIBLE_BARS + 2 + HIDDEN_BARS - 1 }, () => 100)), { endsAt })).toBeNull();
    expect(buildPuzzle(hourly(endsAt - 10 * HOUR, Array.from({ length: 30 }, () => 100)), { endsAt })).toBeNull();
  });

  it("does not depend on the order the bars arrive in", () => {
    const closes = Array.from({ length: VISIBLE_BARS + 2 + HIDDEN_BARS }, (_, index) => 100 + Math.sin(index));
    const bars = hourly(from, closes);
    expect(buildPuzzle([...bars].reverse(), { endsAt })).toEqual(buildPuzzle(bars, { endsAt }));
  });
});

describe("the rating", () => {
  it("never moves on a 50% answer", () => {
    expect(nextRating(START_RATING, 50, true)).toBe(START_RATING);
    expect(nextRating(START_RATING, 50, false)).toBe(START_RATING);
  });

  it("gains a little for confidence that was right and costs a lot for confidence that was wrong", () => {
    expect(ratingScore(70, true)).toBeCloseTo(0.91);
    expect(nextRating(1500, 70, true)).toBeCloseTo(1505.12);
    expect(nextRating(1500, 70, false)).toBeCloseTo(1492.32);
    expect(nextRating(1500, 99, true) - 1500).toBeLessThanOrEqual(8);
    expect(nextRating(1500, 99, false) - 1500).toBeLessThan(-23);
  });

  it("pays 90% only when right about nine times in ten", () => {
    const expected = (hitRate: number, confidence: number) =>
      hitRate * (nextRating(1500, confidence, true) - 1500) + (1 - hitRate) * (nextRating(1500, confidence, false) - 1500);
    expect(expected(0.9, 90)).toBeGreaterThan(0);
    expect(expected(0.7, 90)).toBeLessThan(expected(0.7, 70));
  });
});

describe("nextStreak", () => {
  it("counts days in a row, restarts after a gap, and holds on the same day", () => {
    expect(nextStreak(null, "2026-11-11")).toBe(1);
    expect(nextStreak({ date: "2026-11-10", streak: 4 }, "2026-11-11")).toBe(5);
    expect(nextStreak({ date: "2026-11-09", streak: 4 }, "2026-11-11")).toBe(1);
    expect(nextStreak({ date: "2026-11-11", streak: 4 }, "2026-11-11")).toBe(4);
    /* Across a month end. */
    expect(nextStreak({ date: "2026-11-30", streak: 2 }, "2026-12-01")).toBe(3);
  });
});

describe("shareText", () => {
  it("reads like a scorecard, with no emoji", () => {
    const text = shareText({ number: 41, direction: "up", confidence: 70, correct: true, ratingBefore: 1497.5, ratingAfter: 1512.4 });
    expect(text).toBe("Elyra Puzzle #41 · Up 70% · Correct · Rating 1,512 (+15)");
    expect(shareText({ number: 2, direction: "down", confidence: 80, correct: false, ratingBefore: 1500, ratingAfter: 1479.52 })).toBe(
      "Elyra Puzzle #2 · Down 80% · Wrong · Rating 1,480 (-20)",
    );
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
  });
});
