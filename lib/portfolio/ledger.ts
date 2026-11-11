import { underlyingSymbol } from "@/lib/personalized/calculations";
import { onSolanaWallet } from "@/lib/portfolio/chain";
import type { PortfolioSnapshot, Venue } from "@/lib/portfolio/types";
import type { MarketType } from "@/lib/types";
import type { WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   The workspace's trading table, from the account itself.

   The portfolio snapshot is shaped for the Portfolio page — spot, perps and
   DeFi in separate lists with separate columns. The workspace shows them in
   one table under one venue filter, so this folds them into rows that share
   a shape, and nothing else: every figure is the snapshot's own, `null`
   stays `null`, and a row is never invented to fill a tab.

   Each row also says what can be done with it from here. That is narrow on
   purpose: a wallet holding can be swapped, because the swap is signed in
   this browser; anything on an exchange is managed on the exchange, because
   Elyra's venue connections are read-only and nothing here places an order.

   Pure, so it is tested directly.
--------------------------------------------------------------------------- */

export type LedgerAction =
  /** Sell a wallet holding through the swap dialog, signed in this browser. */
  | { kind: "swap"; symbol: string; quantity: number }
  /** Managed on the venue itself — a link, never an order from here. */
  | { kind: "venue"; venue: string; href: string | null }
  | null;

export interface LedgerPosition {
  id: string;
  market: Exclude<MarketType, "prediction">;
  symbol: string;
  label: string;
  venue: Venue;
  /** Long/short for perps; null for a holding or a deposit. */
  side: "long" | "short" | null;
  /** For DeFi rows: lend, stake, LP and so on. */
  category: string | null;
  size: number | null;
  entryPrice: number | null;
  markPrice: number | null;
  liquidationPrice: number | null;
  valueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  /** The margin behind a perp, so a live mark can recompute its ROE. */
  marginUsd: number | null;
  action: LedgerAction;
}

export interface LedgerOrder {
  id: string;
  market: MarketType;
  symbol: string;
  label: string;
  venue: Venue;
  type: string;
  side: "buy" | "sell";
  priceUsd: number | null;
  quantity: number;
  filledPct: number;
  status: string;
  createdAt: string;
  action: LedgerAction;
}

export interface LedgerEvent {
  id: string;
  market: MarketType;
  summary: string;
  venue: Venue;
  status: "pending" | "confirmed" | "failed";
  at: string | null;
  href: string | null;
}

/** Where a perp or order on a venue is managed. Null for a venue without a known page. */
export function venueUrl(venue: string, market: string): string | null {
  const coin = underlyingSymbol(market);
  if (coin.length === 0) return null;
  switch (venue.toLowerCase()) {
    case "hyperliquid":
      return `https://app.hyperliquid.xyz/trade/${encodeURIComponent(coin)}`;
    case "binance":
      return `https://www.binance.com/en/futures/${encodeURIComponent(coin)}USDT`;
    case "okx":
      return `https://www.okx.com/trade-swap/${encodeURIComponent(coin.toLowerCase())}-usdt-swap`;
    default:
      return null;
  }
}

function venueName(venue: string): string {
  if (venue === "okx") return "OKX";
  return venue.charAt(0).toUpperCase() + venue.slice(1);
}

export function ledgerPositions(snapshot: PortfolioSnapshot): LedgerPosition[] {
  const rows: LedgerPosition[] = [];

  for (const holding of snapshot.spot) {
    /* Unverified tokens are shown on the Portfolio page with their warning;
       a trading table is not the place for an airdropped lookalike. Dust
       below a cent is noise in a table that is meant to be read at a glance. */
    if (!holding.verified || holding.quantity <= 0) continue;
    if (holding.valueUsd !== null && holding.valueUsd < 0.01) continue;
    const symbol = holding.symbol.toUpperCase();
    const inWallet = holding.venue === "wallet";
    /* The Solana wallet's tokens read as bare symbols, as they always have;
       one on another chain says which, since the same ETH can sit on two. */
    const where = inWallet ? (onSolanaWallet(holding) ? null : holding.chain) : venueName(holding.venue);
    rows.push({
      id: `spot:${holding.id}`,
      market: "spot",
      symbol,
      label: where === null ? symbol : `${symbol} · ${where}`,
      venue: holding.venue,
      side: null,
      category: null,
      size: holding.quantity,
      entryPrice: holding.avgCostUsd,
      markPrice: holding.priceUsd,
      liquidationPrice: null,
      valueUsd: holding.valueUsd,
      pnlUsd: holding.pnlUsd,
      pnlPct: holding.pnlPct,
      marginUsd: null,
      /* A stablecoin is the thing a sale turns into, so it gets no Sell. */
      action: inWallet
        ? holding.liquid
          ? null
          : { kind: "swap", symbol, quantity: holding.quantity }
        : { kind: "venue", venue: holding.venue, href: null },
    });
  }

  for (const position of snapshot.perps) {
    const symbol = underlyingSymbol(position.market);
    rows.push({
      id: `perp:${position.id}`,
      market: "perps",
      symbol,
      label: `${position.market} · ${venueName(position.venue)}`,
      venue: position.venue,
      side: position.side,
      category: null,
      size: position.size,
      entryPrice: position.entryPrice,
      markPrice: position.markPrice,
      liquidationPrice: position.liquidationPrice,
      valueUsd: position.notionalUsd,
      pnlUsd: position.unrealizedPnlUsd,
      pnlPct: position.roePct,
      marginUsd: position.marginUsd,
      action: { kind: "venue", venue: position.venue, href: venueUrl(position.venue, position.market) },
    });
  }

  for (const position of snapshot.defi) {
    rows.push({
      id: `defi:${position.id}`,
      market: "defi",
      symbol: position.label.split(/[\s/·-]/)[0]?.toUpperCase() ?? "",
      label: `${position.label} · ${position.protocol}`,
      venue: position.protocol,
      side: null,
      category: position.category,
      size: null,
      entryPrice: null,
      markPrice: null,
      liquidationPrice: null,
      valueUsd: position.valueUsd,
      pnlUsd: position.earnedUsd,
      pnlPct: null,
      marginUsd: null,
      action: { kind: "venue", venue: position.protocol, href: null },
    });
  }

  return rows;
}

/**
 * A row re-marked to a live price. Spot value follows the quantity; a perp's
 * PnL follows its entry and side, and its ROE its margin. A figure the row
 * could not compute before stays uncomputed after — a live price does not
 * supply a missing entry.
 */
export function markToLive(row: LedgerPosition, price: number | undefined): LedgerPosition {
  if (price === undefined || !Number.isFinite(price) || price <= 0) return row;
  if (row.market === "spot") {
    return { ...row, markPrice: price, valueUsd: row.size === null ? row.valueUsd : row.size * price };
  }
  if (row.market === "perps") {
    if (row.entryPrice === null || row.size === null || row.side === null) return { ...row, markPrice: price };
    const pnlUsd = (price - row.entryPrice) * row.size * (row.side === "long" ? 1 : -1);
    return {
      ...row,
      markPrice: price,
      valueUsd: row.size * price,
      pnlUsd,
      pnlPct: row.marginUsd !== null && row.marginUsd > 0 ? (pnlUsd / row.marginUsd) * 100 : row.pnlPct,
    };
  }
  return row;
}

export function ledgerOrders(snapshot: PortfolioSnapshot): LedgerOrder[] {
  return snapshot.orders.map((order) => {
    const perp = /PERP/i.test(order.market);
    return {
      id: `order:${order.id}`,
      market: perp ? "perps" : "spot",
      symbol: underlyingSymbol(order.market),
      label: `${order.market} · ${venueName(order.venue)}`,
      venue: order.venue,
      type: order.type,
      side: order.side,
      priceUsd: order.priceUsd,
      quantity: order.quantity,
      filledPct: order.quantity > 0 ? (order.filledQuantity / order.quantity) * 100 : 0,
      status: order.status,
      createdAt: order.createdAt,
      action: { kind: "venue", venue: order.venue, href: venueUrl(order.venue, order.market) },
    };
  });
}

const ACTIVITY_MARKET: Record<string, MarketType> = {
  deposit: "spot",
  withdrawal: "spot",
  swap: "spot",
  trade: "spot",
  transfer: "spot",
  perp_open: "perps",
  perp_close: "perps",
  order: "perps",
  defi: "defi",
  agent: "spot",
};

/**
 * History: the venues' own activity where the snapshot carries any, and the
 * wallet's on-chain transactions, newest first. A wallet transaction is
 * described only as far as its signature list goes — landed or failed, when,
 * and a link to the explorer for the rest.
 */
export function ledgerHistory(
  snapshot: PortfolioSnapshot | null,
  wallet: readonly WalletActivity[],
  explorer: (signature: string) => string,
): LedgerEvent[] {
  const events: LedgerEvent[] = [];

  for (const item of snapshot?.activity ?? []) {
    events.push({
      id: `activity:${item.id}`,
      market: ACTIVITY_MARKET[item.kind] ?? "spot",
      summary: item.summary,
      venue: item.venue,
      status: item.status,
      at: item.at,
      href: item.href,
    });
  }

  for (const item of wallet) {
    events.push({
      id: `tx:${item.signature}`,
      market: "spot",
      /* What the transaction did, where the RPC could decode it. */
      summary: item.summary?.title ?? item.memo ?? "Wallet transaction",
      venue: "wallet",
      status: item.status,
      at: item.at,
      href: item.href ?? explorer(item.signature),
    });
  }

  return events.sort((a, b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0));
}
