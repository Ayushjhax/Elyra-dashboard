import { NextResponse } from "next/server";
import { smartMoneyBoard } from "@/lib/scout/smartMoney";
import type { FlowWindow } from "@/lib/scout/types";

/* ---------------------------------------------------------------------------
   What smart money opened and closed (lib/scout/smartMoney.ts), what it
   holds, and the exchanges' own listing announcements. Public data, read
   for anyone; the reads behind it are shared, so this costs one cached look.

     GET ?window=1h|6h|24h
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_NAMES: readonly FlowWindow[] = ["1h", "6h", "24h"];

export async function GET(request: Request): Promise<Response> {
  const asked = new URL(request.url).searchParams.get("window");
  const window = WINDOW_NAMES.includes(asked as FlowWindow) ? (asked as FlowWindow) : "6h";
  const board = await smartMoneyBoard(window);
  return NextResponse.json(board, { headers: { "cache-control": "no-store" } });
}
