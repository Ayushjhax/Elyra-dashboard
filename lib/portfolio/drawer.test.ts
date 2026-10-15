import { describe, expect, it } from "vitest";
import { predictionUnavailable } from "@/lib/portfolio/compose";
import { ALL_ACCOUNTS, drawerView, perpEquity } from "@/lib/portfolio/drawer";
import type { DefiPosition, PerpPosition, PortfolioSnapshot, SpotHolding } from "@/lib/portfolio/types";

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

function defi(over: Partial<DefiPosition> = {}): DefiPosition {
  return {
    id: "kamino:1", protocol: "Kamino", chain: "solana", category: "lend",
    label: "USDC Main", valueUsd: 500, suppliedUsd: 500, borrowedUsd: null,
    apyPct: 6.2, earnedUsd: null, healthFactor: null, inRange: null,
    ...over,
  };
}

function snapshot(over: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    asOf: "2026-10-15T00:00:00.000Z",
    summary: {
      totalValueUsd: 0, availableCapitalUsd: null, unrealizedPnlUsd: null,
      pnl24hUsd: null, pnl24hPct: null, agentManagedValueUsd: null,
      agentManagedPct: null,
    },
    scopes: [], spot: [], perps: [], defi: [], orders: [], activity: [],
    history: [],
    prediction: predictionUnavailable("No prediction-market account is linked."),
    notes: [], partial: false,
    ...over,
  };
}

const WALLET = {
  id: "Wallet111", label: "Solana wallet", address: "Wallet111", chain: "Solana",
  venue: "wallet", valueUsd: 1000, availableUsd: 1000, unrealizedPnlUsd: null,
};
const HYPERLIQUID = {
  id: "hyperliquid", label: "Hyperliquid", address: null, chain: "—",
  venue: "hyperliquid", valueUsd: 2000, availableUsd: 1680, unrealizedPnlUsd: 100,
};

describe("drawerView", () => {
  it("calls an account unfunded only when it was read and holds nothing", () => {
    const empty = drawerView(snapshot(), ALL_ACCOUNTS);
    expect(empty).toMatchObject({ unfunded: true, totalUsd: 0, availableUsd: 0, inPositionsUsd: 0 });

    /* A source failed: the zero is of what could be read, not of what is held. */
    expect(drawerView(snapshot({ partial: true }), ALL_ACCOUNTS).unfunded).toBe(false);
    /* Nothing could be read at all: the total is null and must stay null. */
    const unread = drawerView(snapshot({ summary: { ...snapshot().summary, totalValueUsd: null } }), ALL_ACCOUNTS);
    expect(unread).toMatchObject({ unfunded: false, totalUsd: null, availableUsd: null });
    /* A spam token is worth nothing and is still something to show. */
    expect(drawerView(snapshot({ spot: [holding({ verified: false, valueUsd: null })] }), ALL_ACCOUNTS).unfunded).toBe(false);
  });

  it("counts positions as equity, never notional, and never a wallet balance", () => {
    const view = drawerView(
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 1820, availableCapitalUsd: 1000 },
        spot: [holding()],
        perps: [perp()],
        defi: [defi()],
      }),
      ALL_ACCOUNTS,
    );
    expect(perpEquity(perp())).toBe(320);
    expect(view.inPositionsUsd).toBe(820);
    expect(view.availableUsd).toBe(1000);
    expect(view.totalUsd).toBe(1820);
  });

  it("reads one account's figures from its own scope", () => {
    const base = snapshot({
      summary: { ...snapshot().summary, totalValueUsd: 3500 },
      scopes: [WALLET, HYPERLIQUID],
      spot: [holding(), holding({ id: "hyperliquid:USDC", venue: "hyperliquid", symbol: "USDC" })],
      perps: [perp()],
      defi: [defi()],
    });

    const venue = drawerView(base, "hyperliquid");
    expect(venue).toMatchObject({ scope: "hyperliquid", totalUsd: 2000, availableUsd: 1680, inPositionsUsd: 320, defi: [] });
    expect(venue.holdings.map((entry) => entry.id)).toEqual(["hyperliquid:USDC"]);

    const wallet = drawerView(base, "Wallet111");
    expect(wallet).toMatchObject({ totalUsd: 1000, availableUsd: 1000, inPositionsUsd: 0, perps: [] });
    expect(wallet.holdings.map((entry) => entry.id)).toEqual(["wallet:SOL"]);
  });

  it("falls back to every account when the chosen one is gone", () => {
    expect(drawerView(snapshot(), "hyperliquid").scope).toBe(ALL_ACCOUNTS);
  });

  it("lists counted holdings by value, unverified last", () => {
    const view = drawerView(
      snapshot({
        spot: [
          holding({ id: "a", valueUsd: 10 }),
          holding({ id: "spam", valueUsd: 999_999, verified: false }),
          holding({ id: "b", valueUsd: 500 }),
          holding({ id: "c", valueUsd: null }),
        ],
      }),
      ALL_ACCOUNTS,
    );
    expect(view.holdings.map((entry) => entry.id)).toEqual(["b", "a", "c", "spam"]);
  });
});
