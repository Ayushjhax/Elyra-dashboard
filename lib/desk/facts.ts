import "server-only";

import { hyperliquidCandles } from "@/lib/autotrade/hyperliquid";
import { dexOf, marketFor } from "@/lib/autotrade/rules";
import type { Candle } from "@/lib/backtest/intervals";
import { formatPriceUsd } from "@/lib/format";
import { hyperliquidMarket } from "@/lib/providers/hyperliquid-public";

/* ---------------------------------------------------------------------------
   The Desk's fact sheet: one set of numbers, computed by code from
   Hyperliquid, that every member reads. A member may repeat these numbers
   and no others (the fact guard in lib/desk/engine.ts), so the sheet carries
   the derived figures a member would otherwise compute — and get wrong —
   itself: changes over each window, the range, the averages, volatility, a
   typical move over the question's horizon, and base rates.

   A figure that cannot be read is left off the sheet, never filled with a
   guess, and the sheet says so.
--------------------------------------------------------------------------- */

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** "+1.23%" / "−1.23%", the way every percentage on the sheet is written. */
export function pct(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return "0.00%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(2)}%`;
}

const change = (from: number | undefined, to: number) => (from === undefined || from <= 0 ? null : (to / from - 1) * 100);

function stdev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

/** The pure part: lines from bars already fetched. Exported for tests. */
export function chartFacts(input: { label: string; price: number; daily: readonly Candle[]; hourly: readonly Candle[]; horizonMinutes: number; now: number }): string[] {
  const { label, price, now } = input;
  const daily = input.daily.filter((bar) => bar.closeTime < now).sort((a, b) => a.openTime - b.openTime);
  const hourly = input.hourly.filter((bar) => bar.closeTime < now).sort((a, b) => a.openTime - b.openTime);
  const lines = [`Market: ${label}, a Hyperliquid perpetual`, `Price now (mid): ${formatPriceUsd(price)}`];

  const dayAgo = hourly.find((bar) => bar.openTime >= now - 24 * HOUR - HOUR / 2);
  const c24 = change(dayAgo?.open, price);
  if (c24 !== null) lines.push(`Change over the last 24 hours: ${pct(c24)}`);
  const weekAgo = daily.at(-7);
  const c7 = change(weekAgo?.open, price);
  if (c7 !== null) lines.push(`Change over the last 7 days: ${pct(c7)}`);
  const c30 = change(daily[0]?.open, price);
  if (c30 !== null && daily.length >= 28) lines.push(`Change over the last ${daily.length} days: ${pct(c30)}`);

  const week = daily.slice(-7);
  if (week.length >= 5) {
    const high = Math.max(...week.map((bar) => bar.high), price);
    const low = Math.min(...week.map((bar) => bar.low), price);
    lines.push(`7-day range: low ${formatPriceUsd(low)}, high ${formatPriceUsd(high)}`);
    if (high > low) lines.push(`Where the price sits in that range: ${Math.round(((price - low) / (high - low)) * 100)}% of the way from low to high`);
  }

  const last20 = daily.slice(-20);
  if (last20.length === 20) {
    const average = last20.reduce((sum, bar) => sum + bar.close, 0) / 20;
    lines.push(`20-day average close: ${formatPriceUsd(average)}; the price is ${pct((price / average - 1) * 100)} from it`);
  }

  const returns = daily.slice(1).map((bar, index) => Math.log(bar.close / daily[index].close));
  const vol = stdev(returns);
  if (vol !== null && returns.length >= 14) {
    const dailyPct = vol * 100;
    lines.push(`Daily volatility (standard deviation of daily moves, last ${returns.length} days): ${dailyPct.toFixed(2)}%`);
    const typical = dailyPct * Math.sqrt(input.horizonMinutes / 1440);
    lines.push(`A typical move over the question's horizon (one standard deviation): ${typical.toFixed(2)}%`);
  }

  if (daily.length >= 14) {
    const up = daily.filter((bar) => bar.close > bar.open).length;
    lines.push(`Days that closed higher than they opened, last ${daily.length} days: ${up} of ${daily.length}`);
  }
  if (hourly.length >= 24) {
    const recent = hourly.slice(-24);
    const up = recent.filter((bar) => bar.close > bar.open).length;
    lines.push(`Hours that closed higher than they opened, last 24 hours: ${up} of 24`);
  }
  return lines;
}

async function bars(coin: string, interval: string, from: number, to: number): Promise<Candle[]> {
  return hyperliquidCandles(coin, interval, from, to).catch(() => []);
}

export async function factSheet(market: string, price: number, horizonMinutes: number, now: number): Promise<string[]> {
  const label = marketFor(market)?.label ?? market;
  const [daily, hourly] = await Promise.all([bars(market, "1d", now - 31 * DAY, now), bars(market, "1h", now - 50 * HOUR, now)]);
  const lines = chartFacts({ label, price, daily, hourly, horizonMinutes, now });
  if (daily.length === 0 && hourly.length === 0) lines.push("Hyperliquid's bars could not be read just now; the sheet has no history.");

  /* Funding and open interest are read from Hyperliquid's own book; a builder dex (trade[XYZ]) is not on it. */
  if (dexOf(market) === null) {
    const ctx = await hyperliquidMarket(market).catch(() => null);
    const data = ctx?.ok ? ctx.data : undefined;
    if (data !== undefined) {
      if (data.fundingRate !== null && data.fundingIntervalHours !== null) {
        const hourlyRate = (data.fundingRate * 100) / data.fundingIntervalHours;
        const annual = hourlyRate * 24 * 365;
        lines.push(
          `Funding: ${hourlyRate.toFixed(4)}% an hour, about ${annual.toFixed(1)}% a year; ${data.fundingRate > 0 ? "longs pay shorts" : data.fundingRate < 0 ? "shorts pay longs" : "nobody pays"}`,
        );
      }
      if (data.openInterest !== null && data.markPrice !== null) lines.push(`Open interest: $${Math.round((data.openInterest * data.markPrice) / 1e6).toLocaleString("en-US")} million`);
      if (data.volume24hUsd !== null) lines.push(`Volume over 24 hours: $${Math.round(data.volume24hUsd / 1e6).toLocaleString("en-US")} million`);
    } else {
      lines.push("Funding and open interest could not be read just now.");
    }
  } else {
    lines.push("Funding and open interest are not on the sheet: this market trades on trade[XYZ], a builder exchange on Hyperliquid.");
  }

  /* Cross-market: Bitcoin and Ether over the same windows. */
  for (const peer of ["BTC", "ETH"]) {
    if (peer === market) continue;
    const peerHourly = await bars(peer, "1h", now - 26 * HOUR, now);
    const peerDaily = await bars(peer, "1d", now - 8 * DAY, now);
    const last = peerHourly.filter((bar) => bar.closeTime < now).at(-1)?.close;
    if (last === undefined) continue;
    const c24 = change(peerHourly.find((bar) => bar.openTime >= now - 24 * HOUR - HOUR / 2)?.open, last);
    const c7 = change(peerDaily.filter((bar) => bar.closeTime < now).at(-7)?.open, last);
    const parts = [c24 === null ? null : `${pct(c24)} over 24 hours`, c7 === null ? null : `${pct(c7)} over 7 days`].filter((part): part is string => part !== null);
    if (parts.length > 0) lines.push(`${peer === "BTC" ? "Bitcoin" : "Ether"}: ${parts.join(", ")}`);
  }
  return lines;
}
