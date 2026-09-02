import "server-only";

import { UpstreamError, fetchJson } from "@/lib/market/http";
import type { PythAsset } from "@/lib/market/pyth/types";

/* ---------------------------------------------------------------------------
   24h change for what the crypto exchanges do not list.

   Pyth publishes a price, a confidence interval and an EMA — no 24h window —
   and the historical channel this key can reach returns nothing, so the
   change figure has to come from somewhere else. The crypto exchanges cover
   crypto; equities, metals, FX and commodities come from here.

   For a stock, "24h change" conventionally means change against the previous
   close, which is what this returns — the same number the exchange quotes and
   the same one every other terminal shows.
--------------------------------------------------------------------------- */

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

/** Metals trade as COMEX futures rather than under their metal code. */
const METAL_SYMBOL: Record<string, string> = {
  XAU: "GC=F",
  XAG: "SI=F",
  XPT: "PL=F",
  XPD: "PA=F",
  XCU: "HG=F",
  GOLD: "GC=F",
  SILVER: "SI=F",
};

/** The commodity feeds worth charting, by their continuous contract. */
const COMMODITY_SYMBOL: Record<string, string> = {
  WTI: "CL=F",
  USOILSPOT: "CL=F",
  PYTHOIL: "CL=F",
  BRENT: "BZ=F",
  UKOILSPOT: "BZ=F",
  NATGAS: "NG=F",
};

/** Region prefix out of `Equity.US.TSLA/USD`. */
function region(pythSymbol: string): string | null {
  const parts = pythSymbol.split(".");
  return parts.length >= 3 ? parts[1] : null;
}

/**
 * The Yahoo symbol for a Pyth feed, or null where none is dependable.
 *
 * Crypto is deliberately absent: the exchange sources already answer for it
 * with a true rolling 24h window, and mixing a previous-close figure into the
 * same column would make two rows mean different things.
 */
export function yahooSymbol(asset: PythAsset): string | null {
  const base = asset.symbol.toUpperCase();

  switch (asset.assetType) {
    case "equity":
      /* Only US listings resolve from a bare ticker; elsewhere the same
         ticker is a different company. */
      return region(asset.pythSymbol) === "US" ? base : null;

    case "metal":
      return METAL_SYMBOL[base] ?? null;

    case "commodity":
      return COMMODITY_SYMBOL[base] ?? null;

    case "fx": {
      /* `EURUSD` → `EURUSD=X`. The catalogue's FX tickers are already the
         concatenated pair. */
      if (!/^[A-Z]{6}$/.test(base)) return null;
      return `${base}=X`;
    }

    default:
      return null;
  }
}

interface ChartMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
}

interface ChartResponse {
  chart?: {
    result?: Array<{ meta?: ChartMeta }>;
    error?: unknown;
  };
}

/**
 * Percent change against the previous close, or null.
 *
 * One symbol per request: Yahoo's chart endpoint takes a single symbol, so
 * callers batch by issuing these concurrently and the result is cached.
 */
export async function changeFor(symbol: string): Promise<number | null> {
  let body: ChartResponse;
  try {
    body = await fetchJson<ChartResponse>({
      source: "yahoo",
      url: `${BASE}/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
      /* Yahoo answers a bare programmatic client with a consent redirect. */
      headers: { "user-agent": "Mozilla/5.0 (compatible; Elyra/1.0)" },
      timeoutMs: 6_000,
    });
  } catch (error: unknown) {
    if (error instanceof UpstreamError) return null;
    throw error;
  }

  const meta = body.chart?.result?.[0]?.meta;
  if (!meta) return null;

  const price = meta.regularMarketPrice;
  const previous = meta.chartPreviousClose ?? meta.previousClose;

  if (
    typeof price !== "number" ||
    typeof previous !== "number" ||
    !Number.isFinite(price) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }

  return (price / previous - 1) * 100;
}
