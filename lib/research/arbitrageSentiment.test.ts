import { describe, expect, it } from "vitest";
import {
  annualise,
  arbitrageRow,
  BASIS_ROUND_TRIP_BPS,
  clearsCosts,
  FUNDING_ROUND_TRIP_BPS,
  MIN_SPOT_VOLUME_USD,
  rankArbitrage,
  sameAsset,
  type ArbitrageInput,
} from "@/lib/research/arbitrageMath";
import { leaning, parseFearGreed, positioning, type PerpReading, type Positioning } from "@/lib/research/sentimentMath";

const input = (overrides: Partial<ArbitrageInput> = {}): ArbitrageInput => ({
  symbol: "BTC",
  hyperliquid: { mark: 100, fundingRate: 0.0000125, fundingIntervalHours: 1, volume24hUsd: 1e9 },
  binanceSpot: 100,
  binanceSpotVolumeUsd: 1e9,
  binancePerp: { mark: 100, fundingRate: 0.0001, fundingIntervalHours: 8 },
  ...overrides,
});

describe("annualise", () => {
  it("turns a per-interval rate into an annual percentage", () => {
    expect(annualise(0.0001, 8)).toBeCloseTo(10.95);
    expect(annualise(0.0000125, 1)).toBeCloseTo(10.95);
  });

  it("assumes eight hours when the interval is unknown, and null stays null", () => {
    expect(annualise(0.0001, null)).toBeCloseTo(10.95);
    expect(annualise(null, 8)).toBeNull();
  });
});

describe("arbitrageRow", () => {
  it("prices the fees: 29 bps for basis, 19 for funding at base tiers", () => {
    expect(BASIS_ROUND_TRIP_BPS).toBeCloseTo(29);
    expect(FUNDING_ROUND_TRIP_BPS).toBeCloseTo(19);
  });

  it("measures a perp above spot and what is left after fees", () => {
    const row = arbitrageRow(input({ hyperliquid: { ...input().hyperliquid, mark: 100.5 } }));
    expect(row.basisBps).toBeCloseTo(50);
    expect(row.netBasisBps).toBeCloseTo(50 - BASIS_ROUND_TRIP_BPS);
    expect(row.basisSide).toBe("perp-rich");
  });

  it("calls a gap inside the fees what it is", () => {
    const row = arbitrageRow(input({ hyperliquid: { ...input().hyperliquid, mark: 99.9 } }));
    expect(row.basisSide).toBe("perp-cheap");
    expect(row.netBasisBps).toBeLessThan(0);
    expect(clearsCosts(row)).toBe(false);
  });

  it("has no funding spread when the two venues pay the same", () => {
    const row = arbitrageRow(input());
    expect(row.fundingSpreadApr).toBeCloseTo(0);
    expect(row.breakEvenDays).toBeNull();
  });

  it("counts the days a funding spread takes to pay its fees", () => {
    /* Hyperliquid at 0.01%/h is 87.6% a year; Binance 10.95%: 76.65 pts apart. */
    const row = arbitrageRow(input({ hyperliquid: { ...input().hyperliquid, fundingRate: 0.0001 } }));
    expect(row.fundingSpreadApr).toBeCloseTo(76.65);
    expect(row.fundingSide).toBe("hyperliquid-pays-more");
    expect(row.breakEvenDays).toBeCloseTo(FUNDING_ROUND_TRIP_BPS / ((76.65 * 100) / 365));
    expect(clearsCosts(row)).toBe(true);
  });

  it("refuses a price that cannot be the same asset — a shared ticker or a delisted pair", () => {
    /* XMR: Hyperliquid's perp at $437 against the last price of Binance's delisted pair. */
    const stale = arbitrageRow(input({ symbol: "XMR", hyperliquid: { ...input().hyperliquid, mark: 437.81 }, binanceSpot: 118.7, binancePerp: { mark: 437.5, fundingRate: 0.0001, fundingIntervalHours: 8 } }));
    expect(stale.binanceSpot).toBeNull();
    expect(stale.basisBps).toBeNull();
    expect(stale.binanceFundingApr).not.toBeNull();
    expect(stale.excluded).toBe(true);
    expect(clearsCosts(stale)).toBe(false);
    /* LIT: a different token on each venue, spot and perp alike. */
    const other = arbitrageRow(input({ symbol: "LIT", hyperliquid: { ...input().hyperliquid, mark: 2.31 }, binanceSpot: 0.743, binancePerp: { mark: 0.744, fundingRate: -0.0002, fundingIntervalHours: 8 } }));
    expect(other.basisBps).toBeNull();
    expect(other.fundingSpreadApr).toBeNull();
    expect(other.excluded).toBe(true);
  });

  it("refuses a spot pair that has stopped trading", () => {
    const quiet = arbitrageRow(input({ hyperliquid: { ...input().hyperliquid, mark: 100.5 }, binanceSpotVolumeUsd: MIN_SPOT_VOLUME_USD - 1 }));
    expect(quiet.basisBps).toBeNull();
    expect(quiet.excluded).toBe(true);
  });

  it("keeps a real gap and marks nothing excluded", () => {
    const row = arbitrageRow(input({ hyperliquid: { ...input().hyperliquid, mark: 100.5 } }));
    expect(row.excluded).toBe(false);
    expect(sameAsset(100, 109.9)).toBe(true);
    expect(sameAsset(100, 111)).toBe(false);
    expect(sameAsset(111, 100)).toBe(false);
    expect(sameAsset(null, 100)).toBe(false);
  });

  it("leaves out what Binance does not list", () => {
    const row = arbitrageRow(input({ binanceSpot: null, binanceSpotVolumeUsd: null, binancePerp: { mark: null, fundingRate: null, fundingIntervalHours: null } }));
    expect(row.excluded).toBe(false);
    expect(row.basisBps).toBeNull();
    expect(row.fundingSpreadApr).toBeNull();
    expect(clearsCosts(row)).toBe(false);
  });
});

describe("rankArbitrage", () => {
  it("puts gaps that clear their costs first", () => {
    const quiet = arbitrageRow(input({ symbol: "ETH" }));
    const basis = arbitrageRow(input({ symbol: "SOL", hyperliquid: { ...input().hyperliquid, mark: 101 } }));
    const funding = arbitrageRow(input({ symbol: "DOGE", hyperliquid: { ...input().hyperliquid, fundingRate: 0.0001 } }));
    expect(rankArbitrage([quiet, funding, basis]).map((row) => row.symbol)).toEqual(["SOL", "DOGE", "ETH"]);
  });
});

describe("parseFearGreed", () => {
  it("reads now, yesterday and a week ago from newest first", () => {
    const data = Array.from({ length: 8 }, (_, index) => ({ value: String(40 + index), value_classification: index === 0 ? "Fear" : "Neutral", timestamp: "1763683200" }));
    expect(parseFearGreed({ data })).toEqual({ value: 40, classification: "Fear", yesterday: 41, weekAgo: 47, asOf: new Date(1763683200 * 1000).toISOString() });
  });

  it("is null for anything else", () => {
    expect(parseFearGreed(null)).toBeNull();
    expect(parseFearGreed({ data: [] })).toBeNull();
    expect(parseFearGreed({ data: [{ value: "x", value_classification: "Fear" }] })).toBeNull();
  });
});

describe("positioning", () => {
  const reading = (symbol: string, change: number, funding: number, oi = 1e8, volume = 5e6): PerpReading => ({
    symbol,
    change24hPct: change,
    fundingAprPct: funding,
    openInterestUsd: oi,
    volume24hUsd: volume,
  });

  it("counts only liquid markets and weights funding by open interest", () => {
    const result = positioning([reading("BTC", 2, 10, 3e8), reading("ETH", -1, -2, 1e8), reading("DUST", 50, 500, 1e3, 10)])!;
    expect(result.markets).toBe(2);
    expect(result.positiveFundingPct).toBe(50);
    expect(result.weightedFundingApr).toBeCloseTo((10 * 3e8 - 2 * 1e8) / 4e8);
    expect(result.upPct).toBe(50);
    expect(result.medianChangePct).toBeCloseTo(0.5);
    expect(result.majors.map((major) => major.symbol)).toEqual(["BTC", "ETH"]);
  });

  it("is null with no liquid market", () => {
    expect(positioning([reading("DUST", 1, 1, 1, 1)])).toBeNull();
  });
});

describe("leaning", () => {
  const at = (weightedFundingApr: number | null, positiveFundingPct: number): Positioning => ({
    markets: 10,
    positiveFundingPct,
    weightedFundingApr,
    upPct: 50,
    medianChangePct: 0,
    totalOpenInterestUsd: 0,
    majors: [],
  });

  it("reads the crowd from funding", () => {
    expect(leaning(at(40, 60))).toBe("crowded long");
    expect(leaning(at(5, 90))).toBe("crowded long");
    expect(leaning(at(10, 50))).toBe("leaning long");
    expect(leaning(at(4, 55))).toBe("balanced");
    expect(leaning(at(-1, 50))).toBe("leaning short");
    expect(leaning(at(-20, 50))).toBe("crowded short");
    expect(leaning(at(null, 10))).toBe("crowded short");
  });
});
