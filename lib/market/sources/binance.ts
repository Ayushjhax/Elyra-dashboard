import "server-only";

import { fetchJson } from "@/lib/market/http";
import {
  INTERVAL_MS,
  UnsupportedCapability,
  type Candle,
  type FundingSnapshot,
  type MarketSnapshot,
  type MarketSource,
  type OpenInterestSnapshot,
} from "@/lib/market/types";
import type { Interval } from "@/lib/types";

/* ---------------------------------------------------------------------------
   Binance public REST. No key required for any of this.

   Spot lives on api.binance.com, funding and open interest on fapi.binance.com.
   Binance blocks some IP ranges outright, which is why the router keeps OKX
   behind it for the same symbols.
--------------------------------------------------------------------------- */

const SPOT = "https://api.binance.com";
const FUTURES = "https://fapi.binance.com";
const SOURCE = "binance";

/** Symbols in this app's universe that Binance does not list. */
const NOT_LISTED = new Set(["HYPE"]);

/** Binance quotes everything here in USDT. */
function pair(symbol: string): string {
  return `${symbol.toUpperCase()}USDT`;
}

const INTERVALS: Record<Interval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
  "1W": "1w",
};

/** Periods accepted by the open-interest history endpoint. */
const OI_PERIODS = ["5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"] as const;

interface Ticker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
}

interface PremiumIndex {
  symbol: string;
  markPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
}

interface FundingRateRow {
  symbol: string;
  fundingTime: number;
  fundingRate: string;
}

interface OpenInterestRow {
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
}

const num = (value: string | number): number => Number(value);

export const binance: MarketSource = {
  id: SOURCE,

  supports(symbol) {
    return !NOT_LISTED.has(symbol.toUpperCase());
  },

  /** One request for every symbol asked for, which is what the batch is for. */
  async snapshot(symbols) {
    if (symbols.length === 0) return [];

    const pairs = symbols.map(pair);
    const query = encodeURIComponent(JSON.stringify(pairs));
    const rows = await fetchJson<Ticker24h[]>({
      source: SOURCE,
      url: `${SPOT}/api/v3/ticker/24hr?symbols=${query}`,
    });

    /* Mark prices come from the futures endpoint and are a separate call.
       A perp mark is not essential to a snapshot, so a failure there leaves
       markPrice null rather than failing the whole batch. */
    const marks = await markPrices(pairs).catch(() => new Map<string, number>());
    const fetchedAt = new Date().toISOString();
    const bySymbol = new Map(rows.map((row) => [row.symbol, row]));

    return symbols.flatMap((symbol) => {
      const row = bySymbol.get(pair(symbol));
      if (!row) return [];
      return [
        {
          symbol: symbol.toUpperCase(),
          price: num(row.lastPrice),
          change24hPct: num(row.priceChangePercent),
          high24h: num(row.highPrice),
          low24h: num(row.lowPrice),
          volume24h: num(row.quoteVolume),
          markPrice: marks.get(pair(symbol)) ?? null,
          source: SOURCE,
          fetchedAt,
        } satisfies MarketSnapshot,
      ];
    });
  },

  async candles(symbol, interval, limit) {
    /* Binance caps klines at 1000 per request. Nothing here asks for more,
       and the summary only ever returns 20 of them. */
    const capped = Math.min(Math.max(limit, 1), 1000);
    const rows = await fetchJson<unknown[][]>({
      source: SOURCE,
      url:
        `${SPOT}/api/v3/klines?symbol=${pair(symbol)}` +
        `&interval=${INTERVALS[interval]}&limit=${capped}`,
    });

    return rows.map(
      (row): Candle => ({
        openTime: Number(row[0]),
        open: num(row[1] as string),
        high: num(row[2] as string),
        low: num(row[3] as string),
        close: num(row[4] as string),
        /* Index 7 is quote-asset volume. Index 5 is base units, which is not
           comparable between symbols and reads as a nonsense figure next to a
           dollar price. */
        volume: num(row[7] as string),
      }),
    );
  },

  async funding(symbol, lookbackHours) {
    if (NOT_LISTED.has(symbol.toUpperCase())) {
      throw new UnsupportedCapability(SOURCE, "funding", symbol);
    }

    const intervalHours = 8;
    const wanted = Math.max(1, Math.ceil(lookbackHours / intervalHours));

    const [current, history] = await Promise.all([
      fetchJson<PremiumIndex>({
        source: SOURCE,
        url: `${FUTURES}/fapi/v1/premiumIndex?symbol=${pair(symbol)}`,
      }),
      fetchJson<FundingRateRow[]>({
        source: SOURCE,
        url:
          `${FUTURES}/fapi/v1/fundingRate?symbol=${pair(symbol)}` +
          `&limit=${Math.min(wanted, 1000)}`,
      }),
    ]);

    /* Binance reports rates as a fraction. The UI and the brand's own copy
       speak in percent per 8h, so convert once, here. */
    const toPct = (rate: string) => num(rate) * 100;
    const rates = history.map((row) => toPct(row.fundingRate));
    const currentPct = toPct(current.lastFundingRate);

    return {
      symbol: symbol.toUpperCase(),
      currentRatePct: currentPct,
      nextFundingTime:
        current.nextFundingTime > 0
          ? new Date(current.nextFundingTime).toISOString()
          : null,
      meanRatePct:
        rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : currentPct,
      consecutiveNegative: runLength(rates, (rate) => rate < 0),
      consecutivePositive: runLength(rates, (rate) => rate > 0),
      intervalHours,
      settlementsInWindow: rates.length,
      source: SOURCE,
      fetchedAt: new Date().toISOString(),
    } satisfies FundingSnapshot;
  },

  async openInterest(symbol, lookbackHours) {
    if (NOT_LISTED.has(symbol.toUpperCase())) {
      throw new UnsupportedCapability(SOURCE, "open interest", symbol);
    }

    const period = oiPeriod(lookbackHours);
    const points = Math.max(
      2,
      Math.min(500, Math.ceil((lookbackHours * 3_600_000) / periodMs(period))),
    );

    const [current, history] = await Promise.all([
      fetchJson<{ openInterest: string }>({
        source: SOURCE,
        url: `${FUTURES}/fapi/v1/openInterest?symbol=${pair(symbol)}`,
      }),
      /* This lives under /futures/data, not /fapi, and only retains about 30
         days. An empty array is a normal answer for a thin symbol, not an
         error — the change is reported as null in that case. */
      fetchJson<OpenInterestRow[]>({
        source: SOURCE,
        url:
          `${FUTURES}/futures/data/openInterestHist?symbol=${pair(symbol)}` +
          `&period=${period}&limit=${points}`,
      }).catch(() => [] as OpenInterestRow[]),
    ]);

    const currentOi = num(current.openInterest);
    const oldest = history.length > 0 ? num(history[0].sumOpenInterest) : null;
    const latestValue =
      history.length > 0
        ? num(history[history.length - 1].sumOpenInterestValue)
        : null;

    return {
      symbol: symbol.toUpperCase(),
      current: currentOi,
      currentNotional: latestValue,
      changePct:
        oldest === null || oldest === 0 ? null : (currentOi / oldest - 1) * 100,
      windowHours: lookbackHours,
      source: SOURCE,
      fetchedAt: new Date().toISOString(),
    } satisfies OpenInterestSnapshot;
  },
};

/** Perp marks for a batch, keyed by Binance pair. */
async function markPrices(pairs: string[]): Promise<Map<string, number>> {
  /* premiumIndex with no symbol returns every listed perp in one response,
     which is one request instead of one per symbol. */
  const rows = await fetchJson<PremiumIndex[]>({
    source: SOURCE,
    url: `${FUTURES}/fapi/v1/premiumIndex`,
  });

  const wanted = new Set(pairs);
  const marks = new Map<string, number>();
  for (const row of rows) {
    if (wanted.has(row.symbol)) marks.set(row.symbol, num(row.markPrice));
  }
  return marks;
}

/** How many of the most recent readings share a sign. */
function runLength(rates: number[], predicate: (rate: number) => boolean): number {
  let count = 0;
  for (let i = rates.length - 1; i >= 0; i -= 1) {
    if (!predicate(rates[i])) break;
    count += 1;
  }
  return count;
}

/** The coarsest period that still gives a useful number of points. */
function oiPeriod(lookbackHours: number): (typeof OI_PERIODS)[number] {
  if (lookbackHours <= 4) return "5m";
  if (lookbackHours <= 12) return "15m";
  if (lookbackHours <= 24) return "1h";
  if (lookbackHours <= 72) return "2h";
  if (lookbackHours <= 168) return "4h";
  return "1d";
}

function periodMs(period: (typeof OI_PERIODS)[number]): number {
  const map: Record<(typeof OI_PERIODS)[number], number> = {
    "5m": INTERVAL_MS["5m"],
    "15m": INTERVAL_MS["15m"],
    "30m": 1_800_000,
    "1h": INTERVAL_MS["1H"],
    "2h": 7_200_000,
    "4h": INTERVAL_MS["4H"],
    "6h": 21_600_000,
    "12h": 43_200_000,
    "1d": INTERVAL_MS["1D"],
  };
  return map[period];
}
