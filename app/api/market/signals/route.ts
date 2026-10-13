import { NextResponse, type NextRequest } from "next/server";
import { signalsFor, type MarketSignal } from "@/lib/research/signals";

/* ---------------------------------------------------------------------------
   Elyra's own market signals, for the workspace.

   GET /api/market/signals?symbols=SOL,BTC,ETH

   The same generator the Research page and the agent use
   (lib/research/signals.ts): observations backed by readings from Binance,
   Hyperliquid and Jupiter, each with its evidence and contradictions, and an
   empty list when nothing crosses a threshold. It needs no external service
   and no database, so it works whatever else is down.

   Public, because it is computed from public market data and says nothing
   about the caller — like /api/market/prices. Bounded the same way: a handful
   of symbols per request, and each symbol computed at most once a minute
   however many people are looking.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SYMBOLS = 6;
const TTL_MS = 60_000;
const SYMBOL = /^[A-Z0-9]{1,12}$/;

export interface SymbolSignals {
  symbol: string;
  signals: MarketSignal[];
  asOf: string;
  warnings: string[];
}

export interface MarketSignalsResponse {
  results: SymbolSignals[];
  generatedAt: string;
}

const cache = new Map<string, { at: number; value: Promise<SymbolSignals> }>();

function load(symbol: string): Promise<SymbolSignals> {
  const now = Date.now();
  const hit = cache.get(symbol);
  if (hit !== undefined && now - hit.at < TTL_MS) return hit.value;

  const value = signalsFor(symbol).then((result) => ({
    symbol,
    signals: result.data ?? [],
    asOf: result.asOf,
    warnings: [
      ...(result.warnings ?? []),
      ...(result.ok ? [] : [result.error?.message ?? `${symbol} could not be read.`]),
    ],
  }));
  /* A failure is not cached: the next request tries again. */
  value.catch(() => cache.delete(symbol));
  cache.set(symbol, { at: now, value });
  return value;
}

export async function GET(request: NextRequest): Promise<NextResponse<MarketSignalsResponse>> {
  const symbols = [
    ...new Set(
      (request.nextUrl.searchParams.get("symbols") ?? "SOL")
        .split(",")
        .map((symbol) => symbol.trim().toUpperCase())
        .filter((symbol) => SYMBOL.test(symbol)),
    ),
  ].slice(0, MAX_SYMBOLS);

  const settled = await Promise.allSettled(symbols.map(load));
  const results = settled.map((outcome, index) =>
    outcome.status === "fulfilled"
      ? outcome.value
      : {
          symbol: symbols[index],
          signals: [],
          asOf: new Date().toISOString(),
          warnings: [`${symbols[index]} could not be read.`],
        },
  );

  return NextResponse.json(
    { results, generatedAt: new Date().toISOString() },
    { headers: { "cache-control": "public, max-age=15, stale-while-revalidate=45" } },
  );
}
