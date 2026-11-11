import { NextResponse } from "next/server";
import { accountGate } from "@/lib/autotrade/accountGate";
import { midPrice, openPosition } from "@/lib/autotrade/hyperliquid";
import { agentKeyFor } from "@/lib/autotrade/liveGate";
import { validateMarketOrder } from "@/lib/autotrade/orders";
import { exitPrices, marketFor, paperFill } from "@/lib/autotrade/rules";
import { automationUser } from "@/lib/autotrade/session";
import { toPosition, tradingNetwork } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Opens a long or a short now, by hand — a market order on a Hyperliquid
   perp: crypto, memecoins, or a Nasdaq stock on trade[XYZ].

   The same path a rule's entry takes, through the same code: held to the
   limits (`validateMarketOrder`) and to the account's own (`accountGate`);
   live only with the server switched to live and the person's approved key
   — one that can trade and cannot withdraw — and sent by `openPosition`
   with its take-profit and stop-loss in the same request, so the exchange
   holds both from the first second.

   The position row is written BEFORE the order is sent, as "opening", and
   then marked open or failed by what Hyperliquid answered. A request that
   dies in between leaves a row the five-minute pass flags for the person to
   check, never a position Elyra does not know about. From then on the pass
   manages it like any other: paper exits against bars, live exits on
   Hyperliquid. A paper trade fills at the mid less `PAPER_COSTS` slippage.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const { userId } = resolved;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = validateMarketOrder(body);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const order = checked.order;
  const label = marketFor(order.coin)?.label ?? order.coin;

  const gate = await accountGate(userId, order.coin, order.mode, "trades");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const network = tradingNetwork();
  const agent = order.mode === "live" ? await agentKeyFor(userId) : null;
  if (order.mode === "live" && agent === null) {
    return NextResponse.json({ error: "Approve Elyra's trading key on Hyperliquid first." }, { status: 400 });
  }

  const mid = await midPrice(order.mode === "live" ? network : "mainnet", order.coin).catch(() => null);
  if (mid === null) return NextResponse.json({ error: `Hyperliquid has no price for ${label} right now.` }, { status: 503 });

  const now = Date.now();
  const price = order.mode === "paper" ? paperFill(order.side, "entry", mid) : mid;
  const planned = exitPrices(order.side, price, order.takeProfitPct, order.stopLossPct);
  const db = serviceClient();
  const inserted = await db
    .from("trading_positions")
    .insert({
      user_id: userId,
      rule_id: null,
      rule_name: `Market ${order.side}`,
      mode: order.mode,
      network: order.mode === "live" ? network : null,
      side: order.side,
      coin: order.coin,
      size: Number((order.sizeUsd / price).toPrecision(8)),
      entry_price: Number(price.toPrecision(8)),
      take_profit: Number(planned.takeProfit.toPrecision(8)),
      stop_loss: Number(planned.stopLoss.toPrecision(8)),
      signal_at: new Date(now).toISOString(),
      entry_reason: `${order.side === "long" ? "Bought" : "Sold short"} by hand at the market.`,
      status: order.mode === "live" ? "opening" : "open",
      opened_at: new Date(now).toISOString(),
      leverage: order.leverage,
      origin: "order",
    })
    .select("*")
    .single();
  if (inserted.error !== null || inserted.data === null) {
    return NextResponse.json({ error: "The trade could not be recorded, so nothing was sent." }, { status: 503 });
  }
  if (order.mode === "paper" || agent === null) {
    return NextResponse.json({ position: toPosition(inserted.data) }, { status: 201 });
  }

  const result = await openPosition({
    network,
    key: agent.key,
    side: order.side,
    coin: order.coin,
    sizeUsd: order.sizeUsd,
    leverage: order.leverage,
    takeProfitPct: order.takeProfitPct,
    stopLossPct: order.stopLossPct,
    seed: `trade:${inserted.data.id}`,
  }).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Hyperliquid could not be reached." }));

  if (!result.ok) {
    await db.from("trading_positions").update({ status: "failed", error: result.error }).eq("id", inserted.data.id);
    const hint =
      /margin|balance/i.test(result.error) && order.coin.includes(":")
        ? " trade[XYZ] markets keep their own margin on Hyperliquid; move USDC there first."
        : "";
    return NextResponse.json({ error: `Hyperliquid refused the trade: ${result.error}${hint} Nothing is open.` }, { status: 502 });
  }

  const updated = await db
    .from("trading_positions")
    .update({
      status: "open",
      size: result.size,
      entry_price: result.entryPrice,
      take_profit: result.takeProfit,
      stop_loss: result.stopLoss,
      entry_cloid: result.cloids.entry,
      tp_cloid: result.cloids.tp,
      sl_cloid: result.cloids.sl,
    })
    .eq("id", inserted.data.id)
    .select("*")
    .single();
  if (updated.error !== null || updated.data === null) {
    return NextResponse.json(
      { error: `The trade IS open on Hyperliquid (${result.size} ${label} at ${result.entryPrice}), but Elyra could not record the fill. Refresh to check.` },
      { status: 503 },
    );
  }
  return NextResponse.json({ position: toPosition(updated.data) }, { status: 201 });
}
