import "server-only";

import { UpstreamError } from "@/lib/market/http";
import { binance } from "@/lib/market/sources/binance";
import { hyperliquid } from "@/lib/market/sources/hyperliquid";
import { okxSource } from "@/lib/market/sources/okx";
import {
  UnsupportedCapability,
  type FundingSnapshot,
  type MarketSnapshot,
  type MarketSource,
  type OpenInterestSnapshot,
  type Candle,
} from "@/lib/market/types";
import type { Interval } from "@/lib/types";

/* ---------------------------------------------------------------------------
   Which source answers for which symbol.

   Order is preference, not exclusivity: the router walks the list and takes
   the first source that returns data. A source that says it does not list the
   symbol, or fails in a way another source could survive, is skipped.

   A 4xx that is not a rate limit stops the walk. That means the request was
   malformed or the instrument does not exist, and asking a second exchange
   the same wrong question wastes a round trip to get the same answer.
--------------------------------------------------------------------------- */

/** Symbols with a preferred source that is not the default order. */
const PREFERRED: Record<string, MarketSource[]> = {
  /* Binance does not list HYPE, and Hyperliquid is its home venue. */
  HYPE: [hyperliquid, okxSource],
};

/** Binance first for the majors, OKX behind it for the IP-block case. */
const DEFAULT_ORDER: MarketSource[] = [binance, okxSource, hyperliquid];

function sourcesFor(symbol: string): MarketSource[] {
  const preferred = PREFERRED[symbol.toUpperCase()];
  const order = preferred ?? DEFAULT_ORDER;
  return order.filter((source) => source.supports(symbol));
}

/** Every source refused or failed. Carries what each one said. */
export class NoSourceError extends Error {
  readonly attempts: Array<{ source: string; reason: string }>;

  constructor(symbol: string, attempts: Array<{ source: string; reason: string }>) {
    const detail = attempts
      .map((attempt) => `${attempt.source}: ${attempt.reason}`)
      .join("; ");
    super(`No source could serve ${symbol}${detail ? ` (${detail})` : ""}`);
    this.name = "NoSourceError";
    this.attempts = attempts;
  }
}

/** True when trying the next source could plausibly succeed. */
function worthFallingThrough(error: unknown): boolean {
  if (error instanceof UnsupportedCapability) return true;
  if (error instanceof UpstreamError) return error.retryable;
  /* A parse failure or a bug in one adapter should not be fatal when another
     adapter can answer the same question. */
  return true;
}

async function attempt<T>(
  symbol: string,
  run: (source: MarketSource) => Promise<T>,
  accept: (value: T) => boolean,
): Promise<T> {
  const attempts: Array<{ source: string; reason: string }> = [];

  for (const source of sourcesFor(symbol)) {
    try {
      const value = await run(source);
      if (accept(value)) return value;
      attempts.push({ source: source.id, reason: "no data for symbol" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      attempts.push({ source: source.id, reason });
      if (!worthFallingThrough(error)) break;
    }
  }

  throw new NoSourceError(symbol, attempts);
}

/**
 * Snapshots for a list of symbols.
 *
 * Symbols are grouped by their source order so that everything Binance can
 * serve goes in one batched request, rather than one request per symbol.
 * Anything the first source misses is retried individually against the rest.
 */
export async function snapshots(symbols: string[]): Promise<MarketSnapshot[]> {
  const unique = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  if (unique.length === 0) return [];

  const groups = new Map<string, { source: MarketSource; symbols: string[] }>();
  for (const symbol of unique) {
    const [first] = sourcesFor(symbol);
    if (!first) continue;
    const group = groups.get(first.id);
    if (group) group.symbols.push(symbol);
    else groups.set(first.id, { source: first, symbols: [symbol] });
  }

  const found = new Map<string, MarketSnapshot>();

  await Promise.all(
    [...groups.values()].map(async ({ source, symbols: batch }) => {
      try {
        for (const row of await source.snapshot(batch)) {
          found.set(row.symbol, row);
        }
      } catch {
        /* The batch failed as a unit. Each symbol in it gets an individual
           retry below, which will reach the remaining sources. */
      }
    }),
  );

  const missing = unique.filter((symbol) => !found.has(symbol));
  await Promise.all(
    missing.map(async (symbol) => {
      try {
        const row = await attempt(
          symbol,
          (source) => source.snapshot([symbol]),
          (rows) => rows.length > 0,
        );
        if (row[0]) found.set(symbol, row[0]);
      } catch {
        /* Genuinely unavailable. It is omitted from the result, and the tool
           layer reports which symbols it could not price. */
      }
    }),
  );

  return unique.flatMap((symbol) => {
    const row = found.get(symbol);
    return row ? [row] : [];
  });
}

export function candles(
  symbol: string,
  interval: Interval,
  limit: number,
): Promise<Candle[]> {
  return attempt(
    symbol,
    (source) => source.candles(symbol, interval, limit),
    (rows) => rows.length > 0,
  );
}

export function funding(
  symbol: string,
  lookbackHours: number,
): Promise<FundingSnapshot> {
  return attempt(
    symbol,
    (source) => source.funding(symbol, lookbackHours),
    () => true,
  );
}

export function openInterest(
  symbol: string,
  lookbackHours: number,
): Promise<OpenInterestSnapshot> {
  return attempt(
    symbol,
    (source) => source.openInterest(symbol, lookbackHours),
    (value) => value.current > 0,
  );
}
