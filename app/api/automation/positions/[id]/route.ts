import { NextResponse } from "next/server";
import { closeTrade } from "@/lib/autotrade/close";
import { automationUser } from "@/lib/autotrade/session";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Closes an open position now, by hand — whether a rule, a limit order, a
   market order or an AI fund opened it — through `closeTrade`
   (lib/autotrade/close.ts), the one close path, as `closed_by_hand`.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const { userId } = resolved;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such position." }, { status: 404 });

  const { data: row } = await serviceClient().from("trading_positions").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (row === null || row === undefined) return NextResponse.json({ error: "No such position." }, { status: 404 });

  const outcome = await closeTrade(userId, row, "closed_by_hand");
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ position: outcome.position });
}
