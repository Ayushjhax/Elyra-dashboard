import { NextResponse, type NextRequest } from "next/server";
import {
  assetsByIds,
  assetsBySymbols,
  pythConfigured,
  searchAssets,
} from "@/lib/market/pyth/catalog";
import { PythError, type PythAssetType } from "@/lib/market/pyth/types";

/* ---------------------------------------------------------------------------
   Asset discovery.

   The catalogue is ~4.7MB and lives on the server; this is how the browser
   reaches it. Two modes:

     ?q=gold&type=metal   ranked search, capped
     ?ids=6,1,2           resolve specific feeds, for rehydrating a watchlist
     ?symbols=SOL,BTC     resolve tickers, for data that predates feed ids

   Read-only, user-independent and identical for every caller, so it is not
   behind auth — but the Pyth key never leaves the server either way.
--------------------------------------------------------------------------- */

const MAX_LIMIT = 100;
const MAX_IDS = 200;

/** Catalogue entries are stable for hours; let the CDN and browser hold them. */
const CACHE_HEADER = "public, max-age=60, stale-while-revalidate=3600";

const ASSET_TYPES: ReadonlySet<string> = new Set([
  "crypto",
  "equity",
  "fx",
  "metal",
  "commodity",
  "crypto-index",
]);

function parseIds(raw: string): number[] {
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const id = Number.parseInt(part.trim(), 10);
    if (Number.isInteger(id) && id > 0) out.push(id);
    if (out.length >= MAX_IDS) break;
  }
  return out;
}

export async function GET(request: NextRequest) {
  if (!pythConfigured()) {
    return NextResponse.json(
      {
        error: "unconfigured",
        message: "PYTH_API_KEY is not set, so no assets can be listed.",
        assets: [],
      },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;

  try {
    const idsParam = params.get("ids");
    if (idsParam !== null) {
      const assets = await assetsByIds(parseIds(idsParam));
      return NextResponse.json(
        { assets },
        { headers: { "cache-control": CACHE_HEADER } },
      );
    }

    const symbolsParam = params.get("symbols");
    if (symbolsParam !== null) {
      const wanted = symbolsParam
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .slice(0, MAX_IDS);
      const assets = await assetsBySymbols(wanted);
      return NextResponse.json(
        { assets },
        { headers: { "cache-control": CACHE_HEADER } },
      );
    }

    const rawLimit = Number.parseInt(params.get("limit") ?? "", 10);
    const limit = Number.isInteger(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
      : 50;

    const rawType = params.get("type");
    const assetType =
      rawType && ASSET_TYPES.has(rawType) ? (rawType as PythAssetType) : null;

    const assets = await searchAssets(params.get("q") ?? "", { limit, assetType });

    return NextResponse.json(
      { assets },
      { headers: { "cache-control": CACHE_HEADER } },
    );
  } catch (error: unknown) {
    if (error instanceof PythError) {
      /* An unusable key is a deployment fault, not a client one. */
      const status = error.kind === "unauthorized" ? 502 : 503;
      return NextResponse.json(
        { error: error.kind, message: error.message, assets: [] },
        { status },
      );
    }
    console.error("[market/assets]", error);
    return NextResponse.json(
      { error: "internal", message: "Asset lookup failed.", assets: [] },
      { status: 500 },
    );
  }
}
