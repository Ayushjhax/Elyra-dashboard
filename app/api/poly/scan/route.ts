import { NextResponse } from "next/server";
import { polyScan } from "@/lib/poly/scan";
import { POLY_CATEGORIES, type PolyCategory } from "@/lib/poly/types";

/* ---------------------------------------------------------------------------
   Poly scan (lib/poly/scan.ts): what Polymarket's most profitable wallets
   hold, the day's movers and one-winner books that do not sum to $1.
   Public data for anyone; shared reads behind it.

     GET ?category=overall|politics|crypto|sports
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const asked = new URL(request.url).searchParams.get("category");
  const category = POLY_CATEGORIES.includes(asked as PolyCategory) ? (asked as PolyCategory) : "overall";
  return NextResponse.json(await polyScan(category), { headers: { "cache-control": "no-store" } });
}
