"use client";

import { useId } from "react";
import { ChevronDown, Eye, Layers, LineChart } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { formatCompactUsd, formatPriceUsd, formatQty, formatRelativeTime, formatUsd } from "@/lib/format";
import { isPast, useAlerts, type AlertsFeed } from "@/lib/alerts/useAlerts";
import { nearestLevels, type PivotLevels } from "@/lib/market/levels";
import { useLevels } from "@/lib/market/useLevels";
import { useAssets, usePrice } from "@/lib/market/usePrices";
import type { PriceRow } from "@/lib/market/pyth/types";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { useElyraStore } from "@/lib/store";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The decision brief: three rows about the market on the chart.

   - Price structure — where the price sits in today's range, against its
     EMA and between yesterday's pivot levels, from the live Pyth feed, the
     exchanges' 24h window and the last completed daily candle.
   - Your exposure — what the signed-in account actually holds in this
     market, spot and perp, from /api/portfolio.
   - Watch next — the nearest price alert you have armed on this market,
     otherwise the nearest pivot level, otherwise today's range edge.

   Every row says where it came from and how fresh it is, and says plainly
   when it cannot be computed. Nothing is inferred to fill a gap: no exposure
   is shown for an account that could not be read, and "none" is only said
   when the read succeeded and found none.
--------------------------------------------------------------------------- */

type Line =
  | { kind: "ready"; text: string; source: string }
  | { kind: "loading" }
  | { kind: "unavailable"; text: string };

function structure(
  symbol: string,
  row: PriceRow | undefined,
  levels: PivotLevels | null,
  now: number | null,
): Line {
  if (!row) return { kind: "loading" };
  const parts: string[] = [];

  if (row.high24h !== null && row.low24h !== null && row.high24h > row.low24h) {
    const position = (row.price - row.low24h) / (row.high24h - row.low24h);
    const where =
      position >= 0.85
        ? "near the top of"
        : position <= 0.15
          ? "near the bottom of"
          : "inside";
    parts.push(
      `${symbol} at ${formatPriceUsd(row.price)} sits ${where} today's ${formatPriceUsd(row.low24h)}–${formatPriceUsd(row.high24h)} range (${Math.round(Math.min(Math.max(position, 0), 1) * 100)}% up it)`,
    );
  } else {
    parts.push(`${symbol} at ${formatPriceUsd(row.price)}`);
  }

  if (row.emaPrice > 0) {
    const distance = ((row.price - row.emaPrice) / row.emaPrice) * 100;
    parts.push(`${Math.abs(distance).toFixed(2)}% ${distance >= 0 ? "above" : "below"} its EMA`);
  }

  if (levels !== null) {
    const { above, below } = nearestLevels(levels, row.price);
    if (above !== null && below !== null) {
      parts.push(`between ${below.name} ${formatPriceUsd(below.value)} and ${above.name} ${formatPriceUsd(above.value)}`);
    } else if (above !== null) {
      parts.push(`below every pivot level, ${above.name} ${formatPriceUsd(above.value)} the nearest`);
    } else if (below !== null) {
      parts.push(`above every pivot level, ${below.name} ${formatPriceUsd(below.value)} the nearest`);
    }
  }

  const age = now === null ? "" : ` · ${formatRelativeTime(row.publishedAt, now)}`;
  return {
    kind: "ready",
    text: `${parts.join(", ")}.`,
    source: `Pyth${row.high24h !== null ? " · exchange 24h range" : ""}${levels !== null ? " · prior-day pivots" : ""}${age}`,
  };
}

function exposureIn(snapshot: PortfolioSnapshot, symbol: string): string | null {
  const spot = snapshot.spot.filter((holding) => holding.symbol.toUpperCase() === symbol);
  const perps = snapshot.perps.filter(
    (position) => position.market.toUpperCase().replace(/-?PERP$/, "") === symbol,
  );
  if (spot.length === 0 && perps.length === 0) return null;

  const lines: string[] = [];
  if (spot.length > 0) {
    const quantity = spot.reduce((sum, holding) => sum + holding.quantity, 0);
    const value = spot.reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0);
    const priced = spot.some((holding) => holding.valueUsd !== null);
    lines.push(`${formatQty(quantity, quantity < 1 ? 4 : 2)} ${symbol} spot${priced ? ` (${formatUsd(value)})` : ""}`);
  }
  for (const position of perps) {
    const pnl =
      position.unrealizedPnlUsd === null ? "" : `, ${formatUsd(position.unrealizedPnlUsd, { sign: true })} PnL`;
    lines.push(
      `${position.side} ${formatQty(position.size, position.size < 1 ? 4 : 2)} ${symbol} perp on ${position.venue} (${formatCompactUsd(position.notionalUsd)}${pnl})`,
    );
  }
  return `${lines.join("; ")}.`;
}

function exposure(
  symbol: string,
  auth: ReturnType<typeof useElyraAuth>,
  feed: ReturnType<typeof usePortfolio>,
  now: number | null,
): Line {
  if (!auth.available) return { kind: "unavailable", text: "Sign-in is not configured, so no account can be read." };
  if (!auth.ready) return { kind: "loading" };
  if (!auth.authenticated) return { kind: "unavailable", text: `Connect a wallet to see your ${symbol} exposure.` };
  if (feed.unconfigured) return { kind: "unavailable", text: "Balances are not configured on the server." };
  if (feed.snapshot === null) {
    return feed.error !== null && !feed.loading
      ? { kind: "unavailable", text: `Your accounts could not be read: ${feed.error}` }
      : { kind: "loading" };
  }

  const found = exposureIn(feed.snapshot, symbol);
  const partial = feed.snapshot.partial ? " Some sources failed, so this may be incomplete." : "";
  const age =
    feed.fetchedAt === null || now === null ? "" : ` · ${formatRelativeTime(new Date(feed.fetchedAt).toISOString(), now)}`;
  return {
    kind: "ready",
    text: found === null ? `No ${symbol} exposure across your connected accounts.${partial}` : `${found}${partial}`,
    source: `Portfolio${feed.stale ? " · last known" : ""}${age}`,
  };
}

function watchNext(
  symbol: string,
  row: PriceRow | undefined,
  alerts: AlertsFeed,
  levels: PivotLevels | null,
): Line {
  const price = row?.price ?? null;
  const armed = alerts.alerts.filter((alert) => alert.symbol === symbol && alert.triggeredAt === null);

  if (armed.length > 0) {
    const crossed = armed.find((alert) => isPast(alert, price));
    if (crossed) {
      return {
        kind: "ready",
        text: `Your ${crossed.direction} ${formatPriceUsd(crossed.target)} alert has been crossed${
          alerts.delivery === "telegram" ? " — Telegram is told on the next check" : ", and it is not being sent anywhere"
        }.`,
        source: "Your price alerts",
      };
    }
    /* The one price will reach first. */
    const nearest =
      price === null
        ? armed[0]
        : [...armed].sort((a, b) => Math.abs(a.target - price) - Math.abs(b.target - price))[0];
    const distance = price === null ? "" : `, ${Math.abs(((nearest.target - price) / price) * 100).toFixed(2)}% away`;
    const more = armed.length > 1 ? ` ${armed.length - 1} more armed.` : "";
    return {
      kind: "ready",
      text: `Your alert ${nearest.direction} ${formatPriceUsd(nearest.target)}${distance}.${more}`,
      source: alerts.delivery === "telegram" ? "Your price alerts · Telegram" : "Your price alerts · not delivered",
    };
  }

  if (!row) return { kind: "loading" };

  if (levels !== null) {
    const { above, below } = nearestLevels(levels, row.price);
    const nearest =
      above === null ? below : below === null ? above : Math.abs(above.pct) <= Math.abs(below.pct) ? above : below;
    if (nearest !== null) {
      return {
        kind: "ready",
        text: `${nearest.name} at ${formatPriceUsd(nearest.value)} is ${Math.abs(nearest.pct).toFixed(2)}% ${
          nearest.pct >= 0 ? "above" : "below"
        }. Set an alert on it from the chart.`,
        source: "Prior-day pivots",
      };
    }
  }

  if (row.high24h !== null && row.low24h !== null) {
    const toHigh = ((row.high24h - row.price) / row.price) * 100;
    const toLow = ((row.price - row.low24h) / row.price) * 100;
    const high = toHigh <= toLow;
    return {
      kind: "ready",
      text: `The 24h ${high ? "high" : "low"} at ${formatPriceUsd(high ? row.high24h : row.low24h)} is ${Math.abs(high ? toHigh : toLow).toFixed(2)}% away. Set an alert on it from the chart.`,
      source: "Exchange 24h range",
    };
  }
  return { kind: "unavailable", text: `Nothing armed on ${symbol}. Set a price alert from the chart to be told when it moves.` };
}

const ROWS = [
  { key: "structure", label: "Price structure", icon: LineChart },
  { key: "exposure", label: "Your exposure", icon: Layers },
  { key: "watch", label: "Watch next", icon: Eye },
] as const;

export function DecisionBrief() {
  const open = useElyraStore((state) => state.decisionBriefOpen);
  const setOpen = useElyraStore((state) => state.setDecisionBriefOpen);
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const { byId } = useAssets([selectedAssetId]);
  const asset = byId.get(selectedAssetId);
  const symbol = asset?.symbol.toUpperCase() ?? "";
  const { row } = usePrice(selectedAssetId);
  const auth = useElyraAuth();
  const feed = usePortfolio();
  const alerts = useAlerts();
  const { data: levelData } = useLevels(asset?.assetType === "crypto" ? symbol : null);
  const levels = levelData?.levels ?? null;
  const now = useMinute();
  const bodyId = useId();

  const lines: Record<(typeof ROWS)[number]["key"], Line> = {
    structure: symbol ? structure(symbol, row, levels, now) : { kind: "loading" },
    exposure: symbol ? exposure(symbol, auth, feed, now) : { kind: "loading" },
    watch: symbol ? watchNext(symbol, row, alerts, levels) : { kind: "loading" },
  };

  return (
    <section aria-label="Decision brief" className="rounded-card border border-border-subtle bg-surface-raised">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="type-eyebrow text-text-muted">Decision brief</span>
        {symbol && <span className="type-data-sm text-text-secondary">{symbol}</span>}
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          aria-hidden
          className={cn(
            "ml-auto text-text-muted transition-transform duration-[var(--dur-base)] ease-brand",
            !open && "-rotate-90",
          )}
        />
      </button>

      <dl id={bodyId} hidden={!open} className="divide-y divide-border-subtle border-t border-border-subtle">
        {ROWS.map(({ key, label, icon: Icon }) => {
          const line = lines[key];
          return (
            <div key={key} className="flex gap-2.5 px-3 py-2.5">
              <Icon size={14} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                <dt className="type-label text-text-secondary">{label}</dt>
                <dd className="mt-0.5">
                  {line.kind === "loading" ? (
                    <span aria-label="Loading" className="skeleton block h-4 w-4/5" />
                  ) : line.kind === "unavailable" ? (
                    <p className="type-body-sm text-text-muted">{line.text}</p>
                  ) : (
                    <>
                      <p className="type-body-sm text-text-primary">{line.text}</p>
                      <p className="type-data-sm mt-0.5 text-text-muted">{line.source}</p>
                    </>
                  )}
                </dd>
              </div>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
