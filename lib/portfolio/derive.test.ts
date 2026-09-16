import { describe, expect, it } from "vitest";
import { predictionUnavailable } from "@/lib/portfolio/compose";
import {
  allocationFor,
  availableModes,
  brief,
  byNumber,
  capitalHealth,
  change24h,
} from "@/lib/portfolio/derive";
import type {
  PerpPosition,
  PortfolioSnapshot,
  SpotHolding,
} from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   These tests are about the rules that keep a number honest, not about
   arithmetic. Each one pins a decision that would be invisible if it broke:
   a spoofed token counted into allocation, a 24h figure quoted over a tenth
   of the portfolio as though it covered all of it, a health metric computed
   from inputs that were not there.
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

describe("allocationFor", () => {
  it("never counts an unverified token", () => {
    /* Airdropping a token named USDC at a wallet costs a few cents. If it
       reached allocation, an attacker could make this panel display any
       breakdown they liked. */
    const rows = allocationFor(
      snapshot({
        spot: [
          holding({ id: "a", symbol: "SOL", valueUsd: 1000 }),
          holding({ id: "b", symbol: "USDC", valueUsd: 999_999, verified: false }),
        ],
      }),
      "asset",
    );
    expect(rows.map((row) => row.key)).toEqual(["SOL"]);
  });

  it("hides a breakdown with only one bucket", () => {
    /* "Solana 100%" is a control that looks like data. */
    const only = snapshot({ spot: [holding({ chain: "Solana" })] });
    expect(allocationFor(only, "chain")).toEqual([]);
    expect(availableModes(only)).not.toContain("chain");
  });

  it("rolls the tail into one Other row", () => {
    const rows = allocationFor(
      snapshot({
        spot: Array.from({ length: 9 }, (_, index) =>
          holding({ id: `t${index}`, symbol: `T${index}`, valueUsd: 100 - index }),
        ),
      }),
      "asset",
    );
    expect(rows).toHaveLength(6);
    expect(rows[5].key).toBe("__other");
    const total = rows.reduce((sum, row) => sum + row.pct, 0);
    expect(total).toBeCloseTo(100, 6);
  });
});

describe("change24h", () => {
  it("derives the move from the opening value, not today's", () => {
    /* A holding worth 110 after +10% gained 10, not 11. Multiplying today's
       value by the rate overstates every gain — small at 1%, obvious at 40%. */
    const change = change24h(
      snapshot({ spot: [holding({ valueUsd: 110, change24hPct: 10 })] }),
    );
    expect(change).not.toBeNull();
    expect(change!.pnlUsd).toBeCloseTo(10, 6);
    expect(change!.pnlPct).toBeCloseTo(10, 6);
  });

  it("reports the share of the portfolio it could actually cover", () => {
    const change = change24h(
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 1000 },
        spot: [
          holding({ id: "a", valueUsd: 100, change24hPct: 10 }),
          holding({ id: "b", valueUsd: 900, change24hPct: null }),
        ],
      }),
    );
    expect(change!.coveragePct).toBeCloseTo(10, 6);
  });

  it("is null when nothing held carries a 24h price", () => {
    expect(change24h(snapshot({ spot: [holding({ change24hPct: null })] }))).toBeNull();
  });
});

describe("capitalHealth", () => {
  it("omits liquidation distance when the venue reported no liquidation price", () => {
    /* Estimating it from leverage would be a guess about the one number a
       user cannot afford to see a plausible wrong version of. */
    const metrics = capitalHealth(
      snapshot({ spot: [holding()], perps: [perp({ liquidationPrice: null })] }),
    );
    expect(metrics.map((metric) => metric.key)).not.toContain("liquidation");
  });

  it("reports liquidation distance when both the mark and the liq price exist", () => {
    const metrics = capitalHealth(
      snapshot({ spot: [holding()], perps: [perp({ markPrice: 100, liquidationPrice: 80 })] }),
    );
    const liq = metrics.find((metric) => metric.key === "liquidation");
    expect(liq?.value).toBe("20.0%");
    expect(liq?.tone).toBe("watch");
  });

  it("omits every metric when nothing has a value", () => {
    expect(
      capitalHealth(snapshot({ summary: { ...snapshot().summary, totalValueUsd: null } })),
    ).toEqual([]);
  });

  it("flags concentration by degree rather than by colour alone", () => {
    const metrics = capitalHealth(
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 1000 },
        spot: [holding({ valueUsd: 700 })],
      }),
    );
    const row = metrics.find((metric) => metric.key === "concentration");
    expect(row?.detail).toBe("Highly concentrated");
    expect(row?.tone).toBe("risk");
  });
});

describe("brief", () => {
  it("says nothing when there is nothing derivable", () => {
    expect(brief(snapshot())).toEqual([]);
  });

  it("leads with a failed source, because the totals exclude it", () => {
    const lines = brief(
      snapshot({
        spot: [holding({ valueUsd: 1000, change24hPct: 5 })],
        notes: [{ scope: "binance", reason: "timed out", kind: "failed" }],
        partial: true,
      }),
    );
    expect(lines[0].id).toBe("partial");
    expect(lines[0].text).toContain("binance");
  });

  it("names a repeated scope once, not once per failed note", () => {
    const lines = brief(
      snapshot({
        spot: [holding({ valueUsd: 1000, change24hPct: 5 })],
        notes: [
          { scope: "defi", reason: "Kamino not indexed", kind: "failed" },
          { scope: "defi", reason: "Marginfi not indexed", kind: "failed" },
          { scope: "defi", reason: "2 positions could not be valued", kind: "failed" },
        ],
        partial: true,
      }),
    );
    expect(lines[0].text).toBe("Totals exclude defi — that source could not be read.");
  });

  it("states coverage when the 24h figure covers only part of the value", () => {
    const lines = brief(
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 1000 },
        spot: [
          holding({ id: "a", valueUsd: 100, change24hPct: 8 }),
          holding({ id: "b", symbol: "BONK", valueUsd: 900, change24hPct: null }),
        ],
      }),
    );
    expect(lines.some((line) => line.text.includes("% of value that carries a 24h price"))).toBe(true);
  });

  it("never returns more than three observations", () => {
    const lines = brief(
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 1000 },
        spot: [holding({ valueUsd: 900, change24hPct: 12 })],
        perps: [perp({ markPrice: 100, liquidationPrice: 95 })],
        notes: [{ scope: "binance", reason: "timed out", kind: "failed" }],
      }),
    );
    expect(lines.length).toBeLessThanOrEqual(3);
  });
});

describe("byNumber", () => {
  it("pins unknowns to the bottom in both directions", () => {
    /* A null is not a small number. Sorting "highest first" must not float
       the rows nobody could price to the top. */
    const rows = [{ v: 1 }, { v: null }, { v: 5 }];
    expect(byNumber(rows, (row) => row.v, "desc").map((row) => row.v)).toEqual([5, 1, null]);
    expect(byNumber(rows, (row) => row.v, "asc").map((row) => row.v)).toEqual([1, 5, null]);
  });
});
