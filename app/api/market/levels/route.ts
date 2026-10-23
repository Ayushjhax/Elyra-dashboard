import { NextResponse, type NextRequest } from "next/server";
import { pivotLevels, type LevelsResponse } from "@/lib/market/levels";
import * as router from "@/lib/market/router";

/* ---------------------------------------------------------------------------
   GET /api/market/levels?symbol=SOL

   Classic pivots from the last completed daily candle on the exchange
   sources (Binance, OKX, Hyperliquid — whichever answers). Public, like the
   other market routes, and computed at most once per symbol every fifteen
   minutes: a daily candle only changes at the day boundary.

   Crypto only — the exchange sources list nothing else — so a stock or FX
   symbol answers with `levels: null` and the reason, never invented levels.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 15 * 60_000;
const SYMBOL = /^[A-Z0-9]{1,12}$/;

/* The response type is shared with the website and the app. */
export type { LevelsResponse } from "@/lib/market/levels";

const cache = new Map<string, { at: number; value: Promise<LevelsResponse> }>();

async function compute(symbol: string): Promise<LevelsResponse> {
  try {
    const daily = await router.candles(symbol, "1D", 3);
    const levels = pivotLevels(daily);
    return {
      symbol,
      levels,
      source: "Pivots from the prior day's exchange candle",
      error: levels === null ? "No completed daily candle to compute from." : null,
    };
  } catch (error: unknown) {
    return {
      symbol,
      levels: null,
      source: "",
      error: error instanceof Error ? error.message : `No exchange lists ${symbol}.`,
    };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<LevelsResponse>> {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  if (!SYMBOL.test(symbol)) {
    return NextResponse.json(
      { symbol, levels: null, source: "", error: "Pass ?symbol= as a ticker." },
      { status: 400 },
    );
  }

  const hit = cache.get(symbol);
  let value: Promise<LevelsResponse>;
  if (hit !== undefined && Date.now() - hit.at < TTL_MS) {
    value = hit.value;
  } else {
    value = compute(symbol);
    cache.set(symbol, { at: Date.now(), value });
    /* A failure is not cached: the next request tries again. */
    void value.then((result) => {
      if (result.levels === null) cache.delete(symbol);
    });
  }

  return NextResponse.json(await value, {
    headers: { "cache-control": "public, max-age=300, stale-while-revalidate=900" },
  });
}
