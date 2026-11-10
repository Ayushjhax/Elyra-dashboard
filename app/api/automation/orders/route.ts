import { NextResponse } from "next/server";
import { midPrice, placeLimitOrder } from "@/lib/autotrade/hyperliquid";
import { agentKeyFor, liveRefusal } from "@/lib/autotrade/liveGate";
import { validateLimitOrder } from "@/lib/autotrade/orders";
import { marketFor } from "@/lib/autotrade/rules";
import { automationUser } from "@/lib/autotrade/session";
import { num, readSettings, tablesMissing, toOrder, tradingNetwork } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Places a limit order: open a long or a short at a level, with a
   take-profit and a stop-loss.

   Held to the same limits as a rule (lib/autotrade/orders.ts) and to the
   account's own: not while paused, not past the day's loss limit, not past
   the most positions allowed — orders resting count, since each can become
   one. A live order needs the server switched to live and an approved key,
   and is refused on a coin Elyra already trades live (Hyperliquid nets one
   position per coin). It is placed on Hyperliquid's book before it is
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

  const db = serviceClient();
  const settings = await readSettings(userId);
  if (settings.paused) return NextResponse.json({ error: "Automation is paused. Resume it to place orders." }, { status: 400 });

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [today, openPositions, openOrders] = await Promise.all([
    db.from("trading_positions").select("realised_pnl_usd").eq("user_id", userId).gte("closed_at", startOfDay.toISOString()),
    db.from("trading_positions").select("coin, mode").eq("user_id", userId).in("status", ["opening", "open"]),
    db.from("trading_orders").select("coin, mode").eq("user_id", userId).eq("status", "open"),
  ]);
  if (openOrders.error !== null) {
    return NextResponse.json({ error: tablesMissing(openOrders.error) ? MIGRATION : "Orders could not be read." }, { status: 503 });
  }
  const realised = (today.data ?? []).reduce((sum, row) => sum + (num(row.realised_pnl_usd) || 0), 0);
  if (realised <= -settings.dailyLossLimitUsd) {
    return NextResponse.json({ error: `Today's loss limit of $${settings.dailyLossLimitUsd} is reached; no new orders until 00:00 UTC.` }, { status: 400 });
  }
  const committed = (openPositions.data ?? []).length + (openOrders.data ?? []).length;
  if (committed >= settings.maxOpenPositions) {
    return NextResponse.json(
      { error: `${committed} positions and orders are open, the most allowed. Cancel one or raise the limit.` },
      { status: 400 },
    );
  }

  let placed: { cloids: { entry: string; tp: string; sl: string } } | null = null;
  if (order.mode === "live") {
    const refusal = await liveRefusal(userId);
    if (refusal !== null) return NextResponse.json({ error: refusal }, { status: 400 });
    const clash = [...(openPositions.data ?? []), ...(openOrders.data ?? [])].some((row) => row.mode === "live" && row.coin === order.coin);
    if (clash) {
      return NextResponse.json(
        { error: `Elyra already trades ${market.label} live for you. Hyperliquid keeps one position per coin, so close or cancel that first.` },
        { status: 400 },
      );
    }
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
