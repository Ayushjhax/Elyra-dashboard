import { describe, expect, it } from "vitest";
import { predictionUnavailable } from "@/lib/portfolio/compose";
import {
  availableCapitalUsd,
  change24h,
  contributions,
  exposureTo,
  exposures,
  holdingFor,
  largestExposure,
  riskiestPosition,
  riskMetrics,
  stablecoinRatioPct,
  underlyingSymbol,
} from "@/lib/personalized/calculations";
import type { PersonalizedMemory } from "@/lib/personalized/types";
import type { PerpPosition, PortfolioSnapshot, SpotHolding } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   These pin the arithmetic the model is forbidden to do.

   Each one guards a specific way a capital assistant can be confidently
   wrong about someone's money — counting a spoofed token, splitting one bet
   across two venues so it looks safe, or quoting a portfolio-wide move it
   computed over a third of the portfolio.
--------------------------------------------------------------------------- */

function holding(over: Partial<SpotHolding> = {}): SpotHolding {
  return {
    id: "wallet:SOL", venue: "wallet", chain: "Solana", address: null,
    symbol: "SOL", name: "Solana", logo: null, quantity: 10, decimals: 9,
    priceUsd: 100, valueUsd: 1000, change24hPct: null, allocationPct: null,
    avgCostUsd: null, pnlUsd: null, pnlPct: null, verified: true, liquid: false,
    ...over,
  };
}

function perp(over: Partial<PerpPosition> = {}): PerpPosition {
  return {
    id: "hyperliquid:SOL-PERP:long", venue: "hyperliquid", market: "SOL-PERP",
    side: "long", size: 10, entryPrice: 100, markPrice: 110, leverage: 5,
    marginUsd: 220, liquidationPrice: 80, notionalUsd: 1100,
    unrealizedPnlUsd: 100, roePct: 45.45, fundingUsd: null,
    ...over,
  };
}

function snapshot(over: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    asOf: "2026-09-16T00:00:00.000Z",
    summary: {
      totalValueUsd: 1000, availableCapitalUsd: null, unrealizedPnlUsd: null,
      pnl24hUsd: null, pnl24hPct: null, agentManagedValueUsd: null,
      agentManagedPct: null,
    },
    scopes: [], spot: [], perps: [], defi: [], orders: [], activity: [],
    history: [],
    /* No prediction account linked — a different state from having no
       positions, which the snapshot is required to carry. */
    prediction: predictionUnavailable("No prediction-market account is linked."),
    notes: [], partial: false,
    ...over,
  };
}

function memory(over: Partial<PersonalizedMemory> = {}): PersonalizedMemory {
  return {
    id: "m1", type: "concentration_limit", key: "concentration_limit", value: 30,
    confidence: 1, source: "explicit", label: "Max 30% in any one asset",
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("exposures", () => {
  it("combines spot and perp exposure to the same symbol", () => {
    /* The failure this prevents: SOL held in the wallet and a SOL perp
       reported as two comfortable positions, when they are one bet. */
    const rows = exposures(
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 1000 },
        spot: [holding({ valueUsd: 500 })],
        perps: [perp({ marginUsd: 200, unrealizedPnlUsd: 20 })],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe("SOL");
    expect(rows[0].valueUsd).toBeCloseTo(720, 6);
    expect(rows[0].venues.sort()).toEqual(["Hyperliquid", "Spot"]);
  });

  it("counts a perp at its margin, never its notional", () => {
    /* $220 of margin controlling $1,100 of SOL is $220 of the operator's
       capital. Counting the notional against an equity denominator that
       never contained it would report 110% concentration. */
    const rows = exposures(
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 1000 },
        perps: [perp({ marginUsd: 200, unrealizedPnlUsd: 0, notionalUsd: 5000 })],
      }),
    );
    expect(rows[0].valueUsd).toBe(200);
    expect(rows[0].pct).toBeCloseTo(20, 6);
  });

  it("never counts an unverified token", () => {
    const rows = exposures(
      snapshot({
        spot: [
          holding({ id: "a", valueUsd: 100 }),
          holding({ id: "b", symbol: "USDC", valueUsd: 999_999, verified: false }),
        ],
      }),
    );
    expect(rows.map((row) => row.symbol)).toEqual(["SOL"]);
  });

  it("finds exposure to one symbol across venues", () => {
    const base = snapshot({
      summary: { ...snapshot().summary, totalValueUsd: 1000 },
      spot: [holding({ valueUsd: 300 })],
      perps: [perp({ marginUsd: 100, unrealizedPnlUsd: 0 })],
    });
    expect(exposureTo(base, "sol")?.valueUsd).toBe(400);
    expect(exposureTo(base, "BTC")).toBeNull();
  });
});

describe("underlyingSymbol", () => {
  it("reduces a perp market to the asset it tracks", () => {
    expect(underlyingSymbol("SOL-PERP")).toBe("SOL");
    expect(underlyingSymbol("BTC/USD")).toBe("BTC");
    expect(underlyingSymbol("ETH")).toBe("ETH");
  });
});

describe("change24h", () => {
  it("derives the move from the opening value, not today's", () => {
    /* A holding worth 110 after +10% gained 10, not 11. */
    const change = change24h(snapshot({ spot: [holding({ valueUsd: 110, change24hPct: 10 })] }));
    expect(change!.usdChange).toBeCloseTo(10, 6);
    expect(change!.pctChange).toBeCloseTo(10, 6);
  });

  it("reports the share of value it could actually cover", () => {
    const change = change24h(
      snapshot({
        spot: [
          holding({ id: "a", valueUsd: 100, change24hPct: 10 }),
          holding({ id: "b", symbol: "BONK", valueUsd: 900, change24hPct: null }),
        ],
      }),
    );
    expect(change!.coveragePct).toBeCloseTo(10, 6);
  });

  it("is null when nothing carries a 24h price", () => {
    expect(change24h(snapshot({ spot: [holding({ change24hPct: null })] }))).toBeNull();
  });
});

describe("contributions", () => {
  it("ranks by dollar effect, not by percentage move", () => {
    /* The answer to "why am I down" is the holding that cost the most, which
       is a function of size — not the one that fell furthest. */
    const ranked = contributions(
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 10_000 },
        spot: [
          holding({ id: "a", symbol: "SOL", valueUsd: 9_000, change24hPct: -2 }),
          holding({ id: "b", symbol: "BONK", valueUsd: 100, change24hPct: -40 }),
        ],
      }),
    );
    expect(ranked[0].symbol).toBe("SOL");
    expect(Math.abs(ranked[0].usdChange)).toBeGreaterThan(Math.abs(ranked[1].usdChange));
  });
});

describe("availableCapitalUsd and stablecoinRatioPct", () => {
  it("counts stablecoins as deployable and other holdings as not", () => {
    const base = snapshot({
      summary: { ...snapshot().summary, totalValueUsd: 1000, availableCapitalUsd: null },
      spot: [
        holding({ id: "a", symbol: "USDC", valueUsd: 250, liquid: true }),
        holding({ id: "b", symbol: "SOL", valueUsd: 750 }),
      ],
    });
    expect(availableCapitalUsd(base)).toBe(250);
    expect(stablecoinRatioPct(base)).toBeCloseTo(25, 6);
  });

  it("is null when there is no total to measure against", () => {
    expect(
      stablecoinRatioPct(snapshot({ summary: { ...snapshot().summary, totalValueUsd: null } })),
    ).toBeNull();
  });
});

describe("riskMetrics", () => {
  it("marks a saved concentration limit as breached", () => {
    const metrics = riskMetrics(
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 1000 },
        spot: [holding({ valueUsd: 400 })],
      }),
      [memory({ value: 30 })],
    );
    const concentration = metrics.find((metric) => metric.key === "concentration");
    expect(concentration?.breached).toBe(true);
    expect(concentration?.limit).toBe("30%");
  });

  it("does not claim a breach when no limit was saved", () => {
    const metrics = riskMetrics(
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 1000 },
        spot: [holding({ valueUsd: 900 })],
      }),
      [],
    );
    const concentration = metrics.find((metric) => metric.key === "concentration");
    expect(concentration?.breached).toBe(false);
    expect(concentration?.limit).toBeNull();
  });

  it("omits liquidation distance when the venue reported no liquidation price", () => {
    /* Estimating it from leverage would be a guess about the one number a
       leveraged operator cannot afford to see wrong. */
    const metrics = riskMetrics(
      snapshot({ spot: [holding()], perps: [perp({ liquidationPrice: null })] }),
      [],
    );
    expect(metrics.map((metric) => metric.key)).not.toContain("liquidation");
  });

  it("emits no composite risk score", () => {
    /* There is deliberately no single blended number: it is not derivable
       from these inputs in any defensible way. */
    const metrics = riskMetrics(
      snapshot({ summary: { ...snapshot().summary, totalValueUsd: 1000 }, spot: [holding()] }),
      [],
    );
    expect(metrics.map((metric) => metric.key)).not.toContain("score");
  });
});

describe("position helpers", () => {
  it("ranks the riskiest position by liquidation proximity", () => {
    const riskiest = riskiestPosition(
      snapshot({
        perps: [
          perp({ id: "far", market: "BTC-PERP", markPrice: 100, liquidationPrice: 50 }),
          perp({ id: "near", market: "SOL-PERP", markPrice: 100, liquidationPrice: 95 }),
        ],
      }),
    );
    expect(riskiest?.id).toBe("near");
  });

  it("returns null when no position reports a liquidation price to rank by", () => {
    expect(riskiestPosition(snapshot({ perps: [perp({ liquidationPrice: null })] }))).toBeNull();
  });

  it("finds a holding by symbol, ignoring unverified ones", () => {
    const base = snapshot({
      spot: [holding({ id: "a", symbol: "SOL" }), holding({ id: "b", symbol: "FAKE", verified: false })],
    });
    expect(holdingFor(base, "sol")?.id).toBe("a");
    expect(holdingFor(base, "FAKE")).toBeNull();
  });
});

describe("largestExposure", () => {
  it("is null on an account holding nothing", () => {
    expect(largestExposure(snapshot())).toBeNull();
  });
});
