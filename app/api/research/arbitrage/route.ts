import { NextResponse } from "next/server";
import { arbitrageScan, type ArbitrageScan } from "@/lib/research/arbitrage";

/* ---------------------------------------------------------------------------
   GET /api/research/arbitrage — the venue-gap scan (lib/research/arbitrage).
   Public market data, the same for everyone, cached a minute at the edge.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<ArbitrageScan>> {
  const scan = await arbitrageScan().catch((): ArbitrageScan => ({ rows: [], asOf: new Date().toISOString(), notes: ["The scan could not be run just now."] }));
  return NextResponse.json(scan, { headers: { "cache-control": scan.rows.length > 0 ? "public, s-maxage=60, stale-while-revalidate=120" : "no-store" } });
}
