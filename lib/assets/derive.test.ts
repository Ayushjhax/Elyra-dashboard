import { describe, expect, it } from "vitest";
import {
  ALL_ACCOUNTS,
  accountScopes,
  allocationRows,
  change24hOf,
  deriveAccounts,
  orderBalances,
  scopeSnapshot,
  syncSummary,
  venueLabel,
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
    history: [], notes: [], partial: false,
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

describe("allocationRows and syncSummary", () => {
  it("ranks only accounts holding real capital", () => {
    const accounts = deriveAccounts(
      snapshot({ spot: [holding({ valueUsd: 1000 })], scopes: [scope({ valueUsd: 500 })] }),
    );
    const rows = allocationRows(accounts);
    expect(rows.map((r) => r.id)).toEqual(["spot", "hyperliquid"]);
    /* Percentages are against the true total, so they need not sum to 100
       when something could not be valued — that is honest, not a bug. */
    expect(rows[0].allocationPct).toBeCloseTo((1000 / 1500) * 100, 6);
  });

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
    expect(sync.unintegrated).toEqual(["Solana Perps", "Prediction Markets"]);
    expect(sync.ready).toBe(1);
    expect(sync.total).toBe(4);
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

describe("accountScopes", () => {
  it("offers the wallet address only against the spot account", () => {
    const base = snapshot({
      spot: [holding()],
      scopes: [
        { id: "addr", label: "Solana wallet", address: "8rYaBc", chain: "Solana", venue: "wallet" },
        scope(),
      ],
    });
    const scopes = accountScopes(base, deriveAccounts(base));
    expect(scopes.find((s) => s.id === "spot")?.address).toBe("8rYaBc");
    expect(scopes.find((s) => s.id === "hyperliquid")?.address).toBeNull();
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
