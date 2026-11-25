import { isPast } from "@/lib/alerts/rules";
import type { AlertsResponse, PriceAlert } from "@/lib/alerts/types";
import { formatCompactUsd, formatPriceUsd, formatQty, formatRelativeTime, formatUsd } from "@/lib/format";
import { nearestLevels, type PivotLevels } from "@/lib/market/levels";
import type { PriceRow } from "@/lib/market/pyth/types";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";
import { englishTranslator, type Translator } from "@/lib/i18n/translate";

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

   Each line takes the reader's translator last; the app passes none and gets
   English, word for word as before.
--------------------------------------------------------------------------- */

/** Clause and sentence punctuation in the reader's language. */
function marks(t: Translator): { comma: string; semicolon: string; stop: string } {
  return t.locale === "zh-CN" ? { comma: "，", semicolon: "；", stop: "。" } : { comma: ", ", semicolon: "; ", stop: "." };
}

export type BriefLine =
  | { kind: "ready"; text: string; source: string }
  | { kind: "loading" }
  | { kind: "unavailable"; text: string };

export function structureLine(
  symbol: string,
  row: PriceRow | undefined,
  levels: PivotLevels | null,
  now: number | null,
  t: Translator = englishTranslator,
): BriefLine {
  if (!row) return { kind: "loading" };
  const parts: string[] = [];
  const price = formatPriceUsd(row.price);
  if (row.high24h !== null && row.low24h !== null && row.high24h > row.low24h) {
    const position = (row.price - row.low24h) / (row.high24h - row.low24h);
    const values = {
      symbol,
      price,
      low: formatPriceUsd(row.low24h),
      high: formatPriceUsd(row.high24h),
      pct: Math.round(Math.min(Math.max(position, 0), 1) * 100),
    };
    parts.push(
      position >= 0.85
        ? t("{symbol} at {price} sits near the top of today's {low}–{high} range ({pct}% up it)", values)
        : position <= 0.15
          ? t("{symbol} at {price} sits near the bottom of today's {low}–{high} range ({pct}% up it)", values)
          : t("{symbol} at {price} sits inside today's {low}–{high} range ({pct}% up it)", values),
    );
  } else {
    parts.push(t("{symbol} at {price}", { symbol, price }));
  }
  if (row.emaPrice > 0) {
    const distance = ((row.price - row.emaPrice) / row.emaPrice) * 100;
    const pct = Math.abs(distance).toFixed(2);
    parts.push(distance >= 0 ? t("{pct}% above its EMA", { pct }) : t("{pct}% below its EMA", { pct }));
  }
  if (levels !== null) {
    const { above, below } = nearestLevels(levels, row.price);
    if (above !== null && below !== null) {
      parts.push(
        t("between {below} {belowValue} and {above} {aboveValue}", {
          below: below.name,
          belowValue: formatPriceUsd(below.value),
          above: above.name,
          aboveValue: formatPriceUsd(above.value),
        }),
      );
    } else if (above !== null) {
      parts.push(t("below every pivot level, {name} {value} the nearest", { name: above.name, value: formatPriceUsd(above.value) }));
    } else if (below !== null) {
      parts.push(t("above every pivot level, {name} {value} the nearest", { name: below.name, value: formatPriceUsd(below.value) }));
    }
  }
  const age = now === null ? "" : ` · ${formatRelativeTime(row.publishedAt, now, t.locale)}`;
  const { comma, stop } = marks(t);
  return {
    kind: "ready",
    text: `${parts.join(comma)}${stop}`,
    source: `Pyth${row.high24h !== null ? t(" · exchange 24h range") : ""}${levels !== null ? t(" · prior-day pivots") : ""}${age}`,
  };
}

/** What the snapshot holds in this market, in words; null when nothing. */
export function exposureIn(snapshot: PortfolioSnapshot, symbol: string, t: Translator = englishTranslator): string | null {
  const spot = snapshot.spot.filter((holding) => holding.symbol.toUpperCase() === symbol);
  const perps = snapshot.perps.filter((position) => position.market.toUpperCase().replace(/-?PERP$/, "") === symbol);
  if (spot.length === 0 && perps.length === 0) return null;
  const lines: string[] = [];
  if (spot.length > 0) {
    const quantity = spot.reduce((sum, holding) => sum + holding.quantity, 0);
    const value = spot.reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0);
    const priced = spot.some((holding) => holding.valueUsd !== null);
    const spotLine = t("{quantity} {symbol} spot", { quantity: formatQty(quantity, quantity < 1 ? 4 : 2), symbol });
    lines.push(priced ? `${spotLine} (${formatUsd(value)})` : spotLine);
  }
  for (const position of perps) {
    const pnl = position.unrealizedPnlUsd === null ? "" : t(", {pnl} PnL", { pnl: formatUsd(position.unrealizedPnlUsd, { sign: true }) });
    lines.push(
      t("{side} {size} {symbol} perp on {venue} ({notional}{pnl})", {
        side: t(position.side),
        size: formatQty(position.size, position.size < 1 ? 4 : 2),
        symbol,
        venue: position.venue,
        notional: formatCompactUsd(position.notionalUsd),
        pnl,
      }),
    );
  }
  const { semicolon, stop } = marks(t);
  return `${lines.join(semicolon)}${stop}`;
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

export function exposureLine(symbol: string, input: ExposureInput, now: number | null, t: Translator = englishTranslator): BriefLine {
  if (!input.available) return { kind: "unavailable", text: t("Sign-in is not configured, so no account can be read.") };
  if (!input.ready) return { kind: "loading" };
  if (!input.authenticated) return { kind: "unavailable", text: t("Connect a wallet to see your {symbol} exposure.", { symbol }) };
  if (input.unconfigured) return { kind: "unavailable", text: t("Balances are not configured on the server.") };
  if (input.snapshot === null) {
    return input.error !== null && !input.loading
      ? { kind: "unavailable", text: t("Your accounts could not be read: {error}", { error: input.error }) }
      : { kind: "loading" };
  }
  const found = exposureIn(input.snapshot, symbol, t);
  const partial = input.snapshot.partial ? t(" Some sources failed, so this may be incomplete.") : "";
  const age =
    input.fetchedAt === null || now === null ? "" : ` · ${formatRelativeTime(new Date(input.fetchedAt).toISOString(), now, t.locale)}`;
  return {
    kind: "ready",
    text: found === null ? `${t("No {symbol} exposure across your connected accounts.", { symbol })}${partial}` : `${found}${partial}`,
    source: `${t("Portfolio")}${input.stale ? t(" · last known") : ""}${age}`,
  };
}

export interface AlertsInput {
  alerts: readonly PriceAlert[];
  delivery: AlertsResponse["delivery"];
  appDelivery: AlertsResponse["appDelivery"];
}

/** Where a crossing goes, said for the surface showing it. */
function deliveredTo(surface: "web" | "app", alerts: AlertsInput, t: Translator): { crossed: string; source: string } {
  if (surface === "app") {
    return alerts.appDelivery === "none"
      ? { crossed: t(", and it is not reaching this phone yet"), source: t("Your price alerts · not delivered yet") }
      : { crossed: t(" — the app is told on the next check"), source: t("Your price alerts · Elyra app") };
  }
  return alerts.delivery === "telegram"
    ? { crossed: t(" — Telegram is told on the next check"), source: t("Your price alerts · Telegram") }
    : alerts.delivery === "app" || alerts.delivery === "inbox"
      ? { crossed: t(" — the Elyra app is told on the next check"), source: t("Your price alerts · Elyra app") }
      : { crossed: t(", and it is not being sent anywhere"), source: t("Your price alerts · not delivered") };
}

export function watchNextLine(
  symbol: string,
  row: PriceRow | undefined,
  alerts: AlertsInput,
  levels: PivotLevels | null,
  surface: "web" | "app",
  t: Translator = englishTranslator,
): BriefLine {
  const price = row?.price ?? null;
  const armed = alerts.alerts.filter((alert) => alert.symbol === symbol && alert.triggeredAt === null);
  const delivered = deliveredTo(surface, alerts, t);
  if (armed.length > 0) {
    const crossed = armed.find((alert) => isPast(alert, price));
    if (crossed) {
      return {
        kind: "ready",
        text: t("Your {direction} {target} alert has been crossed{delivered}.", {
          direction: t(crossed.direction),
          target: formatPriceUsd(crossed.target),
          delivered: delivered.crossed,
        }),
        source: t("Your price alerts"),
      };
    }
    /* The one price will reach first. */
    const nearest = price === null ? armed[0] : [...armed].sort((a, b) => Math.abs(a.target - price) - Math.abs(b.target - price))[0];
    const distance = price === null ? "" : t(", {pct}% away", { pct: Math.abs(((nearest.target - price) / price) * 100).toFixed(2) });
    const more = armed.length > 1 ? t(" {count} more armed.", { count: armed.length - 1 }) : "";
    return {
      kind: "ready",
      text: t("Your alert {direction} {target}{distance}.{more}", {
        direction: t(nearest.direction),
        target: formatPriceUsd(nearest.target),
        distance,
        more,
      }),
      source: delivered.source,
    };
  }
  if (!row) return { kind: "loading" };
  if (levels !== null) {
    const { above, below } = nearestLevels(levels, row.price);
    const nearest = above === null ? below : below === null ? above : Math.abs(above.pct) <= Math.abs(below.pct) ? above : below;
    if (nearest !== null) {
      return {
        kind: "ready",
        text:
          nearest.pct >= 0
            ? t("{name} at {value} is {pct}% above. Set an alert on it from the chart.", {
                name: nearest.name,
                value: formatPriceUsd(nearest.value),
                pct: Math.abs(nearest.pct).toFixed(2),
              })
            : t("{name} at {value} is {pct}% below. Set an alert on it from the chart.", {
                name: nearest.name,
                value: formatPriceUsd(nearest.value),
                pct: Math.abs(nearest.pct).toFixed(2),
              }),
        source: t("Prior-day pivots"),
      };
    }
  }
  if (row.high24h !== null && row.low24h !== null) {
    const toHigh = ((row.high24h - row.price) / row.price) * 100;
    const toLow = ((row.price - row.low24h) / row.price) * 100;
    const high = toHigh <= toLow;
    return {
      kind: "ready",
      text: (high
        ? t("The 24h high at {value} is {pct}% away. Set an alert on it from the chart.", { value: formatPriceUsd(row.high24h), pct: Math.abs(toHigh).toFixed(2) })
        : t("The 24h low at {value} is {pct}% away. Set an alert on it from the chart.", { value: formatPriceUsd(row.low24h), pct: Math.abs(toLow).toFixed(2) })),
      source: t("Exchange 24h range"),
    };
  }
  return { kind: "unavailable", text: t("Nothing armed on {symbol}. Set a price alert from the chart to be told when it moves.", { symbol }) };
}
