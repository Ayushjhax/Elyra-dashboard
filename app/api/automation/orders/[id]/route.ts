import { NextResponse } from "next/server";
import { cancelOrders } from "@/lib/autotrade/hyperliquid";
import { agentKeyFor } from "@/lib/autotrade/liveGate";
import { automationUser } from "@/lib/autotrade/session";
import { tradingNetwork } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Cancels an open limit order. A live one is cancelled on Hyperliquid first —
   the entry and its take-profit and stop-loss — and only marked cancelled
   once the exchange accepted that, so the page never shows an order gone
   that is still resting.
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
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such order." }, { status: 404 });

  const db = serviceClient();
  const { data: order } = await db.from("trading_orders").select("*").eq("id", id).eq("user_id", resolved.userId).maybeSingle();
  if (order === null || order === undefined) return NextResponse.json({ error: "No such order." }, { status: 404 });
  if (order.status !== "open") return NextResponse.json({ error: `That order is already ${order.status}.` }, { status: 400 });

  if (order.mode === "live") {
    if (order.network !== tradingNetwork()) {
      return NextResponse.json({ error: `That order rests on Hyperliquid ${order.network}; cancel it there.` }, { status: 400 });
    }
    const agent = await agentKeyFor(resolved.userId);
    if (agent === null) return NextResponse.json({ error: "Elyra's trading key is not approved; cancel the order on Hyperliquid." }, { status: 400 });
    const cloids = [order.entry_cloid, order.tp_cloid, order.sl_cloid].filter((cloid): cloid is string => cloid !== null);
    const refused = await cancelOrders(tradingNetwork(), agent.key, order.coin, cloids).catch((error: unknown) =>
      error instanceof Error ? error.message : "Hyperliquid could not be reached.",
    );
    if (refused !== null) return NextResponse.json({ error: `Hyperliquid did not cancel it: ${refused}` }, { status: 502 });
  }

  const { error } = await db
    .from("trading_orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", resolved.userId);
  if (error !== null) return NextResponse.json({ error: "The order was cancelled but could not be recorded. Refresh to check." }, { status: 503 });
  return new NextResponse(null, { status: 204 });
}
