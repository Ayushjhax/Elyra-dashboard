import "server-only";

import { cached } from "@/lib/market/cache";
import { parseStockRegistry, type StockToken } from "@/lib/evm/derive";

/* ---------------------------------------------------------------------------
   Robinhood Stock Tokens — which contracts are the real ones.

   Robinhood publishes its registry of stock tokens and tokenized ETFs at
   api.robinhood.com/rhj/assets — the same feed its own contracts page renders
   (docs.robinhood.com/chain/contracts), and the docs' rule is that a token
   whose ticker matches but whose address does not "is not a Robinhood Stock
   Token". So this list is the allowlist: only these contracts are read, which
   keeps every stock-token balance verified by construction.

   Listings change on the order of days and the endpoint is rate-limited, so
   the parsed list is cached for an hour, shared across instances. The
   multiplier it carries is a fallback only; the live one is read on-chain.
--------------------------------------------------------------------------- */

const REGISTRY_URL = "https://api.robinhood.com/rhj/assets";
const TTL_SECONDS = 60 * 60;

/** Bump when `parseStockRegistry` changes, so a deploy is not served the old parse. */
const PARSER_VERSION = 1;

async function fetchRegistry(): Promise<StockToken[]> {
  const response = await fetch(REGISTRY_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  }).catch((error: unknown) => {
    throw new Error(
      `Robinhood's stock-token registry is unreachable: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  });
  if (!response.ok) throw new Error(`Robinhood's stock-token registry returned ${response.status}.`);

  const tokens = parseStockRegistry(await response.json());
  /* An empty list from a 200 is a changed schema, not "Robinhood lists no
     stocks" — refusing it keeps a broken parse out of the cache for an hour. */
  if (tokens.length === 0) throw new Error("Robinhood's stock-token registry listed no usable tokens.");
  return tokens;
}

export async function robinhoodStockTokens(): Promise<StockToken[]> {
  const result = await cached(`evm:robinhood:stock-tokens:v${PARSER_VERSION}`, TTL_SECONDS, fetchRegistry);
  return result.value;
}

/* ---------------------------------------------------------------------------
   Robinhood's own token price — a fallback, for the tickers Pyth has no
   equity feed for.

   Pyth is the product's price source, and a stock token is priced there
   whenever a US equity feed exists for its ticker (lib/evm/wallet.ts). A
   dozen of Robinhood's listings have none; for those, the issuer's own quote
   is the honest price rather than no price at all. `/prices/{symbol}` returns
   the share's bid and ask and the TOKEN's (`tokenBid`/`tokenAsk`, the share
   price times the corporate-action multiplier — checked against a 4:1 split
   on CRWD). The token's mid is used; the endpoint caches for 15 seconds, so
   this does too.
--------------------------------------------------------------------------- */

const PRICE_TTL_SECONDS = 15;

async function fetchTokenPrice(symbol: string): Promise<number | null> {
  const response = await fetch(`https://api.robinhood.com/rhj/prices/${encodeURIComponent(symbol)}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(6_000),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { quotes?: unknown } | null;
  const quote = Array.isArray(body?.quotes) ? (body.quotes[0] as Record<string, unknown> | undefined) : undefined;
  if (quote === undefined || String(quote.tokenSymbol ?? "").toUpperCase() !== symbol) return null;
  const bid = Number(quote.tokenBid);
  const ask = Number(quote.tokenAsk);
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0 || ask < bid) return null;
  return (bid + ask) / 2;
}

/** USD per token, by ticker, for the tickers Robinhood quotes. Absent when it does not. */
export async function robinhoodTokenPrices(symbols: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))].slice(0, 25);
  const out = new Map<string, number>();
  await Promise.all(
    unique.map(async (symbol) => {
      const price = await cached(`evm:robinhood:price:${symbol}`, PRICE_TTL_SECONDS, () => fetchTokenPrice(symbol))
        .then((result) => result.value)
        .catch(() => null);
      if (price !== null) out.set(symbol, price);
    }),
  );
  return out;
}
