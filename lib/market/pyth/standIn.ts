import "server-only";

import { TTL, cached } from "@/lib/market/cache";
import { UpstreamError, fetchJson } from "@/lib/market/http";
import type { PythPrice } from "@/lib/market/pyth/types";
import { yahooCandidates } from "@/lib/markets/exchanges";

/* ---------------------------------------------------------------------------
   Stand-in prices for the feeds Pyth's plan does not cover.

   Pyth is the price of record. A Pyth Pro key is granted feeds by asset
   class, and the current plan covers crypto, FX and metals but not equities
   or equity indices ("Not entitled: … asset type 'equity'", and the gated
   `pyth-indices` group). Rather than show those as blank, a feed Pyth
   refuses is priced from Yahoo Finance's quote — free and keyless — and the
   row says so (`source: "yahoo"`), so nothing presents Yahoo's number as
   Pyth's. When the plan grows to cover a class, Pyth answers again by itself
   (lib/market/pyth/client.ts forgets a refusal after 15 minutes) and the
   stand-in stops being asked.

   The symbol mapping is the one World markets already uses for previous
   closes (`yahooCandidates`): US tickers as they are, Hong Kong, Tokyo,
   Seoul, Shanghai, Shenzhen, Taipei and the NSE by suffix, and the indices
   Pyth and Yahoo both publish. A feed with no dependable Yahoo symbol — a
   private company's index, say — has no stand-in and stays blank.

   Yahoo's spark endpoint answers up to twenty symbols in one request.
   Outside the regular session its price is the last close, so the session
   is reported as "closed" then — never as pre- or post-market, which would
   claim a price this source does not give.
--------------------------------------------------------------------------- */

const SPARK = "https://query1.finance.yahoo.com/v7/finance/spark";
const PER_REQUEST = 20;
const TIMEOUT_MS = 6_000;

export interface StandInFeed {
  id: number;
  /** The label the caller shows: the catalogue's ticker, or the feed's Pyth symbol. */
  symbol: string;
  pythSymbol: string;
}

interface Period {
  start?: number;
  end?: number;
}

interface SparkMeta {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  currentTradingPeriod?: { regular?: Period };
}

interface SparkResponse {
  spark?: { result?: Array<{ symbol?: string; response?: Array<{ meta?: SparkMeta }> }> };
}

/** "regular" inside the exchange's regular session, otherwise "closed" — the price is then the last close. */
export function sessionAt(meta: SparkMeta, nowSeconds: number): string {
  const regular = meta.currentTradingPeriod?.regular;
  if (regular?.start !== undefined && regular.end !== undefined && nowSeconds >= regular.start && nowSeconds < regular.end) return "regular";
  return "closed";
}

/** Yahoo's quote for each symbol asked, keyed by the symbol as asked; a symbol Yahoo does not answer is absent. */
async function quotes(symbols: string[]): Promise<Map<string, SparkMeta>> {
  const out = new Map<string, SparkMeta>();
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += PER_REQUEST) batches.push(symbols.slice(i, i + PER_REQUEST));
  await Promise.all(
    batches.map(async (batch) => {
      const key = `yahoo:spark:${[...batch].sort().join(",")}`;
      const result = await cached(key, TTL.price, async () => {
        try {
          return await fetchJson<SparkResponse>({
            source: "yahoo",
            url: `${SPARK}?symbols=${batch.map(encodeURIComponent).join(",")}&range=1d&interval=1d`,
            /* Yahoo answers a bare programmatic client with a consent redirect. */
            headers: { "user-agent": "Mozilla/5.0 (compatible; Elyra/1.0)" },
            timeoutMs: TIMEOUT_MS,
          });
        } catch (error: unknown) {
          if (error instanceof UpstreamError) return {} as SparkResponse;
          throw error;
        }
      }).catch(() => ({ value: {} as SparkResponse }));
      for (const row of result.value.spark?.result ?? []) {
        const meta = row.response?.[0]?.meta;
        const symbol = row.symbol ?? meta?.symbol;
        if (symbol !== undefined && meta !== undefined) out.set(symbol, meta);
      }
    }),
  );
  return out;
}

/** A usable price: positive, finite, from a quote that names its time. */
function usable(meta: SparkMeta | undefined): meta is SparkMeta & { regularMarketPrice: number; regularMarketTime: number } {
  return meta !== undefined && typeof meta.regularMarketPrice === "number" && Number.isFinite(meta.regularMarketPrice) && meta.regularMarketPrice > 0 && typeof meta.regularMarketTime === "number";
}

/**
 * Yahoo's prices for feeds Pyth refused, shaped like Pyth's so every caller
 * reads them the same way, and marked `source: "yahoo"`. A Korean share is
 * asked on KOSPI first and on KOSDAQ when KOSPI has no such ticker.
 */
export async function standInPrices(feeds: readonly StandInFeed[], now: number = Date.now()): Promise<PythPrice[]> {
  const candidates = new Map(feeds.map((feed) => [feed.id, yahooCandidates(feed.pythSymbol)]));
  const prices: PythPrice[] = [];
  let pending = feeds.filter((feed) => (candidates.get(feed.id) ?? []).length > 0);
  for (let attempt = 0; attempt < 2 && pending.length > 0; attempt += 1) {
    const asked = pending.map((feed) => ({ feed, symbol: (candidates.get(feed.id) ?? [])[attempt] })).filter((entry): entry is { feed: StandInFeed; symbol: string } => entry.symbol !== undefined);
    if (asked.length === 0) break;
    const answers = await quotes([...new Set(asked.map((entry) => entry.symbol))]);
    const missed: StandInFeed[] = [];
    for (const { feed, symbol } of asked) {
      const meta = answers.get(symbol);
      if (!usable(meta)) {
        missed.push(feed);
        continue;
      }
      prices.push({
        id: feed.id,
        symbol: feed.symbol,
        price: meta.regularMarketPrice,
        confidence: 0,
        emaPrice: meta.regularMarketPrice,
        bestBid: null,
        bestAsk: null,
        publisherCount: 0,
        marketSession: sessionAt(meta, Math.floor(now / 1000)),
        publishedAt: new Date(meta.regularMarketTime * 1000).toISOString(),
        source: "yahoo",
      });
    }
    pending = missed;
  }
  return prices;
}
