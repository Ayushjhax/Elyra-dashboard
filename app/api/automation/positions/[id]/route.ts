import { NextResponse } from "next/server";
import { closeTrade } from "@/lib/autotrade/close";
import { moveExits } from "@/lib/autotrade/exits";
import { validateFraction } from "@/lib/autotrade/manage";
import { automationUser } from "@/lib/autotrade/session";
import { serviceClient } from "@/lib/supabase/server";
import type { TradingPositionRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   An open position, by hand — whether a rule, a limit order, a market order
   or an AI fund opened it.

   DELETE ?fraction=0.25|0.5|0.75|1 closes it, in part or whole, through
   `closeTrade` (lib/autotrade/close.ts), the one close path, as
   `closed_by_hand`. PATCH { takeProfit, stopLoss } moves its exits through
   `moveExits` (lib/autotrade/exits.ts). Neither opens anything, so neither
   passes the account gate an entry does.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownPosition(request: Request, context: Context): Promise<{ response: Response } | { userId: string; row: TradingPositionRow }> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return { response: resolved.response };
  const { userId } = resolved;
  const { id } = await context.params;
  if (!UUID.test(id)) return { response: NextResponse.json({ error: "No such position." }, { status: 404 }) };
  const { data: row } = await serviceClient().from("trading_positions").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (row === null || row === undefined) return { response: NextResponse.json({ error: "No such position." }, { status: 404 }) };
  return { userId, row };
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const found = await ownPosition(request, context);
  if ("response" in found) return found.response;
  const fraction = validateFraction(new URL(request.url).searchParams.get("fraction"));
  if ("error" in fraction) return NextResponse.json({ error: fraction.error }, { status: 400 });

  const outcome = await closeTrade(found.userId, found.row, "closed_by_hand", fraction.fraction);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ position: outcome.position, note: outcome.note });
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const found = await ownPosition(request, context);
  if ("response" in found) return found.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null || typeof body !== "object") return NextResponse.json({ error: "Send the new take-profit and stop-loss." }, { status: 400 });

  const outcome = await moveExits(found.userId, found.row, body);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ position: outcome.position });
}
