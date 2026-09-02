import "server-only";

import { TTL, cached } from "@/lib/market/cache";
import { catalogue, pythApiKey, pythBaseUrl } from "@/lib/market/pyth/catalog";
import {
  PythError,
  decodePrice,
  type PythPrice,
  type RawLatestPriceResponse,
} from "@/lib/market/pyth/types";

/* ---------------------------------------------------------------------------
   Batched price reads.

   `/v1/latest_price` takes a repeated `price_feed_ids` parameter and answers
   for all of them in one round trip, so the unit of work here is a list of
   feeds, never a single one. Every caller goes through `pricesForIds`, and
   concurrent callers asking for the same feeds within the cache window share
   one upstream request — see `inflight` below.
--------------------------------------------------------------------------- */

/** Feeds per upstream request. Keeps the query string well inside limits. */
const BATCH_SIZE = 100;

const REQUEST_TIMEOUT_MS = 8_000;

async function fetchBatch(ids: number[]): Promise<RawLatestPriceResponse> {
  const params = new URLSearchParams();
  for (const id of ids) params.append("price_feed_ids", String(id));

  const url = `${pythBaseUrl()}/v1/latest_price?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${pythApiKey()}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new PythError(
      "upstream",
      timedOut
        ? `Pyth did not respond within ${REQUEST_TIMEOUT_MS}ms`
        : `Pyth unreachable: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new PythError(
      "unauthorized",
      "Pyth rejected the API key. Check PYTH_API_KEY.",
      response.status,
    );
  }
  if (!response.ok) {
    throw new PythError("upstream", `Pyth returned ${response.status}`, response.status);
  }

  const body = (await response.json()) as RawLatestPriceResponse;
  if (!body || !Array.isArray(body.priceFeeds)) {
    throw new PythError("malformed", "Pyth response had no priceFeeds array");
  }
  return body;
}

/** Decode one raw feed, resolving its ticker through the catalogue. */
async function decodeFeeds(
  response: RawLatestPriceResponse,
): Promise<PythPrice[]> {
  const { byId } = await catalogue();
  const out: PythPrice[] = [];

  for (const feed of response.priceFeeds) {
    const asset = byId.get(feed.priceFeedId);
    /* A feed with no catalogue entry cannot be labelled, so it is dropped
       rather than surfaced as an unnamed row. */
    if (!asset) continue;

    const expo = feed.exponent;
    const publishedAtUs = feed.feedUpdateTimestamp ?? Number(response.timestampUs);

    out.push({
      id: feed.priceFeedId,
      symbol: asset.symbol,
      price: decodePrice(feed.price, expo),
      confidence:
        feed.confidence === undefined || feed.confidence === null
          ? 0
          : decodePrice(feed.confidence, expo),
      emaPrice:
        feed.emaPrice === undefined || feed.emaPrice === null
          ? decodePrice(feed.price, expo)
          : decodePrice(feed.emaPrice, expo),
      bestBid:
        feed.bestBidPrice === undefined || feed.bestBidPrice === null
          ? null
          : decodePrice(feed.bestBidPrice, expo),
      bestAsk:
        feed.bestAskPrice === undefined || feed.bestAskPrice === null
          ? null
          : decodePrice(feed.bestAskPrice, expo),
      publisherCount: feed.publisherCount ?? 0,
      marketSession: feed.marketSession ?? null,
      publishedAt: new Date(Math.round(publishedAtUs / 1000)).toISOString(),
    });
  }

  return out;
}

/**
 * In-flight request coalescing.
 *
 * The cache stops repeated work across the TTL window, but says nothing about
 * two requests that arrive in the same millisecond — both miss, both fetch.
 * Keying the promise means the second one waits on the first instead.
 */
const inflight = new Map<string, Promise<PythPrice[]>>();

async function loadBatch(ids: number[]): Promise<PythPrice[]> {
  const key = `pyth:price:${[...ids].sort((a, b) => a - b).join(",")}`;

  const existing = inflight.get(key);
  if (existing) return existing;

  const work = (async () => {
    const result = await cached(key, TTL.price, async () => {
      const response = await fetchBatch(ids);
      return decodeFeeds(response);
    });
    return result.value;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, work);
  return work;
}

/** Current prices for a list of feed ids, batched and deduplicated. */
export async function pricesForIds(ids: number[]): Promise<PythPrice[]> {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (unique.length === 0) return [];

  const batches: number[][] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    batches.push(unique.slice(i, i + BATCH_SIZE));
  }

  /* One failing batch must not lose the others — a watchlist of 40 assets
     should still render 20 of them if one upstream call fails. */
  const settled = await Promise.allSettled(batches.map(loadBatch));

  const prices: PythPrice[] = [];
  let firstError: unknown = null;
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") prices.push(...outcome.value);
    else firstError ??= outcome.reason;
  }

  /* Every batch failed and there is nothing to show: report it, so the caller
     can distinguish "Pyth is down" from "those feeds have no price". */
  if (prices.length === 0 && firstError) throw firstError;

  return prices;
}

/** Current prices by ticker. Unknown tickers are simply absent from the result. */
export async function pricesForSymbols(symbols: string[]): Promise<PythPrice[]> {
  const { bySymbol } = await catalogue();
  const ids: number[] = [];
  for (const symbol of symbols) {
    const asset = bySymbol.get(symbol.trim().toUpperCase());
    if (asset) ids.push(asset.id);
  }
  return pricesForIds(ids);
}

/** One price, or null when the symbol has no feed. */
export async function priceForSymbol(symbol: string): Promise<PythPrice | null> {
  const prices = await pricesForSymbols([symbol]);
  return prices[0] ?? null;
}
