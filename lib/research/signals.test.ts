import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fail,
  ok,
  type MarketTicker,
  type PerpMarket,
} from "@/lib/providers/types";
import { SIGNAL_CRITERIA } from "@/lib/research/signalCriteria";

const providers = vi.hoisted(() => ({
  spot: vi.fn(),
  perp: vi.fn(),
  onchain: vi.fn(),
}));
vi.mock("@/lib/providers/binance-public", () => ({
  binanceTicker: providers.spot,
  annualisedFundingPct: (market: { fundingRate: number | null }) =>
    market.fundingRate,
}));
vi.mock("@/lib/providers/hyperliquid-public", () => ({
  hyperliquidMarket: providers.perp,
}));
vi.mock("@/lib/providers/router", () => ({ routePrices: providers.onchain }));
import { signalsFor } from "@/lib/research/signals";

beforeEach(() => {
  vi.clearAllMocks();
  providers.spot.mockResolvedValue(
    ok({ lastPrice: 100, change24hPct: 1 } as MarketTicker, "binance"),
  );
  providers.perp.mockResolvedValue(
    ok({ markPrice: 100, fundingRate: 10 } as PerpMarket, "hyperliquid"),
  );
  providers.onchain.mockResolvedValue(ok([{ usdPrice: 100 }], "jupiter"));
});

describe("research signal evaluation availability", () => {
  it("distinguishes a checked quiet market from missing feeds", async () => {
    const result = await signalsFor("SOL");
    expect(result.data).toEqual([]);
    expect(result.evaluation).toMatchObject({
      price: "evaluated",
      funding: "evaluated",
      divergence: "evaluated",
    });
  });
  it("never presents upstream failures as a successful quiet evaluation", async () => {
    providers.spot.mockResolvedValue(
      fail("binance", "UPSTREAM_UNAVAILABLE", "Unavailable"),
    );
    providers.perp.mockResolvedValue(
      fail("hyperliquid", "UPSTREAM_UNAVAILABLE", "Unavailable"),
    );
    providers.onchain.mockResolvedValue(
      fail("jupiter", "UPSTREAM_UNAVAILABLE", "Unavailable"),
    );
    const result = await signalsFor("SOL");
    expect(result.data).toEqual([]);
    expect(result.evaluation).toMatchObject({
      price: "unavailable",
      funding: "unavailable",
      divergence: "unavailable",
    });
  });
  it("identifies stale readings even when they cross no thresholds", async () => {
    providers.spot.mockResolvedValue(
      ok({ lastPrice: 100, change24hPct: 1 } as MarketTicker, "binance", {
        asOf: new Date(
          Date.now() - SIGNAL_CRITERIA.staleMs - 1000,
        ).toISOString(),
      }),
    );
    const result = await signalsFor("SOL");
    expect(result.evaluation.price).toBe("stale");
    expect(result.evaluation.divergence).toBe("stale");
    expect(result.evaluation.funding).toBe("evaluated");
  });
  it("does not claim unsupported on-chain assets were evaluated", async () => {
    const result = await signalsFor("BTC");
    expect(result.evaluation.divergence).toBe("unsupported");
    expect(providers.onchain).not.toHaveBeenCalled();
  });
  it("keeps existing price and funding trigger thresholds", async () => {
    providers.spot.mockResolvedValue(
      ok(
        {
          lastPrice: 100,
          change24hPct: SIGNAL_CRITERIA.priceChangePct,
        } as MarketTicker,
        "binance",
      ),
    );
    providers.perp.mockResolvedValue(
      ok(
        {
          markPrice: 100,
          fundingRate: SIGNAL_CRITERIA.fundingPct,
        } as PerpMarket,
        "hyperliquid",
      ),
    );
    const result = await signalsFor("SOL");
    expect(result.data?.map((signal) => signal.type)).toEqual([
      "price_momentum",
      "funding_dislocation",
    ]);
    expect(result.data?.[0].contradictions).toHaveLength(1);
  });
});
