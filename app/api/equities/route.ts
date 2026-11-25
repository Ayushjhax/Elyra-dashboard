import { NextResponse } from "next/server";
import { equitiesCatalogue } from "@/lib/equities/server";

/* ---------------------------------------------------------------------------
   Every tokenized stock and ETF, grouped by share (lib/equities/). Public:
   listings and prices, nothing about the person asking.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const catalogue = await equitiesCatalogue();
  return NextResponse.json(catalogue, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" } });
}
