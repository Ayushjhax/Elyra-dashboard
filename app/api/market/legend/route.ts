import { NextResponse, type NextRequest } from "next/server";
import { EMA_PERIOD, chartFacts, type LegendResponse } from "@/lib/market/chartFacts";
import { INTERVALS } from "@/lib/market/chartWidget";
import * as router from "@/lib/market/router";
import type { Interval } from "@/lib/types";

/* ---------------------------------------------------------------------------
   GET /api/market/legend?symbol=SOL&interval=1H

   The chart legend's figures for one market at the chart's interval: the last
   completed candle's close and the EMA 20 of the completed closes, from the
   exchange sources (Binance, OKX, Hyperliquid — whichever answers), with the
   source named. The decision brief reads the same figures, so the two agree.

   Public, like the other market routes. Crypto only — the exchange sources
   list nothing else — so any other symbol answers with nulls and the reason,
   never invented figures. Computed at most once per symbol and interval
   every thirty seconds.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 30_000;
const SYMBOL = /^[A-Z0-9]{1,12}$/;
/* Enough history that the EMA's seed has washed out to well under a
   hundredth of a cent, plus the candle still forming. */
const LIMIT = 200;

const cache = new Map<string, { at: number; value: Promise<LegendResponse> }>();

async function compute(symbol: string, interval: Interval): Promise<LegendResponse> {
  try {
    const { candles, source } = await router.candlesWithSource(symbol, interval, LIMIT);
    const facts = chartFacts(candles, interval, Date.now());
    return {
      symbol,
      interval,
      period: EMA_PERIOD,
      ...facts,
      source,
      error: facts.close === null ? "No completed candle to read." : null,
    };
  } catch (error: unknown) {
    return {
      symbol,
      interval,
      period: EMA_PERIOD,
      close: null,
      ema: null,
      source: null,
      error: error instanceof Error ? error.message : `No exchange lists ${symbol}.`,
    };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<LegendResponse>> {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  const interval = (request.nextUrl.searchParams.get("interval") ?? "") as Interval;
  if (!SYMBOL.test(symbol) || !INTERVALS.includes(interval)) {
    return NextResponse.json(
      {
        symbol,
        interval,
        period: EMA_PERIOD,
        close: null,
        ema: null,
        source: null,
        error: "Pass ?symbol= as a ticker and ?interval= as one of the chart's intervals.",
      },
      { status: 400 },
    );
  }

  const key = `${symbol}:${interval}`;
  const hit = cache.get(key);
  let value: Promise<LegendResponse>;
  if (hit !== undefined && Date.now() - hit.at < TTL_MS) {
    value = hit.value;
  } else {
    value = compute(symbol, interval);
    cache.set(key, { at: Date.now(), value });
    /* A failure is not cached: the next request tries again. */
    void value.then((result) => {
      if (result.close === null) cache.delete(key);
    });
  }

  return NextResponse.json(await value, {
    headers: { "cache-control": "public, max-age=15, stale-while-revalidate=30" },
  });
}
