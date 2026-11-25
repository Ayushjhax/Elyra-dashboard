import "server-only";

import {
  groupEquities,
  tickerOf,
  type EquityGroup,
  type EquityIssuer,
  type EquityToken,
} from "@/lib/equities/catalogue";
import { robinhoodStockTokens } from "@/lib/evm/stockTokens";
import { pythConfigured, usEquityAssets } from "@/lib/market/pyth/catalog";
import { pricesForIds } from "@/lib/market/pyth/client";
import { routePrices } from "@/lib/providers/router";
import { sunriseStock } from "@/lib/providers/sunrise";
import { stockListing, type StockSource } from "@/lib/sunrise/listing";
import { knownSymbols, tokenizedSecurities } from "@/lib/trade";

/* ---------------------------------------------------------------------------
   The tokenized-stocks page's read: every issuer's listing, the on-chain
   price of each Solana token, and Pyth's price for each share — assembled
   once a minute and shared, since none of it is about the person asking.

   Each source fails on its own and says so in `notes`: a page missing
   Robinhood's listing, or one with no share prices, still shows the rest.
--------------------------------------------------------------------------- */

const TTL_MS = 60_000;
const PRICE_BATCH = 50;
const TICKER_CONCURRENCY = 4;

export interface EquitiesCatalogue {
  groups: EquityGroup[];
  counts: Record<EquityIssuer, number>;
  /** Whether the Backpack Securities listing could be read for this page. */
  sunrise: boolean;
  /** Where that listing came from: Sunrise's API, or Jupiter's index without Sunrise's key. */
  stockSource: StockSource;
  notes: string[];
  asOf: string;
}

let cache: { at: number; value: EquitiesCatalogue } | null = null;
let inflight: Promise<EquitiesCatalogue> | null = null;

export async function equitiesCatalogue(): Promise<EquitiesCatalogue> {
  if (cache !== null && Date.now() - cache.at < TTL_MS) return cache.value;
  inflight ??= build()
    .then((value) => {
      cache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Runs `work` over `items` with at most `limit` at once. */
async function pooled<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        out[index] = await work(items[index]);
      }
    }),
  );
  return out;
}

async function build(): Promise<EquitiesCatalogue> {
  const notes: string[] = [];
  const tokens: EquityToken[] = tokenizedSecurities().map((asset) => ({
    issuer: asset.issuer,
    symbol: asset.symbol,
    name: asset.name,
    chain: "solana",
    address: asset.mint,
    ticker: tickerOf(asset.issuer, asset.symbol),
    priceUsd: null,
    swap: { symbol: asset.symbol },
  }));

  /* Backpack Securities' tokens: Sunrise's listing with each ticker from
     Sunrise itself, or — without Sunrise's key — the same issuer's tokens
     from Jupiter's index, whose symbol is the ticker (each of the 83 that
     have a Pyth feed was checked to name the same company, 25 November
     2026). A symbol the swap could not resolve uniquely is listed but not
     offered. */
  const listed = await stockListing();
  const stockSource = listed.source;
  const sunrise = listed.ok;
  if (!listed.ok) {
    notes.push(stockSource === "sunrise" ? "Sunrise's listing could not be read just now." : "Backpack Securities' listing could not be read from Jupiter just now.");
  } else {
    const allowlisted = new Set(knownSymbols());
    const counts = new Map<string, number>();
    for (const token of listed.data) counts.set(token.symbol.toUpperCase(), (counts.get(token.symbol.toUpperCase()) ?? 0) + 1);
    const stocks =
      stockSource === "sunrise"
        ? await pooled(listed.data, TICKER_CONCURRENCY, (token) => sunriseStock(token.address).catch(() => null))
        : listed.data.map(() => null);
    listed.data.forEach((token, index) => {
      const symbol = token.symbol.toUpperCase();
      tokens.push({
        issuer: "sunrise",
        symbol: token.symbol,
        name: token.name,
        chain: "solana",
        address: token.address,
        ticker: stocks[index]?.ticker ?? tickerOf("sunrise", token.symbol),
        priceUsd: null,
        swap: !allowlisted.has(symbol) && counts.get(symbol) === 1 ? { symbol: token.symbol } : null,
      });
    });
  }

  const robinhood = await robinhoodStockTokens().catch(() => null);
  if (robinhood === null) notes.push("Robinhood's stock-token registry could not be read just now.");
  for (const token of robinhood ?? []) {
    tokens.push({
      issuer: "robinhood",
      symbol: token.symbol,
      name: token.name,
      chain: "robinhood",
      address: token.address,
      ticker: tickerOf("robinhood", token.symbol),
      priceUsd: null,
      swap: null,
    });
  }

  /* The secondary market: each Solana token's price where it trades. */
  const mints = tokens.filter((token) => token.chain === "solana").map((token) => token.address);
  const priceOf = new Map<string, number>();
  for (let start = 0; start < mints.length; start += PRICE_BATCH) {
    const result = await routePrices(mints.slice(start, start + PRICE_BATCH)).catch(() => null);
    for (const quote of result?.data ?? []) if (quote.usdPrice > 0) priceOf.set(quote.id, quote.usdPrice);
  }
  if (mints.length > 0 && priceOf.size === 0) notes.push("On-chain prices could not be read just now.");
  for (const token of tokens) if (token.chain === "solana") token.priceUsd = priceOf.get(token.address) ?? null;

  /* The share: Pyth's regular-session US equity feed, by exact feed name. */
  const shares = new Map<string, { name?: string; priceUsd: number | null; session: string | null }>();
  if (!pythConfigured()) {
    notes.push("Share prices are not available: Pyth is not configured.");
  } else {
    try {
      const tickers = [...new Set(tokens.map((token) => token.ticker).filter((ticker): ticker is string => ticker !== null))];
      const assets = await usEquityAssets(tickers);
      const prices = await pricesForIds([...assets.values()].map((asset) => asset.id));
      const byId = new Map(prices.map((price) => [price.id, price]));
      for (const [ticker, asset] of assets) {
        const price = byId.get(asset.id);
        shares.set(ticker, {
          name: asset.name,
          priceUsd: price !== undefined && Number.isFinite(price.price) && price.price > 0 ? price.price : null,
          session: price?.marketSession ?? null,
        });
      }
    } catch {
      notes.push("Share prices could not be read from Pyth just now.");
    }
  }

  const counts: Record<EquityIssuer, number> = { sunrise: 0, backed: 0, ondo: 0, robinhood: 0 };
  for (const token of tokens) counts[token.issuer] += 1;
  return { groups: groupEquities(tokens, shares), counts, sunrise, stockSource, notes, asOf: new Date().toISOString() };
}
