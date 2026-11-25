import { NextResponse } from "next/server";
import { fundsUser } from "@/lib/funds/console";
import { ownerClosePosition } from "@/lib/funds/owner";

/* ---------------------------------------------------------------------------
   The person closes one of a fund's positions now — an override of its
   manager — through the one close path (lib/autotrade/close.ts), recorded
   as `closed_by_owner` and in the ledger.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string; positionId: string }>;
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const user = await fundsUser(request);
  if ("response" in user) return user.response;
  const { id, positionId } = await context.params;
  const closed = await ownerClosePosition(user.userId, id, positionId);
  if (!closed.ok) return NextResponse.json({ error: closed.error }, { status: closed.status });
  return NextResponse.json({ ok: true });
}
