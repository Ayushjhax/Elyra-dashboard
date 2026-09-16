import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   The semantic tool layer.

   These guard the boundary between the model and the money. Three properties
   matter more than any individual number:

   - No tool accepts an identity. A model that could pass a wallet address
     could be talked into passing someone else's, by a token name or a chart
     annotation or anything else that reaches a prompt from outside.
   - A gap is reported as a gap. The model's instinct is to fill one.
   - No tool exposes a provider, a key, or an endpoint.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  snapshot: null as unknown,
  defi: null as unknown,
}));

vi.mock("@/lib/portfolio/compose", () => ({
  composePortfolio: async () => state.snapshot,
}));

vi.mock("@/lib/providers/router", () => ({
  routeDefiPositions: async () => state.defi,
  routePerpMarket: async () => ({ ok: false, provider: "hyperliquid", asOf: "", error: { code: "NOT_FOUND", message: "x", retryable: false } }),
  routePrices: async () => ({ ok: true, provider: "jupiter", asOf: "2026-09-16T00:00:00.000Z", data: [] }),
  providerHealthReport: () => [
    {
      provider: "jupiter",
      status: "healthy",
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorCode: null,
      consecutiveFailures: 0,
      latencyMs: 42,
      circuitOpen: false,
    },
  ],
}));

const CONTEXT = {
  userId: "user-a",
  sessionWallet: "0xaaa",
  solanaAddress: "AxqtG9SHDkZTLSWg81Sp7VqAzQpRqXtR9ziJ3VQAS8As",
};

const BASE_SNAPSHOT = {
  asOf: "2026-09-16T00:00:00.000Z",
  summary: {
    totalValueUsd: 100_000,
    availableCapitalUsd: 20_000,
    unrealizedPnlUsd: 500,
    pnl24hUsd: null,
    pnl24hPct: null,
    agentManagedValueUsd: null,
    agentManagedPct: null,
  },
  scopes: [],
  spot: [
    {
      id: "sol", venue: "wallet", chain: "solana", address: "So111", symbol: "SOL",
      name: "Solana", logo: null, quantity: 200, decimals: 9, priceUsd: 100,
      valueUsd: 20_000, change24hPct: -5, allocationPct: 20, avgCostUsd: null,
      pnlUsd: null, pnlPct: null, verified: true, liquid: false,
    },
    {
      id: "fake", venue: "wallet", chain: "solana", address: "FAKE", symbol: "USDC",
      name: "Not USDC", logo: null, quantity: 1_000_000, decimals: 6, priceUsd: 1,
      valueUsd: 1_000_000, change24hPct: 0, allocationPct: null, avgCostUsd: null,
      pnlUsd: null, pnlPct: null, verified: false, liquid: false,
    },
  ],
  perps: [
    { market: "SOL-PERP", notionalUsd: 30_000, marginUsd: 6_000, unrealizedPnlUsd: 100 },
  ],
  defi: [],
  orders: [],
  activity: [],
  history: [],
  notes: [
    { scope: "binance", reason: "Key rejected.", kind: "failed" },
    { scope: "orders", reason: "Not implemented.", kind: "missing" },
  ],
  partial: true,
};

beforeEach(() => {
  state.snapshot = structuredClone(BASE_SNAPSHOT);
  state.defi = {
    ok: true,
    provider: "kamino",
    asOf: "2026-09-16T00:00:00.000Z",
    data: [],
  };
});

describe("tool definitions", () => {
  it("never accepts an identity as an argument", async () => {
    const { ELYRA_TOOLS } = await import("@/lib/agent/tools/elyra");

    for (const tool of ELYRA_TOOLS) {
      const params = Object.keys(tool.def.parameters.properties ?? {});
      for (const name of params) {
        /* If a model can name whose portfolio to read, a prompt injection can
           too. Identity comes from the verified session, never the model. */
        expect(name.toLowerCase()).not.toMatch(
          /^(userid|user_id|wallet|address|walletaddress|account|accountid)$/,
        );
      }
    }
  });

  it("exposes no provider-named tool", async () => {
    const { ELYRA_TOOLS } = await import("@/lib/agent/tools/elyra");
    const names = ELYRA_TOOLS.map((tool) => tool.def.name).join(" ");

    /* Provider choice is the router's job and it is deterministic. A model
       picking between Jupiter and Birdeye picks the down one eventually. */
    expect(names).not.toMatch(/jupiter|birdeye|kamino|raydium|dflow|polymarket|binance/i);
  });
});

describe("portfolio_overview", () => {
  it("says the total is incomplete when a venue failed", async () => {
    const { portfolioOverview } = await import("@/lib/agent/tools/elyra");
    const result = (await portfolioOverview.execute({}, CONTEXT)) as Record<string, unknown>;

    /* A total presented as complete when a venue failed is wrong AND looks
       authoritative — the worst output this system can produce. */
    expect(result.incomplete).toBe(true);
    expect(result.unreadable).toEqual([{ scope: "binance", reason: "Key rejected." }]);
  });

  it("separates a surface that does not exist from one that failed", async () => {
    const { portfolioOverview } = await import("@/lib/agent/tools/elyra");
    const result = (await portfolioOverview.execute({}, CONTEXT)) as Record<string, unknown>;

    /* "Orders are down" and "Elyra has no order integration" call for
       opposite responses — a retry and a roadmap item. */
    expect(result.notYetSupported).toEqual(["orders"]);
  });
});

describe("portfolio_holdings", () => {
  it("marks an unverified token as not counted, and still shows it", async () => {
    const { portfolioHoldings } = await import("@/lib/agent/tools/elyra");
    const result = (await portfolioHoldings.execute({}, CONTEXT)) as {
      holdings: Array<{ symbol: string; counted: boolean; valueUsd: number | null }>;
    };

    const fake = result.holdings.find((row) => row.valueUsd === 1_000_000);
    /* Airdropping a token named USDC costs cents. A dashboard that counts one
       can be made to display any figure an attacker likes. */
    expect(fake?.counted).toBe(false);
  });
});

describe("portfolio_risk", () => {
  it("counts spot and perp exposure to the same asset as one position", async () => {
    const { portfolioRisk } = await import("@/lib/agent/tools/elyra");
    const result = (await portfolioRisk.execute({}, CONTEXT)) as {
      largestExposures: Array<{ asset: string; exposureUsd: number; pctOfEquity: number }>;
    };

    /* $20k of SOL and a $30k SOL perp is $50k of SOL risk. Reporting them
       separately understates concentration by more than half. */
    const sol = result.largestExposures.find((row) => row.asset === "SOL");
    expect(sol?.exposureUsd).toBe(50_000);
    expect(sol?.pctOfEquity).toBe(50);
  });

  it("does not count an unverified token toward concentration", async () => {
    const { portfolioRisk } = await import("@/lib/agent/tools/elyra");
    const result = (await portfolioRisk.execute({}, CONTEXT)) as {
      largestExposures: Array<{ asset: string }>;
    };

    expect(result.largestExposures.find((row) => row.asset === "USDC")).toBeUndefined();
  });

  it("returns null percentages rather than dividing by a null equity", async () => {
    state.snapshot = {
      ...structuredClone(BASE_SNAPSHOT),
      summary: { ...BASE_SNAPSHOT.summary, totalValueUsd: null },
    };

    const { portfolioRisk } = await import("@/lib/agent/tools/elyra");
    const result = (await portfolioRisk.execute({}, CONTEXT)) as {
      largestExposures: Array<{ pctOfEquity: number | null }>;
      perpLeverageVsEquity: number | null;
    };

    expect(result.largestExposures[0].pctOfEquity).toBeNull();
    expect(result.perpLeverageVsEquity).toBeNull();
  });
});

describe("defi_positions", () => {
  it("reports no connected wallet rather than zero positions", async () => {
    const { defiPositions } = await import("@/lib/agent/tools/elyra");
    const result = (await defiPositions.execute({}, { ...CONTEXT, solanaAddress: null })) as
      Record<string, unknown>;

    /* "You have no DeFi positions" is a claim. "No wallet is connected" is
       the fact, and they are not the same answer. */
    expect(result.error).toMatch(/no solana wallet/i);
    expect(result.positions).toBeUndefined();
  });

  it("returns null distance-to-liquidation when no threshold was published", async () => {
    state.defi = {
      ok: true,
      provider: "kamino",
      asOf: "2026-09-16T00:00:00.000Z",
      data: [
        {
          id: "o1", provider: "kamino", kind: "multiply", label: "Kamino multiply",
          netUsd: 39, suppliedUsd: 124, borrowedUsd: 85, supplied: [], borrowed: [],
          ltv: 0.686, liquidationLtv: null, leverage: 3.18, apy: null,
        },
      ],
    };

    const { defiPositions } = await import("@/lib/agent/tools/elyra");
    const result = (await defiPositions.execute({}, CONTEXT)) as {
      positions: Array<{ pctFromLiquidation: number | null; leverage: number }>;
      note: string;
    };

    /* Leverage is right there and it is tempting. Inferring a liquidation
       distance from it is a guess that reads as a measurement. */
    expect(result.positions[0].leverage).toBe(3.18);
    expect(result.positions[0].pctFromLiquidation).toBeNull();
    expect(result.note).toMatch(/rather than estimating it from leverage/i);
  });

  it("computes distance from the published threshold when there is one", async () => {
    state.defi = {
      ok: true,
      provider: "kamino",
      asOf: "2026-09-16T00:00:00.000Z",
      data: [
        {
          id: "o1", provider: "kamino", kind: "multiply", label: "Kamino multiply",
          netUsd: 39, suppliedUsd: 124, borrowedUsd: 85, supplied: [], borrowed: [],
          ltv: 0.46, liquidationLtv: 0.92, leverage: 3.18, apy: null,
        },
      ],
    };

    const { defiPositions } = await import("@/lib/agent/tools/elyra");
    const result = (await defiPositions.execute({}, CONTEXT)) as {
      positions: Array<{ pctFromLiquidation: number | null }>;
    };

    expect(result.positions[0].pctFromLiquidation).toBeCloseTo(50, 1);
  });

  it("passes an unindexed-section warning through to the model", async () => {
    state.defi = {
      ok: true,
      provider: "kamino",
      asOf: "2026-09-16T00:00:00.000Z",
      data: [],
      partial: true,
      warnings: ["Kamino leverage positions were not indexed for this wallet."],
    };

    const { defiPositions } = await import("@/lib/agent/tools/elyra");
    const result = (await defiPositions.execute({}, CONTEXT)) as {
      incomplete: boolean;
      warnings: string[];
    };

    expect(result.incomplete).toBe(true);
    expect(result.warnings[0]).toMatch(/not indexed/i);
  });
});

describe("data_source_health", () => {
  it("reports status without revealing configuration", async () => {
    const { dataSourceHealth } = await import("@/lib/agent/tools/elyra");
    const result = (await dataSourceHealth.execute({}, CONTEXT)) as {
      sources: Array<Record<string, unknown>>;
    };

    const keys = Object.keys(result.sources[0]);
    /* Which credentials exist is not the model's business, and an answer
       naming them is an answer that can be extracted. */
    expect(keys).not.toContain("configured");
    expect(JSON.stringify(result)).not.toMatch(/key|token|secret|http/i);
  });
});
