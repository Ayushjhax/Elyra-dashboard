import { describe, expect, it } from "vitest";
import { nearestLevels, pivotLevels } from "@/lib/market/levels";
import type { Candle } from "@/lib/market/types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-14T12:00:00Z");
const TODAY = Date.parse("2026-10-14T00:00:00Z");

const candle = (openTime: number, high: number, low: number, close: number): Candle => ({
  openTime,
  open: low,
  high,
  low,
  close,
  volume: 1,
});

describe("pivotLevels", () => {
  it("uses the last completed day, not today's forming candle", () => {
    const levels = pivotLevels(
      [candle(TODAY - DAY, 110, 100, 106), candle(TODAY, 200, 50, 60)],
      NOW,
    );
    /* P = (110 + 100 + 106) / 3 = 105.333… */
    expect(levels?.pivot).toBeCloseTo(105.3333, 3);
    expect(levels?.r1).toBeCloseTo(110.6667, 3);
    expect(levels?.s1).toBeCloseTo(100.6667, 3);
    expect(levels?.r2).toBeCloseTo(115.3333, 3);
    expect(levels?.s2).toBeCloseTo(95.3333, 3);
    expect(levels?.basedOn).toBe(TODAY - DAY);
  });

  it("orders levels from S2 to R2", () => {
    const levels = pivotLevels([candle(TODAY - DAY, 0.0000045, 0.000004, 0.0000042)], NOW)!;
    expect(levels.s2).toBeLessThan(levels.s1);
    expect(levels.s1).toBeLessThan(levels.pivot);
    expect(levels.pivot).toBeLessThan(levels.r1);
    expect(levels.r1).toBeLessThan(levels.r2);
  });

  it("returns null with no completed day or a broken candle", () => {
    expect(pivotLevels([candle(TODAY, 110, 100, 105)], NOW)).toBeNull();
    expect(pivotLevels([candle(TODAY - DAY, 100, 110, 105)], NOW)).toBeNull();
    expect(pivotLevels([], NOW)).toBeNull();
  });
});

describe("nearestLevels", () => {
  it("finds the levels either side of the price", () => {
    const levels = pivotLevels([candle(TODAY - DAY, 110, 100, 106)], NOW)!;
    const { above, below } = nearestLevels(levels, 107);
    expect(above?.name).toBe("R1");
    expect(below?.name).toBe("Pivot");
    expect(above!.pct).toBeGreaterThan(0);
    expect(below!.pct).toBeLessThan(0);
  });
});
