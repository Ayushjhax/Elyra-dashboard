import { describe, expect, it } from "vitest";
import { formatAge, formatClock12 } from "./format";

/**
 * Built from a local-time string, so the expectation holds whatever timezone
 * the machine running the suite is in — the formatter reads local time by
 * design, and pinning UTC here would only test the test.
 */
function localTime(iso: string): number {
  return new Date(iso).getTime();
}

describe("formatClock12", () => {
  it("renders the afternoon with no separator, as the status bar wants it", () => {
    expect(formatClock12(localTime("2026-09-06T15:32:00"))).toBe("03:32PM");
  });

  it("zero-pads the hour so the column cannot jitter", () => {
    /* The status bar sets tabular figures; a one-character hour would still
       shift the whole group left at 09:59 and back at 10:00. */
    expect(formatClock12(localTime("2026-09-06T09:05:00"))).toBe("09:05AM");
    expect(formatClock12(localTime("2026-09-06T09:05:00")).length).toBe(
      formatClock12(localTime("2026-09-06T11:05:00")).length,
    );
  });

  it("puts midnight and noon on the right side of twelve", () => {
    /* The classic off-by-twelve. Midnight is 12AM, not 00AM or 12PM. */
    expect(formatClock12(localTime("2026-09-06T00:05:00"))).toBe("12:05AM");
    expect(formatClock12(localTime("2026-09-06T12:05:00"))).toBe("12:05PM");
  });

  it("strips a narrow no-break space as readily as a plain one", () => {
    /* Since ICU 72 the space Intl puts before the day period is U+202F, not
       U+0020. A replace(" ", "") silently stopped working on that upgrade;
       this asserts no whitespace of any width survives. */
    expect(formatClock12(localTime("2026-09-06T15:32:00"))).not.toMatch(/\s/);
    expect(formatClock12(localTime("2026-09-06T15:32:00"))).not.toContain(" ");
  });
});

describe("formatAge", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  it("counts seconds while a reading is fresh, then minutes and hours", () => {
    expect(formatAge(now - 2_000, now)).toBe("just now");
    expect(formatAge(now - 8_000, now)).toBe("8s ago");
    expect(formatAge(now - 3 * 60_000, now)).toBe("3m ago");
    expect(formatAge(now - 2 * 3_600_000, now)).toBe("2h ago");
    /* A clock that reads slightly behind the stamp is not "in the future". */
    expect(formatAge(now + 1_000, now)).toBe("just now");
  });
});
