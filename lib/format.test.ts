import { describe, expect, it } from "vitest";
import { formatClock12 } from "./format";

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
