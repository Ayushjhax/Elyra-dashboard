import { NextResponse, type NextRequest } from "next/server";
import { secConfigured } from "@/lib/research/sec/client";
import { latestFilings, type LatestFilings } from "@/lib/research/sec/current";
import { isCategory } from "@/lib/research/sec/forms";

/* ---------------------------------------------------------------------------
   GET /api/sec/latest?category=insiders

   What every US registrant has just filed, from EDGAR's live feed — not a
   watchlist of companies. Public: EDGAR is public and the answer says
   nothing about the caller. The SEC client paces itself under the SEC's
   rate limit and caches each feed for two minutes, so a busy page is not a
   busy SEC.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface LatestResponse extends LatestFilings {
  configured: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse<LatestResponse>> {
  if (!secConfigured()) {
    return NextResponse.json({
      filings: [],
      errors: ["SEC_USER_AGENT is not set, so EDGAR cannot be read."],
      asOf: new Date().toISOString(),
      configured: false,
    });
  }
  const raw = request.nextUrl.searchParams.get("category");
  const category = isCategory(raw) ? raw : "all";
  const feed = await latestFilings(category);
  return NextResponse.json(
    { ...feed, configured: true },
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=120" } },
  );
}
