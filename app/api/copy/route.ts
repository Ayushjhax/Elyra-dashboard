import { NextResponse } from "next/server";
import { viewerOf } from "@/lib/copy/session";
import { copyOverview } from "@/lib/copy/store";

/* ---------------------------------------------------------------------------
   Copy trading: every shared rule set and its record — public — and, signed
   in, the person's own sets, rules and copies. lib/copy/store.ts.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const viewer = await viewerOf(request);
  const body = await copyOverview(viewer);
  return NextResponse.json(body, { status: body.error !== null && body.leaders.length === 0 ? 503 : 200, headers: { "cache-control": "no-store" } });
}
