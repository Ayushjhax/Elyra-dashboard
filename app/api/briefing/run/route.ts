import { NextResponse } from "next/server";
import { runBriefing } from "@/lib/briefing/run";
import { cronAuthorised } from "@/lib/notifications/cron";

/* ---------------------------------------------------------------------------
   GET /api/briefing/run — writes the day's Daily Briefing.

   Called by Supabase pg_cron (0027_daily_briefing.sql) four times in the
   first hour after 00:00 UTC, never by a person: the cron secret or nothing.
   Its own route, not a step of the five-minute tick, because the editor and
   the translator can take minutes between them and the tick's 300s belong to
   trading. Once the day is published every later call returns at once.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: Request): Promise<Response> {
  if (!cronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  try {
    const report = await runBriefing();
    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The briefing run failed." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
