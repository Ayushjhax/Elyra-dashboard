import "server-only";

import { optional, requireFor } from "@/lib/env";
import { cached } from "@/lib/market/cache";
import {
  PythError,
  type PythAsset,
  type PythAssetType,
  type RawSymbol,
} from "@/lib/market/pyth/types";
import { tradingViewSymbol } from "@/lib/market/pyth/tradingview";

/* ---------------------------------------------------------------------------
   The asset catalogue.

   Pyth publishes ~3.7k feeds. This module is the only thing that reads that
   list, normalises it into `PythAsset`, and answers "what assets exist" and
   "which feed is this symbol". Nothing downstream hardcodes an asset.

   The catalogue is ~4.7MB of JSON and changes on the order of days, so it is
   fetched once per process and held in memory behind a long TTL. It is never
   sent to the browser whole — the client searches it through
   /api/market/assets, which returns only matches.
--------------------------------------------------------------------------- */

const DEFAULT_BASE_URL = "https://pyth.dourolabs.app";

/** Catalogue changes rarely; a stale entry costs nothing but a missing asset. */
const CATALOGUE_TTL_SECONDS = 6 * 60 * 60;

/**
 * Bump when `normalise` changes.
 *
 * What is cached is the normalised `PythAsset[]`, not the upstream response,
 * so a change to parsing or filtering is invisible until the entry expires —
 * up to six hours of serving assets built by code that no longer exists.
 * The version is part of the cache key so a deploy takes effect immediately.
 */
const NORMALISER_VERSION = 3;

export function pythBaseUrl(): string {
  return (optional("PYTH_API_URL") ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

export function pythApiKey(): string {
  return requireFor("PYTH_API_KEY", "Pyth market prices");
}

/** True when Pyth is configured. Callers degrade rather than throw. */
export function pythConfigured(): boolean {
  return optional("PYTH_API_KEY") !== undefined;
}

/* ---------------------------------------------------------------------------
   Normalisation
--------------------------------------------------------------------------- */

/**
 * Asset classes this app surfaces.
 *
 * The others Pyth carries — funding rates, borrow rates, redemption rates,
 * NAVs, Kalshi event contracts — are real feeds but they are not assets with
 * a price a trader would watch, and putting them in an asset picker makes it
 * harder to find the things that are.
 */
const SURFACED: ReadonlySet<string> = new Set([
  "crypto",
  "equity",
  "fx",
  "metal",
  "commodity",
  "crypto-index",
]);

/**
 * Structured Pyth symbols look like `Class[.Region].BASE/QUOTE[.SUFFIX]`:
 *
 *   Crypto.SOL/USD          → SOL
 *   Metal.XAU/USD           → XAU
 *   Equity.US.TSLA/USD      → TSLA
 *   FX.EUR/USD              → EUR, quoted in USD
 *   Commodities.WTI/USD     → WTI
 *
 * Parsed rather than mapped, so a feed Pyth adds tomorrow needs no code here.
 */
function parseSymbol(pythSymbol: string): { base: string; quote: string } | null {
  const slash = pythSymbol.lastIndexOf("/");
  if (slash === -1) return null;

  const head = pythSymbol.slice(0, slash);
  const base = head.slice(head.lastIndexOf(".") + 1);

  /* A trailing qualifier like `.RR` or `.EXT` is part of the feed name, not
     of the quote currency. */
  const tail = pythSymbol.slice(slash + 1);
  const quote = tail.split(".")[0];

  if (base.length === 0 || quote.length === 0) return null;
  return { base, quote };
}

/**
 * `SOLANA / US DOLLAR` → `Solana`.
 *
 * Descriptions are upper-cased and suffixed with the quote currency. Title
 * casing them keeps the picker readable without a second metadata source.
 */
function parseName(description: string | null, fallback: string): string {
  if (!description) return fallback;

  let head = description.split(" / ")[0].trim();

  /* Index feeds describe themselves as `PYTH PRICE IN USD FOR GOLD 24/7`,
     which title-cases into a sentence rather than a name. Strip the trailing
     session marker first, then the prefix — one pattern doing both would
     have to choose between a lazy capture that never reaches the suffix and
     a greedy one that eats it. */
  head = head.replace(/\s+\d+\/\d+$/, "").trim();
  const wrapped = /^PYTH PRICE IN [A-Z]{3} FOR\s+(.+)$/i.exec(head);
  if (wrapped) head = wrapped[1].trim();

  if (head.length === 0) return fallback;

  return head
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      /* Keep acronyms and tickers upper-cased rather than Title Casing them
         into something that reads wrong, e.g. `ETF` → `Etf`. */
      if (word.length <= 3 && !/[aeiou]/.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * CoinMarketCap's static artwork, keyed by the `cmc_id` Pyth already carries.
 *
 * This is the only logo source wired up: it covers crypto, which is most of
 * what this terminal shows, and it needs no extra credential. Equities,
 * metals and FX have no `cmc_id`, get null here, and render the lettered
 * fallback chip — see CoinMark.
 */
function logoFor(cmcId: number | null): string | null {
  /* 0 appears in the catalogue for feeds with no CMC listing. */
  if (cmcId === null || cmcId <= 0) return null;
  return `https://s2.coinmarketcap.com/static/img/coins/64x64/${cmcId}.png`;
}

/** A feed worth showing: live, priced, and not superseded. */
function usable(raw: RawSymbol): boolean {
  if (raw.state !== "stable") return false;
  if (!SURFACED.has(raw.asset_type ?? "")) return false;
  if (raw.exponent === null) return false;
  if (!raw.symbol) return false;

  /* Pyth keeps deprecated feeds listed and stable so existing integrations
     do not break, and marks them in the description. They quote the same
     asset as a live feed, so showing both is confusing at best. */
  const description = raw.description ?? "";
  if (/DEPRECATED/i.test(description)) return false;
  if (/_DEPRECATED/i.test(raw.symbol)) return false;

  /* Dated futures — WTIV6, BRENTZ6, CCU6 — are one feed per delivery month,
     and there are dozens per commodity. They bury the continuous feeds in
     any picker, and an expiry-dated contract is not what someone adding
     "oil" to a watchlist means. The index feeds cover the same underlyings. */
  if (raw.instrument_type === "future") return false;

  /* USD-quoted only. `Crypto.SOL/ETH` parses to the same ticker as
     `Crypto.SOL/USD` but is a different number, and this terminal prices
     everything in dollars — a cross pair in the picker is a duplicate row
     that quietly means something else. */
  const quote = raw.symbol.slice(raw.symbol.lastIndexOf("/") + 1).split(".")[0];
  if (quote !== "USD") return false;

  return true;
}

function normalise(raw: RawSymbol): PythAsset | null {
  if (!usable(raw)) return null;

  const pythSymbol = raw.symbol as string;
  const parsed = parseSymbol(pythSymbol);
  if (!parsed) return null;

  const assetType = raw.asset_type as PythAssetType;
  const quoteCurrency = raw.quote_currency ?? parsed.quote;

  /* FX pairs read as the pair, not the base: EUR/USD is "EURUSD" to anyone
     looking for it, whereas a bare "EUR" is ambiguous. */
  const symbol =
    assetType === "fx" ? `${parsed.base}${parsed.quote}` : parsed.base;

  return {
    id: raw.pyth_lazer_id,
    symbol,
    name: parseName(raw.description, symbol),
    pythSymbol,
    assetType,
    quoteCurrency,
    exponent: raw.exponent as number,
    logo: logoFor(raw.cmc_id),
    tradingViewSymbol: tradingViewSymbol({
      symbol,
      base: parsed.base,
      quote: parsed.quote,
      assetType,
      pythSymbol,
    }),
  };
}

/* ---------------------------------------------------------------------------
   Fetch and index
--------------------------------------------------------------------------- */

async function fetchCatalogue(): Promise<PythAsset[]> {
  const response = await fetch(`${pythBaseUrl()}/v1/symbols`, {
    headers: { authorization: `Bearer ${pythApiKey()}` },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  }).catch((error: unknown) => {
    throw new PythError(
      "upstream",
      `Pyth catalogue unreachable: ${error instanceof Error ? error.message : "unknown"}`,
    );
  });

  if (response.status === 401 || response.status === 403) {
    throw new PythError(
      "unauthorized",
      "Pyth rejected the API key. Check PYTH_API_KEY.",
      response.status,
    );
  }
  if (!response.ok) {
    throw new PythError(
      "upstream",
      `Pyth catalogue returned ${response.status}`,
      response.status,
    );
  }

  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new PythError("malformed", "Pyth catalogue was not an array");
  }

  const assets: PythAsset[] = [];
  for (const raw of body as RawSymbol[]) {
    const asset = normalise(raw);
    if (asset) assets.push(asset);
  }

  if (assets.length === 0) {
    throw new PythError("malformed", "Pyth catalogue contained no usable feeds");
  }
  return assets;
}

/** An indexed catalogue, built once per process. */
interface Catalogue {
  assets: PythAsset[];
  byId: Map<number, PythAsset>;
  /** Upper-cased ticker → the preferred feed for it. */
  bySymbol: Map<string, PythAsset>;
}

function index(assets: PythAsset[]): Catalogue {
  const byId = new Map<number, PythAsset>();
  const bySymbol = new Map<string, PythAsset>();

  /* Crypto wins a ticker collision: `Crypto.SPX/USD` is the SPX6900 token
     while `Equity.US.SPXS/USD` is a fund, and on a Solana terminal the token
     is what "SPX" means. Ties otherwise go to the lower feed id, which is the
     older and more established listing. */
  const rank = (asset: PythAsset) => (asset.assetType === "crypto" ? 0 : 1);

  for (const asset of assets) {
    byId.set(asset.id, asset);
    const key = asset.symbol.toUpperCase();
    const existing = bySymbol.get(key);
    if (
      !existing ||
      rank(asset) < rank(existing) ||
      (rank(asset) === rank(existing) && asset.id < existing.id)
    ) {
      bySymbol.set(key, asset);
    }
  }

  return { assets, byId, bySymbol };
}

/* In-process memo. The cache below is shared across instances; this avoids
   re-parsing 4.7MB on every request within one instance. */
let memo: Promise<Catalogue> | null = null;

export async function catalogue(): Promise<Catalogue> {
  if (memo) return memo;

  memo = (async () => {
    const result = await cached(
      `pyth:catalogue:v${NORMALISER_VERSION}`,
      CATALOGUE_TTL_SECONDS,
      fetchCatalogue,
    );
    return index(result.value);
  })().catch((error: unknown) => {
    /* A failed fetch must not poison the memo — the next request should try
       again rather than serve the rejection forever. */
    memo = null;
    throw error;
  });

  return memo;
}

/* ---------------------------------------------------------------------------
   Lookups
--------------------------------------------------------------------------- */

export async function assetBySymbol(symbol: string): Promise<PythAsset | null> {
  const { bySymbol } = await catalogue();
  return bySymbol.get(symbol.trim().toUpperCase()) ?? null;
}

export async function assetById(id: number): Promise<PythAsset | null> {
  const { byId } = await catalogue();
  return byId.get(id) ?? null;
}

export async function assetsBySymbols(symbols: string[]): Promise<PythAsset[]> {
  const { bySymbol } = await catalogue();
  const out: PythAsset[] = [];
  for (const symbol of symbols) {
    const asset = bySymbol.get(symbol.trim().toUpperCase());
    if (asset) out.push(asset);
  }
  return out;
}

/** Human labels for the asset-type filter chips. */
export const ASSET_TYPE_LABEL: Record<PythAssetType, string> = {
  crypto: "Crypto",
  equity: "Equities",
  fx: "FX",
  metal: "Metals",
  commodity: "Commodities",
  "crypto-index": "Indices",
  "crypto-redemption-rate": "Redemption",
  "interest-rate": "Rates",
  "funding-rate": "Funding",
  kalshi: "Events",
  nav: "NAV",
  rates: "Rates",
};

/**
 * Ranked search across ticker, name and asset class.
 *
 * Scored rather than filtered so that typing "sol" puts SOL above SOLO and
 * every other token whose name merely contains the letters.
 */
export async function searchAssets(
  query: string,
  options: { limit?: number; assetType?: PythAssetType | null } = {},
): Promise<PythAsset[]> {
  const { assets } = await catalogue();
  const limit = options.limit ?? 50;
  const needle = query.trim().toLowerCase();
  const type = options.assetType ?? null;

  const pool = type ? assets.filter((a) => a.assetType === type) : assets;

  if (needle.length === 0) {
    /* No query: crypto first, then by feed id, which approximates listing
       order and puts the majors at the top. */
    return [...pool]
      .sort((a, b) => {
        const rank = (x: PythAsset) => (x.assetType === "crypto" ? 0 : 1);
        return rank(a) - rank(b) || a.id - b.id;
      })
      .slice(0, limit);
  }

  const scored: Array<{ asset: PythAsset; score: number }> = [];

  for (const asset of pool) {
    const symbol = asset.symbol.toLowerCase();
    const name = asset.name.toLowerCase();
    const typeLabel = ASSET_TYPE_LABEL[asset.assetType].toLowerCase();

    let score = -1;
    if (symbol === needle) score = 0;
    else if (name === needle) score = 1;
    else if (symbol.startsWith(needle)) score = 2;
    else if (name.startsWith(needle)) score = 3;
    else if (symbol.includes(needle)) score = 4;
    else if (name.includes(needle)) score = 5;
    else if (typeLabel.includes(needle)) score = 6;

    if (score >= 0) scored.push({ asset, score });
  }

  /* Ties break on ticker length before asset class: searching "tesla" should
     surface TSLA above TSLAX and TSLAON, which are tokenised wrappers whose
     names also start with "Tesla". Class only decides a genuine tie, where
     crypto wins because this is a Solana terminal. */
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.asset.symbol.length - b.asset.symbol.length ||
      (a.asset.assetType === "crypto" ? 0 : 1) - (b.asset.assetType === "crypto" ? 0 : 1) ||
      a.asset.id - b.asset.id,
  );

  return scored.slice(0, limit).map((entry) => entry.asset);
}

/** Resolve a list of feed ids to assets, preserving the requested order. */
export async function assetsByIds(ids: number[]): Promise<PythAsset[]> {
  const { byId } = await catalogue();
  const out: PythAsset[] = [];
  for (const id of ids) {
    const asset = byId.get(id);
    if (asset) out.push(asset);
  }
  return out;
}
