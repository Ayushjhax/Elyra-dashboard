import { formatPrice, formatPriceUsd, formatRelativeTime } from "@/lib/format";
import { englishTranslator, type Translator } from "@/lib/i18n/translate";
import type { BriefLine } from "@/lib/market/brief";
import {
  CANDLE_SOURCE_NAME,
  distance,
  intervalLabel,
  nearestLevel,
  pctText,
  type LegendResponse,
} from "@/lib/market/chartFacts";
import type { PivotLevels } from "@/lib/market/levels";
import { priceDecimals } from "@/lib/market/precision";
import type { PriceRow, PriceSource } from "@/lib/market/pyth/types";
import type { Interval } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The website's decision brief, in words — built from the same figures the
   chart's legend shows (lib/market/chartFacts.ts), so the two agree on every
   market and interval.

   - The lead: the level nearest the live quote and how far it is, with what
     an alert on it would need (its target and side).
   - Price context: the live quote against the EMA 20 at the chart's
     interval, named with both, and the gap in percent and in price.

   Facts only: no line says what price will do or what to trade.
--------------------------------------------------------------------------- */

/** Each price source's own name, untranslated. */
const QUOTE_SOURCE_NAME: Record<PriceSource, string> = {
  pyth: "Pyth",
  yahoo: "Yahoo Finance",
  binance: "Binance",
  okx: "OKX",
  hyperliquid: "Hyperliquid",
};

export type LeadLevel =
  | {
      kind: "ready";
      /** "R1 at $72.0833". */
      title: string;
      /** "0.08% below the live quote." */
      detail: string;
      source: string;
      /** What an alert on this level would watch for. */
      target: number;
      direction: "above" | "below";
    }
  | { kind: "loading" }
  | { kind: "unavailable"; text: string };

/** "-$0.0434": a price gap, signed, at the quote's precision. */
export function signedGap(diff: number, quote: number): string {
  return `${diff < 0 ? "-" : "+"}$${formatPrice(Math.abs(diff), priceDecimals(quote))}`;
}

function levelDetail(level: number, quote: number, t: Translator): string {
  const { pct } = distance(level, quote);
  return pct < 0
    ? t("{pct}% below the live quote.", { pct: pctText(pct) })
    : t("{pct}% above the live quote.", { pct: pctText(pct) });
}

/**
 * The level the brief leads with: the prior-day pivot nearest the live
 * quote; for a market with no pivots, the nearer edge of the 24h range.
 */
export function leadLevel(
  symbol: string,
  row: PriceRow | undefined,
  levels: PivotLevels | null,
  levelsLoading: boolean,
  t: Translator = englishTranslator,
): LeadLevel {
  if (!row || levelsLoading) return { kind: "loading" };
  const quote = row.price;
  if (levels !== null) {
    const level = nearestLevel(levels, quote);
    if (level !== null) {
      return {
        kind: "ready",
        title: t("{name} at {value}", { name: level.name, value: formatPriceUsd(level.value) }),
        detail: levelDetail(level.value, quote, t),
        source: t("Prior-day pivots"),
        target: level.value,
        direction: level.value > quote ? "above" : "below",
      };
    }
  }
  if (row.high24h !== null && row.low24h !== null && row.high24h > row.low24h) {
    const high = row.high24h - quote <= quote - row.low24h;
    const value = high ? row.high24h : row.low24h;
    return {
      kind: "ready",
      title: high ? t("24h high at {value}", { value: formatPriceUsd(value) }) : t("24h low at {value}", { value: formatPriceUsd(value) }),
      detail: levelDetail(value, quote, t),
      source: t("Exchange 24h range"),
      target: value,
      direction: value > quote ? "above" : "below",
    };
  }
  return { kind: "unavailable", text: t("No pivots or 24h range for {symbol}, so there is no level to lead with.", { symbol }) };
}

/** The live quote against the EMA at the chart's interval. */
export function priceContextLine(
  symbol: string,
  row: PriceRow | undefined,
  facts: LegendResponse | null,
  factsLoading: boolean,
  interval: Interval,
  now: number | null,
  t: Translator = englishTranslator,
): BriefLine {
  if (!row || factsLoading) return { kind: "loading" };
  const label = intervalLabel(interval);
  const period = facts?.period ?? 20;
  if (facts === null || facts.close === null) {
    return {
      kind: "unavailable",
      text: t("No {interval} candles for {symbol}, so there is no EMA {period} to compare the live quote with.", {
        interval: label,
        symbol,
        period,
      }),
    };
  }
  if (facts.ema === null) {
    return {
      kind: "unavailable",
      text: t("Fewer than {period} completed {interval} candles for {symbol}, so there is no EMA {period} yet.", {
        interval: label,
        symbol,
        period,
      }),
    };
  }
  const { pct, diff } = distance(row.price, facts.ema);
  const values = {
    interval: label,
    period,
    ema: formatPriceUsd(facts.ema),
    pct: pctText(pct),
    diff: signedGap(diff, row.price),
  };
  return {
    kind: "ready",
    text:
      pct < 0
        ? t("Live quote is below the {interval} EMA {period} ({ema}) by {pct}% ({diff}).", values)
        : t("Live quote is above the {interval} EMA {period} ({ema}) by {pct}% ({diff}).", values),
    source: legendSource(row, facts, interval, now, t),
  };
}

/** "Pyth quote · Binance 1h candles · just now". */
export function legendSource(
  row: PriceRow,
  facts: LegendResponse,
  interval: Interval,
  now: number | null,
  t: Translator = englishTranslator,
): string {
  const parts = [t("{source} quote", { source: QUOTE_SOURCE_NAME[row.source ?? "pyth"] })];
  if (facts.source !== null) {
    parts.push(t("{source} {interval} candles", { source: CANDLE_SOURCE_NAME[facts.source], interval: intervalLabel(interval) }));
  }
  if (now !== null) parts.push(formatRelativeTime(row.publishedAt, now, t.locale));
  return parts.join(" · ");
}
