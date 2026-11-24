import "server-only";

import { parseCoinMarkets, pickCoinId, type CoinMarket } from "@/lib/analysis/parse";
import { cached } from "@/lib/market/cache";

/* ---------------------------------------------------------------------------
   CoinGecko — market cap, FDV, supply and rank for any coin, which Pyth (a
   price feed) does not carry. The public API answers without a key at a
   low rate limit; `COINGECKO_API_KEY` (a demo key) raises it and is sent
   as its header, never in a URL. Every answer is cached in the shared
   market cache, so a busy page does not spend the limit.

   Its price is not Elyra's price of record — Pyth is — and the analysis
   says which figure came from where.
--------------------------------------------------------------------------- */

const BASE = "https://api.coingecko.com/api/v3";
const SEARCH_TTL_SECONDS = 24 * 60 * 60;
const MARKETS_TTL_SECONDS = 120;

function headers(): Record<string, string> {
  const key = (process.env.COINGECKO_API_KEY ?? "").trim();
  return { accept: "application/json", ...(key.length > 0 ? { "x-cg-demo-api-key": key } : {}) };
}

async function get(path: string): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`, { headers: headers(), signal: AbortSignal.timeout(8_000), cache: "no-store" });
  if (response.status === 429) throw new Error("CoinGecko's rate limit was reached; try again in a minute.");
  if (!response.ok) throw new Error(`CoinGecko answered ${response.status}.`);
  return response.json();
}

/** The coin a symbol means — the best-ranked coin with exactly that symbol — or null. */
export async function coingeckoIdFor(symbol: string): Promise<{ id: string; name: string; rank: number | null } | null> {
  const key = symbol.trim().toUpperCase();
  const result = await cached(`cg:search:${key}`, SEARCH_TTL_SECONDS, async () => pickCoinId(await get(`/search?query=${encodeURIComponent(key)}`), key));
  return result.value;
}

/** Market data for coins by CoinGecko id, in the order asked. */
export async function coingeckoMarkets(ids: readonly string[]): Promise<CoinMarket[]> {
  const unique = [...new Set(ids)].slice(0, 25);
  if (unique.length === 0) return [];
  const result = await cached(`cg:markets:${unique.join(",")}`, MARKETS_TTL_SECONDS, async () =>
    parseCoinMarkets(await get(`/coins/markets?vs_currency=usd&ids=${unique.map(encodeURIComponent).join(",")}&price_change_percentage=24h,7d`)),
  );
  const byId = new Map(result.value.map((coin) => [coin.id, coin]));
  return unique.map((id) => byId.get(id)).filter((coin): coin is CoinMarket => coin !== undefined);
}
