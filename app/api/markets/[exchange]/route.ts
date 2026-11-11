import { NextResponse } from "next/server";
import { pythConfigured } from "@/lib/market/pyth/catalog";
import { MarketsError, exchangeListings } from "@/lib/markets/server";

/* One market's live listings, its companies listed in New York, its movers and breadth. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ exchange: string }>;
}

export async function GET(_request: Request, context: Context): Promise<Response> {
  if (!pythConfigured()) {
    return NextResponse.json({ error: "PYTH_API_KEY is not set, so no live prices are available." }, { status: 503 });
  }
  const { exchange } = await context.params;
  try {
    return NextResponse.json(await exchangeListings(exchange, Date.now()), {
      headers: { "cache-control": "public, max-age=15, stale-while-revalidate=60" },
    });
  } catch (error) {
    if (error instanceof MarketsError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "That market could not be read right now." }, { status: 502 });
  }
}
