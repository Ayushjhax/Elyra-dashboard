import "server-only";

import { TTL, cached } from "@/lib/market/cache";
import { catalogue, pythApiKey } from "@/lib/market/pyth/catalog";
import { standInPrices, type StandInFeed } from "@/lib/market/pyth/standIn";
import {
  PythError,
  decodePrice,
  type PythPrice,
  type RawLatestPriceResponse,
} from "@/lib/market/pyth/types";

/* ---------------------------------------------------------------------------
   Batched price reads.

   `POST /v1/latest_price` on Pyth Pro's price host takes a list of feed ids
   and answers for all of them in one round trip, so the unit of work here is
   a list of feeds, never a single one. Every caller goes through
   `pricesForIds`, and concurrent callers asking for the same feeds within the
   cache window share one upstream request — see `inflight` below.

   Until November 2026 this was `GET /v1/latest_price?price_feed_ids=…` on the
   catalogue's host (`pythBaseUrl`). That now answers every client with a
   Cloudflare block page, while the catalogue (`/v1/symbols`) and history
   stay there; the price read moved to `PRICE_URL`, asked for the same
   fields, its answer wrapped in `parsed`.

   A feed the key's plan does not cover — equities and equity indices on the
   current plan — is priced from Yahoo's quote instead, marked
   `source: "yahoo"` (lib/market/pyth/standIn.ts). Pyth answers in well
   under a second but now and then takes several, so a call that times out
   is asked once more on a fresh connection before the feed goes blank.
--------------------------------------------------------------------------- */

/** Feeds per upstream request. */
const BATCH_SIZE = 100;

/** Per attempt; a timed-out or unreachable call is tried twice in all. */
const REQUEST_TIMEOUT_MS = 5_000;
const ATTEMPTS = 2;

export const PRICE_URL = "https://pyth-lazer.dourolabs.app/v1/latest_price";

/** Every field `decodeWith` reads, and the channel a Pyth Pro key is granted. */
export function latestPriceBody(ids: number[]) {
  return {
    priceFeedIds: ids,
    properties: ["price", "bestBidPrice", "bestAskPrice", "publisherCount", "exponent", "confidence", "feedUpdateTimestamp", "marketSession", "emaPrice"],
    chains: [],
    channel: "fixed_rate@200ms",
    parsed: true,
  };
}

/** The refusal's own words, when Pyth gives any: "Not entitled: feed 1 (…)" says the plan, not the key, is short. */
async function refusalReason(response: Response): Promise<string | null> {
  const text = await response.text().catch(() => "");
  if (text.trimStart().startsWith("<")) return null;
  const reason = text.replace(/\s+/g, " ").trim().slice(0, 160);
  return reason.length > 0 ? reason : null;
}

async function fetchBatch(ids: number[]): Promise<RawLatestPriceResponse> {
  let response: Response | null = null;
  let failure: PythError | null = null;
  for (let attempt = 0; attempt < ATTEMPTS && response === null; attempt += 1) {
    try {
      response = await fetch(PRICE_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${pythApiKey()}`, "content-type": "application/json" },
        body: JSON.stringify(latestPriceBody(ids)),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error: unknown) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      failure = new PythError(
        "upstream",
        timedOut
          ? `Pyth did not respond within ${REQUEST_TIMEOUT_MS}ms, twice`
          : `Pyth unreachable: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
  if (response === null) throw failure ?? new PythError("upstream", "Pyth unreachable");

  if (response.status === 401 || response.status === 403) {
    const reason = await refusalReason(response);
    throw new PythError(
      "unauthorized",
      reason !== null && /not entitled/i.test(reason)
        ? `Pyth's plan for PYTH_API_KEY does not cover these feeds (${reason}).`
        : "Pyth rejected the API key. Check PYTH_API_KEY.",
      response.status,
    );
  }
  if (!response.ok) {
    throw new PythError("upstream", `Pyth returned ${response.status}`, response.status);
  }

  return unwrapLatest(await response.json().catch(() => null));
}

/** The `parsed` answer of `POST /v1/latest_price`, as the decoder reads it. */
export function unwrapLatest(body: unknown): RawLatestPriceResponse {
  const parsed = (body as { parsed?: RawLatestPriceResponse } | null)?.parsed;
  if (!parsed || !Array.isArray(parsed.priceFeeds)) {
    throw new PythError("malformed", "Pyth response had no priceFeeds array");
  }
  return parsed;
}

/** Decode one raw feed, resolving its ticker through the catalogue. */
async function decodeFeeds(
  response: RawLatestPriceResponse,
): Promise<PythPrice[]> {
  const { byId } = await catalogue();
  return decodeWith(response, (id) => byId.get(id)?.symbol);
}

/** Decode raw feeds, labelling each through `label`; a feed it cannot label is dropped. */
function decodeWith(
  response: RawLatestPriceResponse,
  label: (id: number) => string | undefined,
): PythPrice[] {
  const out: PythPrice[] = [];

  for (const feed of response.priceFeeds) {
    const symbol = label(feed.priceFeedId);
    /* A feed with no catalogue entry cannot be labelled, so it is dropped
       rather than surfaced as an unnamed row. */
    if (symbol === undefined) continue;

    const expo = feed.exponent;
    const publishedAtUs = feed.feedUpdateTimestamp ?? Number(response.timestampUs);

    out.push({
      id: feed.priceFeedId,
      symbol,
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

/* ---------------------------------------------------------------------------
   A key's plan.

   A Pyth Pro key is granted feeds by asset class and market, and Pyth refuses
   a whole request when any one feed in it is not granted ("Not entitled:
   feed 922 …"). So feeds are batched by the grant they fall under — the
   asset class, and for equities the market (`Equity.US`, `Equity.HK`,
   `Equity.Index`) — and a refused group cannot blank the others.

   Inside a batch, the refusal names one feed. That feed — and only that
   feed — is remembered as refused and dropped, and the rest is asked again,
   until the batch answers. A plan can refuse single feeds inside a class it
   otherwise covers (this one refuses JUP among its crypto), so a second
   refusal names a second feed; it never means the whole batch is refused.
   (It used to: two refused coins in one watchlist blanked SOL, BTC and ETH
   for fifteen minutes at a time.)
--------------------------------------------------------------------------- */

const NOT_ENTITLED_MS = 15 * 60_000;
/** Refusals one read will learn from before it stops; the next read carries on from what was learned. */
const MAX_REFUSALS = 12;
const notEntitled = new Map<number, number>();

/** The feed a refusal names, from "Not entitled: feed 922 (…)". */
export function refusedFeed(error: unknown): number | null {
  if (!(error instanceof PythError) || error.kind !== "unauthorized") return null;
  const match = /not entitled: feed (\d+)/i.exec(error.message);
  return match === null ? null : Number(match[1]);
}

/** The grant a feed falls under: its asset class, and for equities its market. */
export function grantGroup(asset: { assetType: string; pythSymbol: string } | undefined): string {
  if (asset === undefined) return "unknown";
  return asset.assetType === "equity" ? asset.pythSymbol.split(".").slice(0, 2).join(".") : asset.assetType;
}

/** The grant a feed falls under, from its Pyth symbol alone: "Equity.HK.0700/HKD" → "Equity.HK", "FX.USD/JPY" → "fx". */
export function grantGroupOfSymbol(pythSymbol: string): string {
  const parts = pythSymbol.split(".");
  return parts[0] === "Equity" ? parts.slice(0, 2).join(".") : (parts[0] ?? "unknown").toLowerCase();
}

/** One batch: each feed the refusal names is remembered and dropped, and the rest asked again, until it answers. */
async function loadGranted(ids: number[], load: (ids: number[]) => Promise<PythPrice[]> = loadBatch): Promise<PythPrice[]> {
  let batch = ids;
  for (let refusals = 0; refusals < MAX_REFUSALS; refusals += 1) {
    try {
      return await load(batch);
    } catch (error) {
      const named = refusedFeed(error);
      if (named === null) throw error;
      /* Remember exactly the feed Pyth named; a refusal naming a feed outside the batch says nothing about this one. */
      const refused = batch.includes(named) ? named : batch.length === 1 ? batch[0] : null;
      if (refused === null) throw error;
      notEntitled.set(refused, Date.now() + NOT_ENTITLED_MS);
      batch = batch.filter((id) => id !== refused);
      if (batch.length === 0) return [];
    }
  }
  throw new PythError("upstream", `Pyth refused more than ${MAX_REFUSALS} feeds in one request; the rest are asked again on the next read.`);
}

const refusedNow = (id: number, now = Date.now()) => (notEntitled.get(id) ?? 0) > now;

/**
 * Pyth's answers, then a stand-in for every feed its plan refused. The error
 * of a batch the stand-in covered is not reported: those feeds have a price.
 */
async function withStandIns(unique: number[], settled: PromiseSettledResult<PythPrice[]>[], feedOf: (id: number) => StandInFeed | undefined): Promise<PythPrice[]> {
  const prices: PythPrice[] = [];
  let firstError: unknown = null;
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") prices.push(...outcome.value);
    else if (refusedFeed(outcome.reason) === null) firstError ??= outcome.reason;
  }
  const answered = new Set(prices.map((price) => price.id));
  const refused = unique.filter((id) => !answered.has(id) && refusedNow(id));
  if (refused.length > 0) {
    const feeds = refused.map(feedOf).filter((feed): feed is StandInFeed => feed !== undefined);
    prices.push(...(await standInPrices(feeds).catch((): PythPrice[] => [])));
  }
  /* Nothing to show: report it, so the caller can tell "Pyth is down" from "those feeds have no price". */
  if (prices.length === 0) {
    if (firstError) throw firstError;
    if (refused.length > 0) throw new PythError("unauthorized", "Pyth's plan for PYTH_API_KEY does not cover these feeds, and Yahoo has no price for them.", 403);
  }
  return prices;
}

/** Current prices for a list of feed ids, batched and deduplicated. */
export async function pricesForIds(ids: number[]): Promise<PythPrice[]> {
  const now = Date.now();
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (unique.length === 0) return [];
  const asked = unique.filter((id) => !refusedNow(id, now));

  const { byId } = await catalogue();
  const groups = new Map<string, number[]>();
  for (const id of asked) {
    const group = grantGroup(byId.get(id));
    groups.set(group, [...(groups.get(group) ?? []), id]);
  }
  const batches: number[][] = [];
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += BATCH_SIZE) batches.push(group.slice(i, i + BATCH_SIZE));
  }

  /* One failing batch must not lose the others — a watchlist of 40 assets
     should still render 20 of them if one upstream call fails. */
  const settled = await Promise.allSettled(batches.map((batch) => loadGranted(batch)));

  return withStandIns(unique, settled, (id) => {
    const asset = byId.get(id);
    return asset === undefined ? undefined : { id, symbol: asset.symbol, pythSymbol: asset.pythSymbol };
  });
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

/**
 * Prices for feeds outside the USD catalogue — the world equities and FX
 * crosses the markets page shows in their own currency (lib/markets). The
 * caller labels each feed, since the catalogue does not hold them. Batched
 * and cached like `pricesForIds`, under its own keys.
 */
export async function pricesForLabelledIds(labels: ReadonlyMap<number, string>): Promise<PythPrice[]> {
  const now = Date.now();
  const ids = [...labels.keys()].filter((id) => Number.isInteger(id) && id > 0).sort((a, b) => a - b);
  /* Batched by grant, like `pricesForIds`, so a refused market cannot blank the others. */
  const groups = new Map<string, number[]>();
  for (const id of ids.filter((id) => !refusedNow(id, now))) {
    const group = grantGroupOfSymbol(labels.get(id) ?? "");
    groups.set(group, [...(groups.get(group) ?? []), id]);
  }
  const batches: number[][] = [];
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += BATCH_SIZE) batches.push(group.slice(i, i + BATCH_SIZE));
  }
  const load = async (batch: number[]) => {
    const result = await cached(`pyth:price:labelled:${batch.join(",")}`, TTL.price, async () => {
      const response = await fetchBatch(batch);
      return decodeWith(response, (id) => labels.get(id));
    });
    return result.value;
  };

  const settled = await Promise.allSettled(batches.map((batch) => loadGranted(batch, load)));
  return withStandIns(ids, settled, (id) => {
    const pythSymbol = labels.get(id);
    return pythSymbol === undefined ? undefined : { id, symbol: pythSymbol, pythSymbol };
  });
}
