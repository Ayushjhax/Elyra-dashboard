import { NextResponse } from "next/server";
import { readBriefing } from "@/lib/briefing/server";
import type { BriefingResponse } from "@/lib/briefing/types";

/* ---------------------------------------------------------------------------
   GET /api/briefing?day=YYYY-MM-DD

   The Daily Briefing for that day, or the latest, and the days there are.
   Public — it is the same for everyone — and cached five minutes at the edge.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse<BriefingResponse>> {
  const day = new URL(request.url).searchParams.get("day");
  try {
    const response = await readBriefing(day);
    return NextResponse.json(response, {
      status: response.error === null ? 200 : 503,
      headers: { "cache-control": response.error === null ? "public, s-maxage=300, stale-while-revalidate=600" : "no-store" },
    });
  } catch {
    return NextResponse.json(
      { briefing: null, days: [], nextAt: null, error: "The Daily Briefing could not be read." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
