import { describe, expect, it } from "vitest";
import { buildPulse, toPulseRow } from "@/lib/market/pulse";
import type { PerpMarket } from "@/lib/providers/types";

const market = (symbol: string, overrides: Partial<PerpMarket>): PerpMarket => ({
  symbol,
  provider: "hyperliquid",
  markPrice: 100,
  indexPrice: 100,
  fundingRate: 0.00001,
  fundingIntervalHours: 1,
  nextFundingAt: null,
  openInterest: 1_000,
  volume24hUsd: 5_000_000,
  maxLeverage: 10,
  prevDayPrice: 100,
  ...overrides,
});

describe("toPulseRow", () => {
  it("annualises hourly funding and values open interest at the mark", () => {
    const row = toPulseRow(market("SOL", { markPrice: 150, prevDayPrice: 120, fundingRate: 0.0000125, openInterest: 2_000 }))!;
    expect(row.change24hPct).toBeCloseTo(25, 6);
    expect(row.fundingAprPct).toBeCloseTo(10.95, 2);
    expect(row.openInterestUsd).toBe(300_000);
  });

  it("leaves out delisted and unpriced markets", () => {
    expect(toPulseRow(market("OLD", { delisted: true }))).toBeNull();
    expect(toPulseRow(market("NIL", { markPrice: null }))).toBeNull();
  });
});

describe("buildPulse", () => {
  const pulse = buildPulse([
    market("UP", { markPrice: 130 }),
    market("DOWN", { markPrice: 80, fundingRate: -0.0001 }),
    market("FLAT", { markPrice: 100, openInterest: 50_000 }),
    market("THIN", { markPrice: 300, volume24hUsd: 20_000 }),
  ]);

  it("ranks movers among liquid markets only", () => {
    expect(pulse.gainers.map((row) => row.symbol)).toEqual(["UP"]);
    expect(pulse.losers.map((row) => row.symbol)).toEqual(["DOWN"]);
    expect(pulse.gainers.some((row) => row.symbol === "THIN")).toBe(false);
  });

  it("only calls funding high when it is above the resting rate", () => {
    const resting = buildPulse([market("REST", { fundingRate: 0.0000125 }), market("HOT", { fundingRate: 0.0001 })]);
    expect(resting.fundingHigh.map((row) => row.symbol)).toEqual(["HOT"]);
  });

  it("splits funding by who pays, and ranks size across everything", () => {
    expect(pulse.fundingLow.map((row) => row.symbol)).toEqual(["DOWN"]);
    expect(pulse.openInterest[0].symbol).toBe("FLAT");
    expect(pulse.markets).toBe(4);
  });
});
