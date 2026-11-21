import "server-only";

import { cancelOrders, midPrice, placeExits } from "@/lib/autotrade/hyperliquid";
import { agentKeyFor } from "@/lib/autotrade/liveGate";
import { validateExits } from "@/lib/autotrade/manage";
import { num, toPosition, tradingNetwork, type PositionView } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";
import type { TradingPositionRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Moves an open position's take-profit and stop-loss, by hand.

   Held to the same limits as an entry (`validateExits`), measured from the
   entry, and to the price now, checked on a fresh mark. Paper: the row is
   updated, and the five-minute pass reads the new levels against bars from
   then on. Live: a new pair of reduce-only triggers is placed on Hyperliquid
   first, sized to what is open, and only then is the old pair cancelled —
   so the exchange holds an exit throughout. An AI fund's exits are its
   manager's, inside its charter, and are not moved here.
--------------------------------------------------------------------------- */

export type MoveOutcome = { ok: true; position: PositionView } | { ok: false; error: string; status: number };

export async function moveExits(userId: string, row: TradingPositionRow, input: Record<string, unknown>): Promise<MoveOutcome> {
  if (row.user_id !== userId) return { ok: false, error: "No such position.", status: 404 };
  if (row.status !== "open") return { ok: false, error: `That position is ${row.status}; only an open one has exits to move.`, status: 400 };
  if (row.fund_id !== null && row.fund_id !== undefined) {
    return { ok: false, error: "A fund's exits are its manager's to set, inside its charter.", status: 400 };
  }

  const live = row.mode === "live";
  const network = row.network ?? tradingNetwork();
  if (live && network !== tradingNetwork()) return { ok: false, error: `That position is on Hyperliquid ${network}; move its exits there.`, status: 400 };
  const mark = await midPrice(live ? tradingNetwork() : "mainnet", row.coin).catch(() => null);
  if (mark === null) return { ok: false, error: `Hyperliquid has no price for ${row.coin} right now.`, status: 503 };

  const side = row.side === "short" ? "short" : "long";
  const checked = validateExits(input, { side, entryPrice: num(row.entry_price) }, mark);
  if ("error" in checked) return { ok: false, error: checked.error, status: 400 };

  let takeProfit = checked.exits.takeProfit;
  let stopLoss = checked.exits.stopLoss;
  let cloids = { tp: row.tp_cloid, sl: row.sl_cloid };
  if (live) {
    const agent = await agentKeyFor(userId);
    if (agent === null) return { ok: false, error: "Elyra's trading key is not approved; move the exits on Hyperliquid.", status: 400 };
    const moves = Array.isArray(row.partial_closes) ? row.partial_closes.length : 0;
    const placed = await placeExits({
      network: tradingNetwork(),
      key: agent.key,
      side,
      coin: row.coin,
      size: num(row.size),
      takeProfit,
      stopLoss,
      seed: `${row.id}:move:${Date.now()}:${moves}`,
    }).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Hyperliquid could not be reached." }));
    if (!placed.ok) return { ok: false, error: `Hyperliquid did not take the new exits: ${placed.error} The old ones still stand.`, status: 502 };
    const old = [row.tp_cloid, row.sl_cloid].filter((cloid): cloid is string => cloid !== null);
    if (old.length > 0) await cancelOrders(tradingNetwork(), agent.key, row.coin, old).catch(() => null);
    cloids = placed.cloids;
    takeProfit = placed.takeProfit;
    stopLoss = placed.stopLoss;
  }

  const { data: updated, error } = await serviceClient()
    .from("trading_positions")
    .update({ take_profit: takeProfit, stop_loss: stopLoss, tp_cloid: cloids.tp, sl_cloid: cloids.sl })
    .eq("id", row.id)
    .eq("user_id", userId)
    .eq("status", "open")
    .select("*")
    .maybeSingle();
  if (error !== null || updated === null || updated === undefined) {
    return {
      ok: false,
      error: live ? "The new exits are on Hyperliquid, but Elyra could not record them. Refresh to check." : "That position closed a moment ago.",
      status: error !== null ? 503 : 409,
    };
  }
  return { ok: true, position: toPosition(updated) };
}
