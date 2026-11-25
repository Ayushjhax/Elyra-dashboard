import { NextResponse } from "next/server";
import { cronAuthorised } from "@/lib/notifications/cron";
import { runTracking } from "@/lib/portfolio/tracking";

/* ---------------------------------------------------------------------------
   GET /api/portfolio/track — records yesterday's close for the next batch of
   accounts (lib/portfolio/tracking.ts).

   Called by Supabase pg_cron (0034_portfolio_tracking.sql) every ten minutes
   from 00:00 to 05:59 UTC, never by a person: the cron secret or nothing.
   Its own route, not a step of the five-minute tick, because reading every
   account takes minutes and the tick's 300 seconds belong to trading. Once
   every account has its close, a call returns at once.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request): Promise<Response> {
  if (!cronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  try {
    const report = await runTracking();
    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Portfolio tracking failed." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
