import { isPast } from "@/lib/alerts/rules";
import type { AlertsResponse, PriceAlert } from "@/lib/alerts/types";
import { formatCompactUsd, formatPriceUsd, formatQty, formatRelativeTime, formatUsd } from "@/lib/format";
import { nearestLevels, type PivotLevels } from "@/lib/market/levels";
import type { PriceRow } from "@/lib/market/pyth/types";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   The decision brief's three lines about one market — shared by the
   website's DecisionBrief and the Android app's asset screen.

   - Price structure: where the price sits in today's range, against its EMA
     and between yesterday's pivot levels.
   - Your exposure: what the account holds in this market, spot and perp.
   - Watch next: the nearest armed alert, else the nearest pivot, else the
     day's range edge.

   Every line says where it came from and how fresh it is, and says plainly
   when it cannot be computed. Nothing is inferred to fill a gap.

   The one difference between surfaces is where an alert is delivered: the
   website may name Telegram, the app — which has no Telegram — says the app.
--------------------------------------------------------------------------- */

export type BriefLine =
  | { kind: "ready"; text: string; source: string }
  | { kind: "loading" }
  | { kind: "unavailable"; text: string };

export function structureLine(symbol: string, row: PriceRow | undefined, levels: PivotLevels | null, now: number | null): BriefLine {
  if (!row) return { kind: "loading" };
  const parts: string[] = [];
  if (row.high24h !== null && row.low24h !== null && row.high24h > row.low24h) {
    const position = (row.price - row.low24h) / (row.high24h - row.low24h);
    const where = position >= 0.85 ? "near the top of" : position <= 0.15 ? "near the bottom of" : "inside";
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

/** What the snapshot holds in this market, in words; null when nothing. */
export function exposureIn(snapshot: PortfolioSnapshot, symbol: string): string | null {
  const spot = snapshot.spot.filter((holding) => holding.symbol.toUpperCase() === symbol);
  const perps = snapshot.perps.filter((position) => position.market.toUpperCase().replace(/-?PERP$/, "") === symbol);
  if (spot.length === 0 && perps.length === 0) return null;
  const lines: string[] = [];
  if (spot.length > 0) {
    const quantity = spot.reduce((sum, holding) => sum + holding.quantity, 0);
    const value = spot.reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0);
    const priced = spot.some((holding) => holding.valueUsd !== null);
    lines.push(`${formatQty(quantity, quantity < 1 ? 4 : 2)} ${symbol} spot${priced ? ` (${formatUsd(value)})` : ""}`);
  }
  for (const position of perps) {
    const pnl = position.unrealizedPnlUsd === null ? "" : `, ${formatUsd(position.unrealizedPnlUsd, { sign: true })} PnL`;
    lines.push(
      `${position.side} ${formatQty(position.size, position.size < 1 ? 4 : 2)} ${symbol} perp on ${position.venue} (${formatCompactUsd(position.notionalUsd)}${pnl})`,
    );
  }
  return `${lines.join("; ")}.`;
}

export interface ExposureInput {
  /** Sign-in is configured on this deployment. */
  available: boolean;
  ready: boolean;
  authenticated: boolean;
  snapshot: PortfolioSnapshot | null;
  loading: boolean;
  error: string | null;
  unconfigured: boolean;
  stale: boolean;
  fetchedAt: number | null;
}

export function exposureLine(symbol: string, input: ExposureInput, now: number | null): BriefLine {
  if (!input.available) return { kind: "unavailable", text: "Sign-in is not configured, so no account can be read." };
  if (!input.ready) return { kind: "loading" };
  if (!input.authenticated) return { kind: "unavailable", text: `Connect a wallet to see your ${symbol} exposure.` };
  if (input.unconfigured) return { kind: "unavailable", text: "Balances are not configured on the server." };
  if (input.snapshot === null) {
    return input.error !== null && !input.loading
      ? { kind: "unavailable", text: `Your accounts could not be read: ${input.error}` }
      : { kind: "loading" };
  }
  const found = exposureIn(input.snapshot, symbol);
  const partial = input.snapshot.partial ? " Some sources failed, so this may be incomplete." : "";
  const age = input.fetchedAt === null || now === null ? "" : ` · ${formatRelativeTime(new Date(input.fetchedAt).toISOString(), now)}`;
  return {
    kind: "ready",
    text: found === null ? `No ${symbol} exposure across your connected accounts.${partial}` : `${found}${partial}`,
    source: `Portfolio${input.stale ? " · last known" : ""}${age}`,
  };
}

export interface AlertsInput {
  alerts: readonly PriceAlert[];
  delivery: AlertsResponse["delivery"];
  appDelivery: AlertsResponse["appDelivery"];
}

/** Where a crossing goes, said for the surface showing it. */
function deliveredTo(surface: "web" | "app", alerts: AlertsInput): { crossed: string; source: string } {
  if (surface === "app") {
    return alerts.appDelivery === "none"
      ? { crossed: ", and it is not reaching this phone yet", source: "Your price alerts · not delivered yet" }
      : { crossed: " — the app is told on the next check", source: "Your price alerts · Elyra app" };
  }
  return alerts.delivery === "telegram"
    ? { crossed: " — Telegram is told on the next check", source: "Your price alerts · Telegram" }
    : alerts.delivery === "app" || alerts.delivery === "inbox"
      ? { crossed: " — the Elyra app is told on the next check", source: "Your price alerts · Elyra app" }
      : { crossed: ", and it is not being sent anywhere", source: "Your price alerts · not delivered" };
}

export function watchNextLine(
  symbol: string,
  row: PriceRow | undefined,
  alerts: AlertsInput,
  levels: PivotLevels | null,
  surface: "web" | "app",
): BriefLine {
  const price = row?.price ?? null;
  const armed = alerts.alerts.filter((alert) => alert.symbol === symbol && alert.triggeredAt === null);
  const delivered = deliveredTo(surface, alerts);
  if (armed.length > 0) {
    const crossed = armed.find((alert) => isPast(alert, price));
    if (crossed) {
      return {
        kind: "ready",
        text: `Your ${crossed.direction} ${formatPriceUsd(crossed.target)} alert has been crossed${delivered.crossed}.`,
        source: "Your price alerts",
      };
    }
    /* The one price will reach first. */
    const nearest = price === null ? armed[0] : [...armed].sort((a, b) => Math.abs(a.target - price) - Math.abs(b.target - price))[0];
    const distance = price === null ? "" : `, ${Math.abs(((nearest.target - price) / price) * 100).toFixed(2)}% away`;
    const more = armed.length > 1 ? ` ${armed.length - 1} more armed.` : "";
    return { kind: "ready", text: `Your alert ${nearest.direction} ${formatPriceUsd(nearest.target)}${distance}.${more}`, source: delivered.source };
  }
  if (!row) return { kind: "loading" };
  if (levels !== null) {
    const { above, below } = nearestLevels(levels, row.price);
    const nearest = above === null ? below : below === null ? above : Math.abs(above.pct) <= Math.abs(below.pct) ? above : below;
    if (nearest !== null) {
      return {
        kind: "ready",
        text: `${nearest.name} at ${formatPriceUsd(nearest.value)} is ${Math.abs(nearest.pct).toFixed(2)}% ${nearest.pct >= 0 ? "above" : "below"}. Set an alert on it from the chart.`,
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
