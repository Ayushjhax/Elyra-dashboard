import { describe, expect, it } from "vitest";
import { ledgerHistory, ledgerOrders, ledgerPositions, markToLive, venueUrl } from "@/lib/portfolio/ledger";
import type { PortfolioSnapshot, SpotHolding } from "@/lib/portfolio/types";

const holding = (overrides: Partial<SpotHolding>): SpotHolding => ({
  id: "h",
  venue: "wallet",
  chain: "solana",
  address: null,
  symbol: "SOL",
  name: null,
  logo: null,
  quantity: 2,
  decimals: 9,
  priceUsd: 150,
  valueUsd: 300,
  change24hPct: null,
  allocationPct: null,
  avgCostUsd: null,
  pnlUsd: null,
  pnlPct: null,
  verified: true,
  liquid: false,
  ...overrides,
});

const snapshot = (overrides: Partial<PortfolioSnapshot>): PortfolioSnapshot =>
  ({
    asOf: "2026-10-14T00:00:00Z",
    summary: {} as PortfolioSnapshot["summary"],
    scopes: [],
    spot: [],
    perps: [],
    defi: [],
    orders: [],
    activity: [],
    history: [],
    prediction: {} as PortfolioSnapshot["prediction"],
    notes: [],
    partial: false,
    ...overrides,
  }) as PortfolioSnapshot;

describe("ledgerPositions", () => {
  it("offers a swap only for a non-stable wallet holding", () => {
    const rows = ledgerPositions(
      snapshot({
        spot: [
          holding({ id: "sol" }),
          holding({ id: "usdc", symbol: "USDC", liquid: true, priceUsd: 1, valueUsd: 50, quantity: 50 }),
          holding({ id: "bnb", symbol: "BNB", venue: "binance" }),
        ],
      }),
    );
    expect(rows.map((row) => row.action?.kind ?? null)).toEqual(["swap", null, "venue"]);
    expect(rows[0].action).toEqual({ kind: "swap", symbol: "SOL", quantity: 2 });
  });

  it("leaves out unverified tokens and dust", () => {
    const rows = ledgerPositions(
      snapshot({
        spot: [holding({ id: "fake", verified: false }), holding({ id: "dust", valueUsd: 0.001 })],
      }),
    );
    expect(rows).toEqual([]);
  });

  it("keeps a perp's figures as the venue reported them, null included", () => {
    const [row] = ledgerPositions(
      snapshot({
        perps: [
          {
            id: "p",
            venue: "hyperliquid",
            market: "BTC-PERP",
            side: "short",
            size: 0.5,
            entryPrice: 100_000,
            markPrice: null,
            leverage: null,
            marginUsd: null,
            liquidationPrice: null,
            notionalUsd: 50_000,
            unrealizedPnlUsd: null,
            roePct: null,
            fundingUsd: null,
          },
        ],
      }),
    );
    expect(row.symbol).toBe("BTC");
    expect(row.side).toBe("short");
    expect(row.markPrice).toBeNull();
    expect(row.pnlUsd).toBeNull();
    expect(row.action).toEqual({ kind: "venue", venue: "hyperliquid", href: "https://app.hyperliquid.xyz/trade/BTC" });
  });
});

describe("ledgerOrders", () => {
  it("classes an order by its market and computes the filled share", () => {
    const [order] = ledgerOrders(
      snapshot({
        orders: [
          {
            id: "o",
            venue: "binance",
            market: "ETH-PERP",
            type: "limit",
            side: "buy",
            priceUsd: 3000,
            quantity: 2,
            filledQuantity: 0.5,
            status: "open",
            createdAt: "2026-10-14T00:00:00Z",
          },
        ],
      }),
    );
    expect(order.market).toBe("perps");
    expect(order.filledPct).toBe(25);
  });
});

describe("ledgerHistory", () => {
  it("merges venue activity with wallet transactions, newest first", () => {
    const events = ledgerHistory(
      snapshot({
        activity: [
          {
            id: "a",
            kind: "perp_close",
            summary: "Closed SOL-PERP",
            venue: "hyperliquid",
            status: "confirmed",
            at: "2026-10-13T00:00:00Z",
            href: null,
          },
        ],
      }),
      [{ signature: "sig", status: "failed", slot: 1, at: "2026-10-14T00:00:00Z", memo: null }],
      (signature) => `https://explorer/${signature}`,
    );
    expect(events.map((event) => event.id)).toEqual(["tx:sig", "activity:a"]);
    expect(events[0]).toMatchObject({ status: "failed", href: "https://explorer/sig", summary: "Wallet transaction" });
    expect(events[1].market).toBe("perps");
  });
});

describe("venueUrl", () => {
  it("knows the venues it can link and no others", () => {
    expect(venueUrl("okx", "SOL-PERP")).toBe("https://www.okx.com/trade-swap/sol-usdt-swap");
    expect(venueUrl("drift", "SOL-PERP")).toBeNull();
  });
});

describe("markToLive", () => {
  it("recomputes a perp's PnL and ROE from the live price", () => {
    const [row] = ledgerPositions(
      snapshot({
        perps: [
          {
            id: "p",
            venue: "hyperliquid",
            market: "SOL-PERP",
            side: "short",
            size: 10,
            entryPrice: 150,
            markPrice: 150,
            leverage: 5,
            marginUsd: 300,
            liquidationPrice: 180,
            notionalUsd: 1500,
            unrealizedPnlUsd: 0,
            roePct: 0,
            fundingUsd: null,
          },
        ],
      }),
    );
    const marked = markToLive(row, 140);
    expect(marked.pnlUsd).toBe(100);
    expect(marked.pnlPct).toBeCloseTo(33.333, 2);
    expect(marked.valueUsd).toBe(1400);
  });

  it("does not invent a PnL for a perp with no entry", () => {
    const [row] = ledgerPositions(
      snapshot({
        perps: [
          {
            id: "p",
            venue: "binance",
            market: "SOL-PERP",
            side: "long",
            size: 1,
            entryPrice: null,
            markPrice: null,
            leverage: null,
            marginUsd: null,
            liquidationPrice: null,
            notionalUsd: 150,
            unrealizedPnlUsd: null,
            roePct: null,
            fundingUsd: null,
          },
        ],
      }),
    );
    const marked = markToLive(row, 140);
    expect(marked.markPrice).toBe(140);
    expect(marked.pnlUsd).toBeNull();
  });
});
