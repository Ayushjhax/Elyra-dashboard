import "server-only";

import { fetchJson } from "@/lib/market/http";
import {
  INTERVAL_MS,
  type Candle,
  type FundingSnapshot,
  type MarketSnapshot,
  type MarketSource,
  type OpenInterestSnapshot,
} from "@/lib/market/types";
import type { Interval } from "@/lib/types";

/* ---------------------------------------------------------------------------
   Hyperliquid's public /info endpoint.

   Everything is a POST to one URL, discriminated by a `type` field, and none
   of it needs a key. This is the source for HYPE and for anything else
   Binance does not list.

   Funding here settles hourly, not every eight hours as on Binance. The
   snapshot carries `intervalHours` so a caller never has to assume.
--------------------------------------------------------------------------- */

const INFO = "https://api.hyperliquid.xyz/info";
const SOURCE = "hyperliquid";
const FUNDING_INTERVAL_HOURS = 1;

const INTERVALS: Record<Interval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
  "1W": "1w",
};

interface AssetContext {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  markPx: string;
  midPx: string | null;
  oraclePx: string;
}

type MetaAndAssetCtxs = [
  { universe: Array<{ name: string }> },
  AssetContext[],
];

interface HlCandle {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

interface FundingHistoryRow {
  coin: string;
  fundingRate: string;
  time: number;
}

const num = (value: string) => Number(value);

function info<T>(body: Record<string, unknown>): Promise<T> {
  return fetchJson<T>({
    source: SOURCE,
    url: INFO,
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Every perp context, keyed by coin. One request covers the whole universe. */
async function contexts(): Promise<Map<string, AssetContext>> {
  const [meta, ctxs] = await info<MetaAndAssetCtxs>({ type: "metaAndAssetCtxs" });
  const map = new Map<string, AssetContext>();
  /* The two arrays are index-aligned; that alignment is the only thing tying
     a context to a coin name. */
  meta.universe.forEach((asset, index) => {
    const ctx = ctxs[index];
    if (ctx) map.set(asset.name.toUpperCase(), ctx);
  });
  return map;
}

async function fetchCandles(
  symbol: string,
  interval: Interval,
  limit: number,
): Promise<Candle[]> {
  const endTime = Date.now();
  const startTime = endTime - INTERVAL_MS[interval] * limit;

  const rows = await info<HlCandle[]>({
    type: "candleSnapshot",
    req: {
      coin: symbol.toUpperCase(),
      interval: INTERVALS[interval],
      startTime,
      endTime,
    },
  });

  return rows.map((row) => ({
    openTime: row.t,
    open: num(row.o),
    high: num(row.h),
    low: num(row.l),
    close: num(row.c),
    volume: num(row.v),
  }));
}

export const hyperliquid: MarketSource = {
  id: SOURCE,

  supports() {
    /* The perp universe is large and changes. Rather than keep a list in
       sync, let the request decide: an unlisted coin comes back empty and the
       router moves on. */
    return true;
  },

  async snapshot(symbols) {
    if (symbols.length === 0) return [];

    const ctxs = await contexts();
    const fetchedAt = new Date().toISOString();

    /* 24h high and low are not in the asset context, so they come from the
       day candle — one request per symbol. Hyperliquid normally serves a
       single symbol here, since it is the fallback for what Binance lacks. */
    const results = await Promise.all(
      symbols.map(async (symbol): Promise<MarketSnapshot | null> => {
        const key = symbol.toUpperCase();
        const ctx = ctxs.get(key);
        if (!ctx) return null;

        const price = ctx.midPx !== null ? num(ctx.midPx) : num(ctx.markPx);
        const previous = num(ctx.prevDayPx);

        let high24h = price;
        let low24h = price;
        try {
          const day = await fetchCandles(key, "1D", 1);
          if (day.length > 0) {
            high24h = day[day.length - 1].high;
            low24h = day[day.length - 1].low;
          }
        } catch {
          /* Leave the extremes at the last price rather than failing the
             snapshot; the price, change and volume are all still real. */
        }

        return {
          symbol: key,
          price,
          change24hPct: previous === 0 ? 0 : (price / previous - 1) * 100,
          high24h,
          low24h,
          volume24h: num(ctx.dayNtlVlm),
          markPrice: num(ctx.markPx),
          source: SOURCE,
          fetchedAt,
        };
      }),
    );

    return results.filter((row): row is MarketSnapshot => row !== null);
  },

  candles: fetchCandles,

  async funding(symbol, lookbackHours) {
    const key = symbol.toUpperCase();
    const startTime = Date.now() - lookbackHours * 3_600_000;

    const [ctxs, history] = await Promise.all([
      contexts(),
      info<FundingHistoryRow[]>({
        type: "fundingHistory",
        coin: key,
        startTime,
      }),
    ]);

    const ctx = ctxs.get(key);
    /* Rates arrive as a per-hour fraction. Convert once, to percent. */
    const rates = history.map((row) => num(row.fundingRate) * 100);
    const currentPct = ctx ? num(ctx.funding) * 100 : (rates.at(-1) ?? 0);

    return {
      symbol: key,
      currentRatePct: currentPct,
      /* Funding accrues continuously and settles on the hour, so the next
         settlement is the top of the next hour rather than a value the API
         reports. */
      nextFundingTime: nextHour().toISOString(),
      meanRatePct:
        rates.length > 0
          ? rates.reduce((a, b) => a + b, 0) / rates.length
          : currentPct,
      consecutiveNegative: runLength(rates, (rate) => rate < 0),
      consecutivePositive: runLength(rates, (rate) => rate > 0),
      intervalHours: FUNDING_INTERVAL_HOURS,
      settlementsInWindow: rates.length,
      source: SOURCE,
      fetchedAt: new Date().toISOString(),
    } satisfies FundingSnapshot;
  },

  async openInterest(symbol, lookbackHours) {
    const key = symbol.toUpperCase();
    const ctxs = await contexts();
    const ctx = ctxs.get(key);

    const current = ctx ? num(ctx.openInterest) : 0;
    const price = ctx ? num(ctx.markPx) : 0;

    return {
      symbol: key,
      current,
      currentNotional: current * price,
      /* The /info endpoint exposes no open-interest history. Reporting null
         is the honest answer; the prompt requires the agent to say so rather
         than describe a change it cannot see. */
      changePct: null,
      windowHours: lookbackHours,
      source: SOURCE,
      fetchedAt: new Date().toISOString(),
    } satisfies OpenInterestSnapshot;
  },
};

function nextHour(): Date {
  const next = new Date();
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

function runLength(rates: number[], predicate: (rate: number) => boolean): number {
  let count = 0;
  for (let i = rates.length - 1; i >= 0; i -= 1) {
    if (!predicate(rates[i])) break;
    count += 1;
  }
  return count;
}
