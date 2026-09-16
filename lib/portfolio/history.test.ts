import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpotHolding } from "@/lib/portfolio/types";

/* The candle source is the only thing `reconstruct` reaches out to, so it is
   the only thing mocked. Everything below is about what the function does
   with what it gets back — which is where the behaviour that could mislead
   someone lives. */
const candles = vi.hoisted(() => vi.fn());
vi.mock("@/lib/market/router", () => ({ candles }));

const { reconstruct } = await import("@/lib/portfolio/history");

function holding(over: Partial<SpotHolding> = {}): SpotHolding {
  return {
    id: "wallet:SOL", venue: "wallet", chain: "Solana", address: null,
    symbol: "SOL", name: "Solana", logo: null, quantity: 10, decimals: 9,
    priceUsd: 100, valueUsd: 1000, change24hPct: null, allocationPct: null,
    avgCostUsd: null, pnlUsd: null, pnlPct: null, verified: true, liquid: false,
    ...over,
  };
}

/** Minimal candle rows: only openTime and close are read. */
function series(closes: Array<[number, number]>) {
  return closes.map(([openTime, close]) => ({
    openTime, open: close, high: close, low: close, close, volume: 0, closeTime: openTime,
  }));
}

beforeEach(() => {
  candles.mockReset();
});

describe("reconstruct", () => {
  it("values today's quantity at each past close", () => {
    candles.mockResolvedValue(series([[1_000, 90], [2_000, 100], [3_000, 110]]));

    return reconstruct([holding({ quantity: 10 })], "1M").then((result) => {
      expect(result.basis).toBe("reconstructed");
      expect(result.points.map((point) => point.totalValueUsd)).toEqual([900, 1000, 1100]);
    });
  });

  it("holds stablecoins flat instead of dropping them", async () => {
    /* No venue lists a USDC/USD candle. Excluding the holding would make a
       stablecoin-heavy portfolio look far more volatile than it is. */
    candles.mockImplementation((symbol: string) =>
      symbol === "SOL"
        ? Promise.resolve(series([[1_000, 90], [2_000, 110]]))
        : Promise.resolve([]),
    );

    const result = await reconstruct(
      [
        holding({ id: "a", symbol: "SOL", quantity: 10, valueUsd: 1000 }),
        holding({ id: "b", symbol: "USDC", quantity: 500, valueUsd: 500, liquid: true }),
      ],
      "1M",
    );

    expect(result.points.map((point) => point.totalValueUsd)).toEqual([1400, 1600]);
    expect(result.uncovered).not.toContain("USDC");
  });

  it("uses the intersection of timestamps, never the union", async () => {
    /* A symbol missing a candle at time T would otherwise drop out of the sum
       there and put a step in the line that no price ever made. */
    candles.mockImplementation((symbol: string) =>
      symbol === "SOL"
        ? Promise.resolve(series([[1_000, 10], [2_000, 10], [3_000, 10]]))
        : Promise.resolve(series([[1_000, 20], [3_000, 20]])),
    );

    const result = await reconstruct(
      [
        holding({ id: "a", symbol: "SOL", quantity: 1, valueUsd: 10 }),
        holding({ id: "b", symbol: "ETH", quantity: 1, valueUsd: 20 }),
      ],
      "1M",
    );

    expect(result.points).toHaveLength(2);
    expect(result.points.every((point) => point.totalValueUsd === 30)).toBe(true);
  });

  it("reports what it could not price rather than silently shrinking the line", async () => {
    candles.mockImplementation((symbol: string) =>
      symbol === "SOL"
        ? Promise.resolve(series([[1_000, 100], [2_000, 100]]))
        : Promise.resolve([]),
    );

    const result = await reconstruct(
      [
        holding({ id: "a", symbol: "SOL", quantity: 1, valueUsd: 100 }),
        holding({ id: "b", symbol: "WIF", quantity: 1, valueUsd: 100 }),
      ],
      "1M",
    );

    expect(result.uncovered).toContain("WIF");
    expect(result.coveragePct).toBeCloseTo(50, 6);
  });

  it("returns nothing rather than a line when no candle source answers", async () => {
    /* The failure that matters. A single point interpolated into a series, or
       a flat line at today's value, would be a picture of performance that
       never happened. */
    candles.mockResolvedValue([]);
    const result = await reconstruct([holding()], "1M");
    expect(result.points).toEqual([]);
    expect(result.basis).toBe("none");
  });

  it("ignores unverified holdings", async () => {
    candles.mockResolvedValue(series([[1_000, 100], [2_000, 100]]));
    const result = await reconstruct([holding({ verified: false })], "1M");
    expect(result.basis).toBe("none");
  });
});
