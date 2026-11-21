import "server-only";

import { accountGate } from "@/lib/autotrade/accountGate";
import { midPrice, openPosition } from "@/lib/autotrade/hyperliquid";
import { agentKeyFor } from "@/lib/autotrade/liveGate";
import type { MarketOrderInput } from "@/lib/autotrade/orders";
import { exitPrices, marketFor, paperFill } from "@/lib/autotrade/rules";
import { toPosition, tradingNetwork, type PositionView } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Opens a long or a short now — a market order on a Hyperliquid perp:
   crypto, memecoins, or a Nasdaq stock on trade[XYZ].

   One path for every market order, whoever placed it: the person on the
   Automation page (/api/automation/trade), an agent whose intent the
   person approved or whose mandate lets perps run (lib/rails/intents.ts),
   an AI fund's manager inside its charter (lib/funds/manager.ts), or a
   leader the person copies (lib/copy/engine.ts).
   Held to the limits the order was validated against (`validateMarketOrder`)
   and to the account's own (`accountGate`); live only with the server
   switched to live and the person's approved key — one that can trade and
   cannot withdraw — and sent by `openPosition` with its take-profit and
   stop-loss in the same request, so the exchange holds both from the first
   second.

   The position row is written BEFORE the order is sent, as "opening", and
   then marked open or failed by what Hyperliquid answered. A request that
   dies in between leaves a row the five-minute pass flags for the person to
   check, never a position Elyra does not know about. From then on the pass
   manages it like any other: paper exits against bars, live exits on
   Hyperliquid. A paper trade fills at the mid less `PAPER_COSTS` slippage.
--------------------------------------------------------------------------- */

export type TradeOutcome = { ok: true; position: PositionView } | { ok: false; error: string; status: number };

export async function openMarketTrade(
  userId: string,
  order: MarketOrderInput,
  /**
   * Who placed it, for the position's own record: "by hand", an agent's
   * name, or an AI fund — whose positions carry its id (`fund_id`), so the
   * fund's book is exactly the rows tagged with it. A copy carries its
   * follow and the leader's position it copies (0029), unique as a pair.
   */
  placedBy: { ruleName: string; reason: string; fundId?: string; copy?: { followId: string; leaderPositionId: string } } = {
    ruleName: `Market ${order.side}`,
    reason: `${order.side === "long" ? "Bought" : "Sold short"} by hand at the market.`,
  },
): Promise<TradeOutcome> {
  const label = marketFor(order.coin)?.label ?? order.coin;

  const gate = await accountGate(userId, order.coin, order.mode, "trades");
  if (!gate.ok) return { ok: false, error: gate.error, status: gate.status };

  const network = tradingNetwork();
  const agent = order.mode === "live" ? await agentKeyFor(userId) : null;
  if (order.mode === "live" && agent === null) {
    return { ok: false, error: "Approve Elyra's trading key on Hyperliquid first.", status: 400 };
  }

  const mid = await midPrice(order.mode === "live" ? network : "mainnet", order.coin).catch(() => null);
  if (mid === null) return { ok: false, error: `Hyperliquid has no price for ${label} right now.`, status: 503 };

  const now = Date.now();
  const price = order.mode === "paper" ? paperFill(order.side, "entry", mid) : mid;
  const planned = exitPrices(order.side, price, order.takeProfitPct, order.stopLossPct);
  const db = serviceClient();
  const inserted = await db
    .from("trading_positions")
    .insert({
      user_id: userId,
      rule_id: null,
      rule_name: placedBy.ruleName,
      mode: order.mode,
      network: order.mode === "live" ? network : null,
      side: order.side,
      coin: order.coin,
      size: Number((order.sizeUsd / price).toPrecision(8)),
      original_size: Number((order.sizeUsd / price).toPrecision(8)),
      entry_price: Number(price.toPrecision(8)),
      /* What the fill is measured against: the mid as the order went. */
      expected_price: Number(mid.toPrecision(8)),
      take_profit: Number(planned.takeProfit.toPrecision(8)),
      stop_loss: Number(planned.stopLoss.toPrecision(8)),
      signal_at: new Date(now).toISOString(),
      entry_reason: placedBy.reason,
      status: order.mode === "live" ? "opening" : "open",
      opened_at: new Date(now).toISOString(),
      leverage: order.leverage,
      origin: placedBy.copy !== undefined ? "copy" : placedBy.fundId === undefined ? "order" : "fund",
      fund_id: placedBy.fundId ?? null,
      /* Only on a copy, so an order before migration 0029 never names these. */
      ...(placedBy.copy === undefined ? {} : { copy_id: placedBy.copy.followId, leader_position_id: placedBy.copy.leaderPositionId }),
    })
    .select("*")
    .single();
  if (inserted.error !== null || inserted.data === null) {
    /* 0025: one open position per coin per fund, held by the database. */
    if (placedBy.fundId !== undefined && inserted.error?.code === "23505") {
      return { ok: false, error: `The fund already holds ${label}; close it before opening another. Nothing was sent.`, status: 409 };
    }
    /* 0029: this leader entry is already copied for this follow. */
    if (placedBy.copy !== undefined && inserted.error?.code === "23505") {
      return { ok: false, error: "Already copied. Nothing was sent.", status: 409 };
    }
    return { ok: false, error: "The trade could not be recorded, so nothing was sent.", status: 503 };
  }
  if (order.mode === "paper" || agent === null) return { ok: true, position: toPosition(inserted.data) };

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
    return { ok: false, error: `Hyperliquid refused the trade: ${result.error}${hint} Nothing is open.`, status: 502 };
  }

  const updated = await db
    .from("trading_positions")
    .update({
      status: "open",
      size: result.size,
      original_size: result.size,
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
    return {
      ok: false,
      error: `The trade IS open on Hyperliquid (${result.size} ${label} at ${result.entryPrice}), but Elyra could not record the fill. Refresh to check.`,
      status: 503,
    };
  }
  return { ok: true, position: toPosition(updated.data) };
}
