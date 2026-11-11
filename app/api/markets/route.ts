import { NextResponse } from "next/server";
import { pythConfigured } from "@/lib/market/pyth/catalog";
import { marketsOverview } from "@/lib/markets/server";

/* ---------------------------------------------------------------------------
   The world's stock markets right now: every exchange's session (from Pyth's
   published hours), its benchmarks, region funds, global funds and the FX
   crosses. Public market data — no account is read.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = "public, max-age=15, stale-while-revalidate=60";

export async function GET(): Promise<Response> {
  if (!pythConfigured()) {
    return NextResponse.json({ error: "PYTH_API_KEY is not set, so no live prices are available." }, { status: 503 });
  }
  try {
    return NextResponse.json(await marketsOverview(Date.now()), { headers: { "cache-control": CACHE } });
  } catch {
    return NextResponse.json({ error: "The world markets could not be read right now." }, { status: 502 });
  }
}
