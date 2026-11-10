import { describe, expect, it } from "vitest";
import {
  driftOf,
  heldUnits,
  isOutOfBand,
  minimumInvestmentUsd,
  planBuy,
  planRebalance,
  splitByWeight,
  truncateToDecimals,
  weightedMove,
} from "@/lib/invest/plan";
import type { PricedPortfolio } from "@/lib/invest/types";

function priced(
  holdings: Array<{ symbol: string; weightBps: number; priceUsd: number | null; change24hPct?: number | null; decimals?: number }>,
): PricedPortfolio {
  return {
    id: "test",
    name: "Test",
    category: "growth",
    risk: "moderate",
    summary: "",
    thesis: [],
    reviewedOn: "2026-11-09",
    holdings: holdings.map((holding) => ({
      symbol: holding.symbol,
      ticker: holding.symbol,
      name: holding.symbol,
      role: "",
      weightBps: holding.weightBps,
      mint: `${holding.symbol}-mint`,
      decimals: holding.decimals ?? 9,
      priceUsd: holding.priceUsd,
      change24hPct: holding.change24hPct ?? null,
    })),
  };
}

describe("splitByWeight", () => {
  it("always sums to exactly the total", () => {
    for (const total of [BigInt(100_000_000), BigInt(99_999_999), BigInt(1), BigInt(123_456_789)]) {
      const parts = splitByWeight(total, [3333, 3333, 3334]);
      expect(parts.reduce((sum, part) => sum + part, BigInt(0))).toBe(total);
    }
  });

  it("hands the leftover micro-dollars to the largest remainders, deterministically", () => {
    /* $1 by 33.33/33.33/33.34 divides exactly. Ten units three ways does not:
       3 each and one left over, and with equal remainders it goes to the
       first, so the same input always gives the same legs. */
    expect(splitByWeight(BigInt(1_000_000), [3333, 3333, 3334])).toEqual([
      BigInt(333_300),
      BigInt(333_300),
      BigInt(333_400),
    ]);
    expect(splitByWeight(BigInt(10), [1, 1, 1])).toEqual([BigInt(4), BigInt(3), BigInt(3)]);
  });
});

describe("planBuy", () => {
  const portfolio = { holdings: [
    { symbol: "A", ticker: "A", name: "A", role: "", weightBps: 6000 },
    { symbol: "B", ticker: "B", name: "B", role: "", weightBps: 4000 },
  ] };

  it("splits USDC by target weight as exact decimals", () => {
    const plan = planBuy(portfolio, "250.5");
    expect("legs" in plan && plan.legs.map((leg) => leg.amount)).toEqual(["150.3", "100.2"]);
  });

  it("refuses an amount below the minimum, and says what the minimum is", () => {
    expect(minimumInvestmentUsd(portfolio)).toBe(5);
    const plan = planBuy(portfolio, "4.99");
    expect("error" in plan && plan.error).toMatch(/\$5/);
  });

  it("refuses what is not an amount", () => {
    expect("error" in planBuy(portfolio, "abc")).toBe(true);
    expect("error" in planBuy(portfolio, "")).toBe(true);
    expect("error" in planBuy(portfolio, "0")).toBe(true);
  });
});

describe("isOutOfBand — the 5/25 rule", () => {
  it("uses 25% of target for small holdings", () => {
    expect(isOutOfBand(400, 500)).toBe(false); /* 1pp is exactly the band */
    expect(isOutOfBand(400, 501)).toBe(true);
    expect(isOutOfBand(400, 299)).toBe(true);
  });

  it("caps the band at five points for large holdings", () => {
    expect(isOutOfBand(4000, 4500)).toBe(false);
    expect(isOutOfBand(4000, 4501)).toBe(true);
    expect(isOutOfBand(4000, 3499)).toBe(true);
  });
});

describe("heldUnits", () => {
  it("shares a shortfall across the portfolios that recorded the token", () => {
    const result = heldUnits(
      { one: { NVDA: 3 }, two: { NVDA: 1, SOL: 2 } },
      { NVDA: 2, SOL: 5 },
    );
    expect(result.one.NVDA).toBeCloseTo(1.5);
    expect(result.two.NVDA).toBeCloseTo(0.5);
    /* More in the wallet than recorded: the extra is not the portfolio's. */
    expect(result.two.SOL).toBe(2);
  });

  it("drops a token the wallet no longer holds, and leaves units alone when the wallet is unread", () => {
    expect(heldUnits({ one: { NVDA: 3 } }, {})).toEqual({ one: {} });
    expect(heldUnits({ one: { NVDA: 3 } }, null)).toEqual({ one: { NVDA: 3 } });
  });
});

describe("driftOf", () => {
  const portfolio = priced([
    { symbol: "A", weightBps: 5000, priceUsd: 10 },
    { symbol: "B", weightBps: 5000, priceUsd: 20 },
  ]);

  it("values the position and measures each share against target", () => {
    const report = driftOf(portfolio, { A: 10, B: 5 });
    expect(report.totalUsd).toBe(200);
    expect(report.rows.map((row) => row.currentBps)).toEqual([5000, 5000]);
    expect(report.outOfBand).toBe(false);
  });

  it("flags a holding that has run away from its target", () => {
    const report = driftOf(portfolio, { A: 20, B: 5 });
    expect(report.rows[0].currentBps).toBeCloseTo(6666.67, 1);
    expect(report.outOfBand).toBe(true);
  });

  it("refuses a total when a held holding has no price, and names it", () => {
    const report = driftOf(priced([
      { symbol: "A", weightBps: 5000, priceUsd: null },
      { symbol: "B", weightBps: 5000, priceUsd: 20 },
    ]), { A: 1, B: 1 });
    expect(report.totalUsd).toBeNull();
    expect(report.unpriced).toEqual(["A"]);
    expect(report.rows.every((row) => row.currentBps === null)).toBe(true);
  });

  it("reports an unheld portfolio as not held, not as $0 drift", () => {
    const report = driftOf(portfolio, {});
    expect(report.held).toBe(false);
    expect(report.outOfBand).toBe(false);
  });
});

describe("planRebalance", () => {
  const portfolio = priced([
    { symbol: "A", weightBps: 5000, priceUsd: 10, decimals: 6 },
    { symbol: "B", weightBps: 5000, priceUsd: 20, decimals: 6 },
  ]);

  it("sells the overweight holding and buys the underweight one within what the sale raises", () => {
    const plan = planRebalance(portfolio, { A: 20, B: 5 });
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.sells).toHaveLength(1);
    expect(plan.sells[0]).toMatchObject({ symbol: "A", amount: "5" });
    expect(plan.raisedUsd).toBe(50);
    expect(plan.buys).toHaveLength(1);
    expect(plan.buys[0].symbol).toBe("B");
    expect(plan.buys[0].usd).toBeLessThanOrEqual(50 * 0.99);
  });

  it("finishes a purchase with new USDC and sells nothing", () => {
    const plan = planRebalance(portfolio, { A: 5 }, 50);
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.sells).toHaveLength(0);
    expect(plan.buys.map((leg) => [leg.symbol, leg.amount])).toEqual([["B", "50"]]);
  });

  it("leaves a difference under a leg's minimum alone", () => {
    const plan = planRebalance(portfolio, { A: 10.1, B: 5 });
    if ("error" in plan) throw new Error(plan.error);
    expect(plan.sells).toHaveLength(0);
    expect(plan.buys).toHaveLength(0);
  });

  it("never sells more than is held", () => {
    const plan = planRebalance(priced([
      { symbol: "A", weightBps: 1000, priceUsd: 10, decimals: 6 },
      { symbol: "B", weightBps: 9000, priceUsd: 20, decimals: 6 },
    ]), { A: 3.3333339 });
    if ("error" in plan) throw new Error(plan.error);
    expect(Number(plan.sells[0].amount)).toBeLessThanOrEqual(3.3333339);
  });

  it("will not size trades it cannot price", () => {
    const plan = planRebalance(priced([
      { symbol: "A", weightBps: 5000, priceUsd: null },
      { symbol: "B", weightBps: 5000, priceUsd: 20 },
    ]), { A: 1 });
    expect("error" in plan && plan.error).toMatch(/no price for A/);
  });
});

describe("truncateToDecimals", () => {
  it("truncates, never rounds up", () => {
    expect(truncateToDecimals(1.999999999, 6)).toBe("1.999999");
    expect(truncateToDecimals(0.3, 9)).toMatch(/^0\.29999999\d?$|^0\.3$/);
    expect(truncateToDecimals(0.0000001, 6)).toBeNull();
    expect(truncateToDecimals(-1, 6)).toBeNull();
  });
});

describe("weightedMove", () => {
  it("weights each move by target and says how much it covers", () => {
    const move = weightedMove(priced([
      { symbol: "A", weightBps: 6000, priceUsd: 1, change24hPct: 2 },
      { symbol: "B", weightBps: 3000, priceUsd: 1, change24hPct: -1 },
      { symbol: "C", weightBps: 1000, priceUsd: 1, change24hPct: null },
    ]));
    expect(move.coveredBps).toBe(9000);
    expect(move.pct).toBeCloseTo((6000 * 2 - 3000) / 9000);
  });
});
