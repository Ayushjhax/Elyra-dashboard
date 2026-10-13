import { NextResponse, type NextRequest } from "next/server";
import { recentFilings, type FilingsFeed } from "@/lib/smartmoney/filings";

/* ---------------------------------------------------------------------------
   GET /api/filings?ticker=NVDA

   The latest SEC filings of the crypto-exposed filers, plus `ticker` when it
   is a listed company. Public, like the market routes: EDGAR is public, the
   answer says nothing about the caller, and the SEC client underneath caches
   every company's submissions and paces itself under the SEC's rate limit,
   so a busy page does not become a busy SEC.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKER = /^[A-Z]{1,6}$/;

export async function GET(request: NextRequest): Promise<NextResponse<FilingsFeed>> {
  const raw = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase() ?? null;
  const ticker = raw !== null && TICKER.test(raw) ? raw : null;
  const feed = await recentFilings(ticker);
  return NextResponse.json(feed, {
    headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
