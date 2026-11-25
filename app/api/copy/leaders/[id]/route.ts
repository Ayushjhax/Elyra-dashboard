import { NextResponse } from "next/server";
import { UUID, viewerOf } from "@/lib/copy/session";
import { leaderDetail } from "@/lib/copy/store";

/* ---------------------------------------------------------------------------
   One shared rule set: its record, its open and latest closed trades (in
   returns on margin, never in dollars), and its rules replayed on past bars.
   Public; an unshared set is seen only by its owner.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such set." }, { status: 404 });
  const detail = await leaderDetail(id, await viewerOf(request)).catch(() => null);
  if (detail === null) return NextResponse.json({ error: "That set is not shared." }, { status: 404 });
  return NextResponse.json(detail, { headers: { "cache-control": "no-store" } });
}
