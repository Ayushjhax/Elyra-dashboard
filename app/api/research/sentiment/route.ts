import { NextResponse } from "next/server";
import { sentimentRead } from "@/lib/research/sentiment";
import type { Sentiment } from "@/lib/research/sentimentMath";

/* ---------------------------------------------------------------------------
   GET /api/research/sentiment — Fear & Greed and Hyperliquid positioning
   (lib/research/sentiment). Public, cached a minute at the edge.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<Sentiment>> {
  const read = await sentimentRead().catch((): Sentiment => ({ fearGreed: null, positioning: null, asOf: new Date().toISOString(), notes: ["Sentiment could not be read just now."] }));
  return NextResponse.json(read, { headers: { "cache-control": read.positioning !== null ? "public, s-maxage=60, stale-while-revalidate=120" : "no-store" } });
}
