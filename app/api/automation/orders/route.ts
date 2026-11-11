import { NextResponse } from "next/server";
import { midPrice, placeLimitOrder } from "@/lib/autotrade/hyperliquid";
import { accountGate } from "@/lib/autotrade/accountGate";
import { agentKeyFor } from "@/lib/autotrade/liveGate";
import { validateLimitOrder } from "@/lib/autotrade/orders";
import { marketFor } from "@/lib/autotrade/rules";
import { automationUser } from "@/lib/autotrade/session";
import { tablesMissing, toOrder, tradingNetwork } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Places a limit order: open a long or a short at a level, with a
   take-profit and a stop-loss.

   Held to the same limits as a rule (lib/autotrade/orders.ts) and to the
   account's own (lib/autotrade/accountGate.ts, shared with market orders):
   not while paused, not past the day's loss limit, not past the most
   positions allowed. A live order needs the server switched to live and an
   approved key, and is refused on a coin Elyra already trades live
   (Hyperliquid nets one position per coin). It is placed on Hyperliquid's book before it is
   recorded, so a row marked open is an order that really rests there.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION = "Limit orders need database migration 0020, which has not been applied.";

export async function POST(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const { userId } = resolved;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const market = marketFor(body.coin);
  if (market === null) return NextResponse.json({ error: "Choose one of Elyra's markets." }, { status: 400 });
  const live = body.mode === "live";
  const network = tradingNetwork();

  /* Judged against the price on the network the order will rest on. */
  const mid = await midPrice(live ? network : "mainnet", market.coin).catch(() => null);
  const checked = validateLimitOrder({ ...body, coin: market.coin }, mid);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const order = checked.order;

  const gate = await accountGate(userId, order.coin, order.mode, "orders");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const db = serviceClient();
  let placed: { cloids: { entry: string; tp: string; sl: string } } | null = null;
  if (order.mode === "live") {
    const agent = await agentKeyFor(userId);
    if (agent === null) return NextResponse.json({ error: "Approve Elyra's trading key on Hyperliquid first." }, { status: 400 });
    const result = await placeLimitOrder({
      network,
      key: agent.key,
      side: order.side,
      coin: order.coin,
      sizeUsd: order.sizeUsd,
      leverage: order.leverage,
      price: order.price,
      takeProfit: order.takeProfit,
      stopLoss: order.stopLoss,
      seed: `order:${userId}:${Date.now()}`,
    }).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Hyperliquid could not be reached." }));
    if (!result.ok) {
      const hint = /margin|balance/i.test(result.error) && order.coin.includes(":")
        ? " trade[XYZ] markets keep their own margin on Hyperliquid; move USDC there first."
        : "";
      return NextResponse.json({ error: `Hyperliquid refused the order: ${result.error}${hint}` }, { status: 502 });
    }
    placed = result;
  }

  const { data, error } = await db
    .from("trading_orders")
    .insert({
      user_id: userId,
      mode: order.mode,
      network: order.mode === "live" ? network : null,
      coin: order.coin,
      side: order.side,
      limit_price: order.price,
      size_usd: order.sizeUsd,
      leverage: order.leverage,
      take_profit: order.takeProfit,
      stop_loss: order.stopLoss,
      status: "open",
      entry_cloid: placed?.cloids.entry ?? null,
      tp_cloid: placed?.cloids.tp ?? null,
      sl_cloid: placed?.cloids.sl ?? null,
    })
    .select("*")
    .single();
  if (error !== null || data === null) {
    /* A live order that rests on Hyperliquid but could not be recorded is
       said plainly: the person must know it exists. */
    const live = order.mode === "live" ? " The order IS resting on Hyperliquid — cancel it there if you do not want it." : "";
    return NextResponse.json({ error: `${tablesMissing(error) ? MIGRATION : "The order could not be recorded."}${live}` }, { status: 503 });
  }
  return NextResponse.json({ order: toOrder(data) }, { status: 201 });
}
