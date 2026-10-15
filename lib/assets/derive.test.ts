import { describe, expect, it } from "vitest";
import { predictionUnavailable } from "@/lib/portfolio/compose";
import {
  ALL_ACCOUNTS,
  change24hOf,
  deriveAccounts,
  orderBalances,
  scopeSnapshot,
  syncSummary,
  venueLabel,
  capitalAllocation,
} from "@/lib/assets/derive";
import type {
  PerpPosition,
  PortfolioSnapshot,
  SpotHolding,
  WalletScope,
} from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   These pin the rules that keep an account honest, not the arithmetic.

   The failure each one guards against is the same shape: a bucket with no
   provider behind it quietly reporting $0.00 and a percentage, which reads
   as "you hold nothing there" when the truth is "Elyra cannot see there".
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

function scope(over: Partial<WalletScope> = {}): WalletScope {
  return {
    id: "hyperliquid", label: "Hyperliquid", address: null, chain: "—",
    venue: "hyperliquid", valueUsd: 500, availableUsd: 300, unrealizedPnlUsd: 20,
    ...over,
  };
}

function snapshot(over: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    asOf: "2026-09-16T00:00:00.000Z",
    summary: {
      totalValueUsd: 1500, availableCapitalUsd: null, unrealizedPnlUsd: null,
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

describe("deriveAccounts", () => {
  it("always returns the four capital accounts in order", () => {
    /* Even the two with no venue behind them: a console that hides the
       buckets it cannot fill teaches nobody what is missing. */
    const accounts = deriveAccounts(snapshot());
    expect(accounts.map((a) => a.id)).toEqual([
      "spot",
      "solana-perps",
      "hyperliquid",
      "prediction",
    ]);
  });

  it("reports an un-integrated venue as empty with a reason, never as $0", () => {
    const accounts = deriveAccounts(snapshot());
    const perps = accounts.find((a) => a.id === "solana-perps")!;
    expect(perps.status).toBe("empty");
    expect(perps.valueUsd).toBeNull();
    expect(perps.allocationPct).toBeNull();
    expect(perps.detail).toMatch(/not connected|no solana perps/i);
  });

  it("values Hyperliquid at the venue's equity, not the notional it backs", () => {
    /* A 5x position on $220 of margin makes the account worth ~$220, not the
       $1,100 of exposure it controls. Getting this wrong would overstate the
       account and every percentage derived from it. */
    const accounts = deriveAccounts(
      snapshot({ scopes: [scope({ valueUsd: 220 })], perps: [perp({ notionalUsd: 1100 })] }),
    );
    const hl = accounts.find((a) => a.id === "hyperliquid")!;
    expect(hl.valueUsd).toBe(220);
    expect(hl.status).toBe("ready");
  });

  it("marks an account that failed to read as error, not as empty", () => {
    const accounts = deriveAccounts(
      snapshot({
        spot: [holding()],
        notes: [{ scope: "wallet", reason: "RPC timed out", kind: "failed" }],
      }),
    );
    const spot = accounts.find((a) => a.id === "spot")!;
    expect(spot.status).toBe("error");
    expect(spot.errorReason).toBe("RPC timed out");
    /* No value survives a failed read: a partial number presented as the
       account's balance is worse than no number. */
    expect(spot.valueUsd).toBeNull();
  });

  it("excludes unverified tokens from an account's value", () => {
    /* Airdropping a token named USDC at a wallet costs cents. If it counted,
       an attacker could set this account's reported balance. */
    const accounts = deriveAccounts(
      snapshot({
        spot: [
          holding({ id: "a", valueUsd: 100 }),
          holding({ id: "b", symbol: "USDC", valueUsd: 999_999, verified: false }),
        ],
      }),
    );
    expect(accounts.find((a) => a.id === "spot")!.valueUsd).toBe(100);
  });

  it("counts assets and states the day's move in the spot detail line", () => {
    const accounts = deriveAccounts(
      snapshot({
        spot: [
          holding({ id: "a", valueUsd: 110, change24hPct: 10 }),
          holding({ id: "b", symbol: "JUP", valueUsd: 50, change24hPct: 10 }),
        ],
      }),
    );
    expect(accounts.find((a) => a.id === "spot")!.detail).toBe("2 assets · +10.00% today");
  });
});

describe("change24hOf", () => {
  it("derives the move from the opening value, not today's", () => {
    /* A holding worth 110 after +10% gained 10, not 11. */
    const change = change24hOf([holding({ valueUsd: 110, change24hPct: 10 })]);
    expect(change!.pnlUsd).toBeCloseTo(10, 6);
    expect(change!.pnlPct).toBeCloseTo(10, 6);
  });

  it("reports the share it could actually cover", () => {
    const change = change24hOf([
      holding({ id: "a", valueUsd: 100, change24hPct: 10 }),
      holding({ id: "b", valueUsd: 900, change24hPct: null }),
    ]);
    expect(change!.coveragePct).toBeCloseTo(10, 6);
  });

  it("is null when nothing carries a 24h price", () => {
    expect(change24hOf([holding({ change24hPct: null })])).toBeNull();
  });
});

describe("syncSummary", () => {
  it("separates what failed from what was never connected", () => {
    const accounts = deriveAccounts(
      snapshot({
        spot: [holding()],
        scopes: [scope()],
        notes: [{ scope: "hyperliquid", reason: "429", kind: "failed" }],
      }),
    );
    const sync = syncSummary(accounts);
    expect(sync.failed).toEqual(["Hyperliquid"]);
    expect(accounts[2].connection).toBe("connected");
    /* Prediction markets are linked through the connections console now;
       only Solana perps has no adapter at all. */
    expect(sync.unintegrated).toEqual(["Solana Perps"]);
    expect(sync.ready).toBe(1);
    expect(sync.total).toBe(4);
  });

  it("counts a linked venue whose read failed as connected, not as missing", () => {
    const accounts = deriveAccounts(
      snapshot({
        spot: [holding()],
        scopes: [scope()],
        notes: [{ scope: "prediction", reason: "Polymarket 503", kind: "failed" }],
      }),
    );
    const prediction = accounts.find((entry) => entry.id === "prediction")!;
    expect(prediction).toMatchObject({ connection: "connected", status: "error", valueUsd: null });
    expect(syncSummary(accounts)).toMatchObject({ connected: 3, notConnected: 1 });
  });
});

describe("connection", () => {
  it("values a read, empty wallet at $0.00 and an unlinked one at nothing", () => {
    const empty = deriveAccounts(snapshot({ scopes: [{ id: "W", label: "Solana wallet", address: "W", chain: "Solana", venue: "wallet", valueUsd: 0, availableUsd: 0, unrealizedPnlUsd: null }] }));
    expect(empty[0]).toMatchObject({ id: "spot", connection: "connected", status: "ready", valueUsd: 0 });

    const unlinked = deriveAccounts(snapshot({}));
    expect(unlinked[0]).toMatchObject({ connection: "disconnected", status: "empty", valueUsd: null });
    expect(unlinked[0].detail).toMatch(/Link a Solana wallet/);
    expect(unlinked[1]).toMatchObject({ id: "solana-perps", connection: "unsupported" });
  });

  it("reads a linked prediction account's value and active markets", () => {
    const accounts = deriveAccounts(
      snapshot({
        prediction: { ...predictionUnavailable(""), connected: true, valueUsd: 120, activeMarkets: 3, unavailableReason: null },
      }),
    );
    expect(accounts[3]).toMatchObject({ connection: "connected", status: "ready", valueUsd: 120, positions: 3, detail: "3 active markets" });
  });
});

describe("scopeSnapshot", () => {
  it("passes everything through for all accounts", () => {
    const full = snapshot({ spot: [holding()], perps: [perp()] });
    expect(scopeSnapshot(full, ALL_ACCOUNTS)).toBe(full);
  });

  it("narrows spot to the wallet and drops venue positions", () => {
    const view = scopeSnapshot(
      snapshot({
        spot: [holding({ id: "a" }), holding({ id: "b", venue: "hyperliquid" })],
        perps: [perp()],
      }),
      "spot",
    );
    expect(view.spot.map((h) => h.id)).toEqual(["a"]);
    expect(view.perps).toEqual([]);
  });

  it("narrows to one venue's holdings and positions", () => {
    const view = scopeSnapshot(
      snapshot({
        spot: [holding({ id: "a" }), holding({ id: "b", venue: "hyperliquid" })],
        perps: [perp(), perp({ id: "other", venue: "binance" })],
      }),
      "hyperliquid",
    );
    expect(view.spot.map((h) => h.id)).toEqual(["b"]);
    expect(view.perps.map((p) => p.venue)).toEqual(["hyperliquid"]);
  });
});

describe("orderBalances", () => {
  it("keeps the same symbol at two venues adjacent when grouping by asset", () => {
    const rows = orderBalances(
      [
        holding({ id: "a", symbol: "USDC", venue: "hyperliquid", valueUsd: 10 }),
        holding({ id: "b", symbol: "SOL", valueUsd: 50 }),
        holding({ id: "c", symbol: "USDC", venue: "wallet", valueUsd: 90 }),
      ],
      "asset",
    );
    expect(rows.map((r) => r.symbol)).toEqual(["SOL", "USDC", "USDC"]);
    /* Within a symbol, the larger holding leads. */
    expect(rows[1].id).toBe("c");
  });

  it("blocks by account when grouping by account", () => {
    const rows = orderBalances(
      [
        holding({ id: "a", venue: "wallet", valueUsd: 10 }),
        holding({ id: "b", venue: "hyperliquid", valueUsd: 5 }),
        holding({ id: "c", venue: "wallet", valueUsd: 90 }),
      ],
      "account",
    );
    expect(rows.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
});

describe("venueLabel", () => {
  it("calls the wallet venue Spot, matching the account cards", () => {
    expect(venueLabel("wallet")).toBe("Spot");
    expect(venueLabel("hyperliquid")).toBe("Hyperliquid");
    expect(venueLabel("binance")).toBe("Binance");
  });
});

describe("capitalAllocation", () => {
  it("adds up to the total, perps at equity and never notional", () => {
    const allocation = capitalAllocation(
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 1320 },
        spot: [holding({ valueUsd: 1000 })],
        perps: [perp()],
      }),
      ALL_ACCOUNTS,
    )!;
    expect(allocation.by).toBe("account");
    expect(allocation.slices.map((slice) => [slice.label, slice.valueUsd])).toEqual([
      ["Spot", 1000],
      ["Hyperliquid", 320],
    ]);
    expect(allocation.slices.reduce((sum, slice) => sum + slice.pct, 0)).toBeCloseTo(100, 6);
  });

  it("takes a DeFi receipt token's overlap out of Spot, where it sits", () => {
    const allocation = capitalAllocation(
      snapshot({
        summary: { ...snapshot().summary, totalValueUsd: 1500 },
        spot: [holding({ valueUsd: 1000 }), holding({ id: "wallet:kUSDC", symbol: "kUSDC", valueUsd: 500 })],
        defi: [{ id: "k", protocol: "Kamino", chain: "solana", category: "vault", label: "USDC", valueUsd: 500, suppliedUsd: 500, borrowedUsd: null, apyPct: 5, earnedUsd: null, healthFactor: null, inRange: null }],
      }),
      ALL_ACCOUNTS,
    )!;
    expect(allocation.slices.find((slice) => slice.key === "spot")?.valueUsd).toBe(1000);
    expect(allocation.slices.reduce((sum, slice) => sum + slice.valueUsd, 0)).toBe(1500);
  });

  it("has nothing to draw for an unfunded account", () => {
    expect(capitalAllocation(snapshot({ summary: { ...snapshot().summary, totalValueUsd: 0 } }), ALL_ACCOUNTS)).toBeNull();
  });

  it("adds a venue's free collateral, so its breakdown matches its equity", () => {
    const allocation = capitalAllocation(snapshot({ scopes: [scope()], perps: [perp()] }), "hyperliquid")!;
    expect(allocation.slices.map((slice) => [slice.label, slice.valueUsd])).toEqual([
      ["SOL-PERP", 320],
      ["Free collateral", 180],
    ]);
    expect(allocation.totalUsd).toBe(500);
  });

  it("breaks one account down by what it holds", () => {
    const allocation = capitalAllocation(
      snapshot({ spot: [holding({ valueUsd: 300 }), holding({ id: "wallet:USDC", symbol: "USDC", valueUsd: 100 })], perps: [perp()] }),
      "spot",
    )!;
    expect(allocation).toMatchObject({ by: "asset", totalUsd: 400 });
    expect(allocation.slices.map((slice) => slice.label)).toEqual(["SOL", "USDC"]);
  });
});
