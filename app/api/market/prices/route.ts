import { NextResponse, type NextRequest } from "next/server";
import { dayStatsForAssets, type DayStats } from "@/lib/market/pyth/change";
import { assetsByIds, pythConfigured } from "@/lib/market/pyth/catalog";
import { pricesForIds } from "@/lib/market/pyth/client";
import { PythError, type PriceRow } from "@/lib/market/pyth/types";

/* ---------------------------------------------------------------------------
   Live prices for a set of feeds.

   GET /api/market/prices?ids=6,1,2

   Pyth is the source of the price. The 24h change rides along from the
   exchange sources, because Pyth's price endpoint has no 24h window — see
   lib/market/pyth/change.ts. A feed with no change figure reports null rather
   than a number this app cannot stand behind.

   Prices are cached for ten seconds server-side and identical requests in
   flight are coalesced, so a room full of dashboards polling this route costs
   roughly one upstream request per ten seconds per distinct feed set.
--------------------------------------------------------------------------- */

const MAX_IDS = 200;

/** Matches the server-side price TTL: re-asking sooner cannot return anything new. */
const CACHE_HEADER = "public, max-age=5, stale-while-revalidate=30";

export async function GET(request: NextRequest) {
  if (!pythConfigured()) {
    return NextResponse.json(
      {
        error: "unconfigured",
        message: "PYTH_API_KEY is not set, so no live prices are available.",
        prices: [],
      },
      { status: 503 },
    );
  }

  const raw = request.nextUrl.searchParams.get("ids") ?? "";
  const ids: number[] = [];
  for (const part of raw.split(",")) {
    const id = Number.parseInt(part.trim(), 10);
    if (Number.isInteger(id) && id > 0) ids.push(id);
    if (ids.length >= MAX_IDS) break;
  }

  if (ids.length === 0) {
    return NextResponse.json({ prices: [], fetchedAt: new Date().toISOString() });
  }

  try {
    const assets = await assetsByIds(ids);

    /* The change lookup is a different upstream and must not gate the price:
       settled separately so an exchange outage costs one column, not the row. */
    const [prices, changes] = await Promise.all([
      pricesForIds(ids),
      dayStatsForAssets(assets).catch(() => new Map<number, DayStats>()),
    ]);

    const rows: PriceRow[] = prices.map((price) => ({
      id: price.id,
      symbol: price.symbol,
      price: price.price,
      change24hPct: changes.get(price.id)?.change24hPct ?? null,
      high24h: changes.get(price.id)?.high24h ?? null,
      low24h: changes.get(price.id)?.low24h ?? null,
      volume24h: changes.get(price.id)?.volume24h ?? null,
      confidence: price.confidence,
      emaPrice: price.emaPrice,
      publisherCount: price.publisherCount,
      marketSession: price.marketSession,
      publishedAt: price.publishedAt,
    }));

    return NextResponse.json(
      {
        prices: rows,
        fetchedAt: new Date().toISOString(),
        /* Named so the client can show which feeds went missing rather than
           silently rendering a shorter list. */
        unavailable: ids.filter((id) => !rows.some((row) => row.id === id)),
      },
      { headers: { "cache-control": CACHE_HEADER } },
    );
  } catch (error: unknown) {
    if (error instanceof PythError) {
      const status = error.kind === "unauthorized" ? 502 : 503;
      return NextResponse.json(
        { error: error.kind, message: error.message, prices: [] },
        { status },
      );
    }
    console.error("[market/prices]", error);
    return NextResponse.json(
      { error: "internal", message: "Price lookup failed.", prices: [] },
      { status: 500 },
    );
  }
}
