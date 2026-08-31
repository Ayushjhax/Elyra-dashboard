import "server-only";

import { UpstreamError, fetchJson } from "@/lib/market/http";
import {
  type Candle,
  type FundingSnapshot,
  type MarketSnapshot,
  type MarketSource,
  type OpenInterestSnapshot,
} from "@/lib/market/types";
import type { Interval } from "@/lib/types";

/* ---------------------------------------------------------------------------
   OKX public market data.

   The secondary for everything Binance serves. Binance blocks some IP ranges
   outright, and a deployment that lands in one gets no market data at all
   from it — the router falls through to here rather than reporting the symbol
   as unavailable.

   Only public endpoints. OKX private reads would need a key, a secret and a
   passphrase; the schema has the column for it, but nothing implements it in
   this pass.
--------------------------------------------------------------------------- */

const BASE = "https://www.okx.com";
const SOURCE = "okx";
const FUNDING_INTERVAL_HOURS = 8;

const INTERVALS: Record<Interval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1H": "1H",
  "4H": "4H",
  "1D": "1D",
  "1W": "1W",
};

const spotId = (symbol: string) => `${symbol.toUpperCase()}-USDT`;
const swapId = (symbol: string) => `${symbol.toUpperCase()}-USDT-SWAP`;

interface Envelope<T> {
  code: string;
  msg: string;
  data: T;
}

/**
 * OKX answers HTTP 200 with a non-zero `code` for business failures, so a
 * successful fetch is not a successful call. Unwrapping in one place keeps
 * that from being forgotten at a call site.
 */
async function okx<T>(path: string): Promise<T> {
  const body = await fetchJson<Envelope<T>>({
    source: SOURCE,
    url: `${BASE}${path}`,
  });
  if (body.code !== "0") {
    throw new UpstreamError(
      "client_error",
      SOURCE,
      `code ${body.code}: ${body.msg || "no message"}`,
    );
  }
  return body.data;
}

interface TickerRow {
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
  volCcy24h: string;
}

const num = (value: string) => Number(value);

export const okxSource: MarketSource = {
  id: SOURCE,

  supports() {
    return true;
  },

  async snapshot(symbols) {
    if (symbols.length === 0) return [];

    /* One request for the whole spot book, filtered locally. OKX has no
       multi-instId ticker endpoint, so the alternative is one request per
       symbol. */
    const rows = await okx<TickerRow[]>("/api/v5/market/tickers?instType=SPOT");
    const byId = new Map(rows.map((row) => [row.instId, row]));
    const marks = await markPrices().catch(() => new Map<string, number>());
    const fetchedAt = new Date().toISOString();

    return symbols.flatMap((symbol) => {
      const row = byId.get(spotId(symbol));
      if (!row) return [];
      const price = num(row.last);
      const open = num(row.open24h);
      return [
        {
          symbol: symbol.toUpperCase(),
          price,
          change24hPct: open === 0 ? 0 : (price / open - 1) * 100,
          high24h: num(row.high24h),
          low24h: num(row.low24h),
          /* volCcy24h on a spot pair is quote-currency volume. */
          volume24h: num(row.volCcy24h),
          markPrice: marks.get(swapId(symbol)) ?? null,
          source: SOURCE,
          fetchedAt,
        } satisfies MarketSnapshot,
      ];
    });
  },

  async candles(symbol, interval, limit) {
    const capped = Math.min(Math.max(limit, 1), 300);
    const rows = await okx<string[][]>(
      `/api/v5/market/candles?instId=${spotId(symbol)}` +
        `&bar=${INTERVALS[interval]}&limit=${capped}`,
    );

    /* OKX returns newest first. Every indicator here walks forward through
       time, so reversing is not cosmetic — an unreversed series gives an RSI
       and ATR computed backwards. */
    return rows
      .map(
        (row): Candle => ({
          openTime: Number(row[0]),
          open: num(row[1]),
          high: num(row[2]),
          low: num(row[3]),
          close: num(row[4]),
          /* Index 7 is quote-currency volume, matching the Binance source. */
          volume: num(row[7]),
        }),
      )
      .reverse();
  },

  async funding(symbol, lookbackHours) {
    const instId = swapId(symbol);
    const wanted = Math.max(1, Math.ceil(lookbackHours / FUNDING_INTERVAL_HOURS));

    const [current, history] = await Promise.all([
      okx<Array<{ fundingRate: string; nextFundingTime: string }>>(
        `/api/v5/public/funding-rate?instId=${instId}`,
      ),
      okx<Array<{ fundingRate: string; fundingTime: string }>>(
        `/api/v5/public/funding-rate-history?instId=${instId}` +
          `&limit=${Math.min(wanted, 100)}`,
      ),
    ]);

    const currentPct = current.length > 0 ? num(current[0].fundingRate) * 100 : 0;
    /* Newest first here too, so reverse into chronological order before
       measuring a run length. */
    const rates = history.map((row) => num(row.fundingRate) * 100).reverse();

    const nextTime = current[0]?.nextFundingTime;

    return {
      symbol: symbol.toUpperCase(),
      currentRatePct: currentPct,
      nextFundingTime:
        nextTime && Number(nextTime) > 0
          ? new Date(Number(nextTime)).toISOString()
          : null,
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
    const rows = await okx<Array<{ oi: string; oiCcy: string }>>(
      `/api/v5/public/open-interest?instType=SWAP&instId=${swapId(symbol)}`,
    );

    const current = rows.length > 0 ? num(rows[0].oiCcy) : 0;

    return {
      symbol: symbol.toUpperCase(),
      current,
      currentNotional: null,
      /* OKX's open-interest history sits behind a different, rate-limited
         endpoint that this pass does not use. Null rather than a guess. */
      changePct: null,
      windowHours: lookbackHours,
      source: SOURCE,
      fetchedAt: new Date().toISOString(),
    } satisfies OpenInterestSnapshot;
  },
};

async function markPrices(): Promise<Map<string, number>> {
  const rows = await okx<Array<{ instId: string; markPx: string }>>(
    "/api/v5/public/mark-price?instType=SWAP",
  );
  return new Map(rows.map((row) => [row.instId, num(row.markPx)]));
}

function runLength(rates: number[], predicate: (rate: number) => boolean): number {
  let count = 0;
  for (let i = rates.length - 1; i >= 0; i -= 1) {
    if (!predicate(rates[i])) break;
    count += 1;
  }
  return count;
}
