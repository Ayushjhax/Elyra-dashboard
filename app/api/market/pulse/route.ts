import { NextResponse } from "next/server";
import { buildPulse, type MarketPulse } from "@/lib/market/pulse";
import { hyperliquidMarkets } from "@/lib/providers/hyperliquid-public";

/* ---------------------------------------------------------------------------
   GET /api/market/pulse

   Every Hyperliquid perpetual, ranked: movers, funding extremes, open
   interest and volume. One public read, cached twenty seconds upstream, so
   any number of open panels is one call to the venue.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface PulseResponse {
  pulse: MarketPulse | null;
  error: string | null;
}

export async function GET(): Promise<NextResponse<PulseResponse>> {
  const markets = await hyperliquidMarkets();
  if (!markets.ok || markets.data === undefined) {
    return NextResponse.json(
      { pulse: null, error: markets.error?.message ?? "Hyperliquid did not answer." },
      { status: 502 },
    );
  }
  return NextResponse.json(
    { pulse: buildPulse(markets.data), error: null },
    { headers: { "cache-control": "public, max-age=20, stale-while-revalidate=40" } },
  );
}
