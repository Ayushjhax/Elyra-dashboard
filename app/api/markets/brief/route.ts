import { NextResponse } from "next/server";
import { pythConfigured } from "@/lib/market/pyth/catalog";
import { marketsBrief } from "@/lib/markets/server";

/* ---------------------------------------------------------------------------
   A short briefing on the world's markets, written by the model from the
   computed facts and held to their numbers (lib/arena/writer.ts) — or by the
   code when the model is unavailable. One model call per half hour, shared by
   every visitor in that window.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(): Promise<Response> {
  if (!pythConfigured()) {
    return NextResponse.json({ error: "PYTH_API_KEY is not set, so no live prices are available." }, { status: 503 });
  }
  try {
    return NextResponse.json(await marketsBrief(Date.now()), { headers: { "cache-control": "public, max-age=120, stale-while-revalidate=600" } });
  } catch {
    return NextResponse.json({ error: "The briefing could not be written right now." }, { status: 502 });
  }
}
