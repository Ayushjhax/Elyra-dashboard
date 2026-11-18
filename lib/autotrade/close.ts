import "server-only";

import { closePosition, fillsSince, midPrice } from "@/lib/autotrade/hyperliquid";
import { agentKeyFor } from "@/lib/autotrade/liveGate";
import { netPnl, paperFill, type Side } from "@/lib/autotrade/rules";
import { num, toPosition, tradingNetwork, type PositionView } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";
import type { TradingPositionRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Closes an open position now — the one path for every close that is not
   the position's own take-profit or stop-loss: by hand on the Automation
   page, by a fund's manager or owner, or by Elyra when a fund halts or
   winds down. Whoever asks, the reason is recorded as `exit_reason`.

   Live: traded back to flat on Hyperliquid by `closePosition` (a reduce-only
   order, so it can never open the other way), its take-profit and stop-loss
   cancelled after; the result is Hyperliquid's own, read from the closing
   fills as the five-minute pass reads them. Paper: closed at the mid less
   `PAPER_COSTS` slippage, after the taker fee on both legs.

   The row is closed only while it is still open, so a close that races the
   five-minute pass — or another close — is recorded once.
--------------------------------------------------------------------------- */

export type CloseOutcome = { ok: true; position: PositionView } | { ok: false; error: string; status: number };

export async function closeTrade(userId: string, row: TradingPositionRow, reason: string): Promise<CloseOutcome> {
  if (row.user_id !== userId) return { ok: false, error: "No such position.", status: 404 };
  if (row.status !== "open") {
    return {
      ok: false,
      error: row.status === "opening" ? "That entry is still being confirmed. Try again in a moment." : `That position is already ${row.status}.`,
      status: 400,
    };
  }

  const side: Side = row.side === "short" ? "short" : "long";
  const size = num(row.size);
  const entry = num(row.entry_price);
  let exitPrice: number;
  let pnl: number;

  if (row.mode === "paper") {
    const mid = await midPrice("mainnet", row.coin).catch(() => null);
    if (mid === null) return { ok: false, error: `Hyperliquid has no price for ${row.coin} right now.`, status: 503 };
    exitPrice = paperFill(side, "exit", mid);
    pnl = netPnl(side, size, entry, exitPrice);
  } else {
    const network = row.network ?? tradingNetwork();
    if (network !== tradingNetwork()) return { ok: false, error: `That position is on Hyperliquid ${network}; close it there.`, status: 400 };
    const agent = await agentKeyFor(userId);
    if (agent === null) return { ok: false, error: "Elyra's trading key is not approved; close the position on Hyperliquid.", status: 400 };
    const closed = await closePosition({
      network: tradingNetwork(),
      key: agent.key,
      side,
      coin: row.coin,
      size,
      cloids: { tp: row.tp_cloid, sl: row.sl_cloid },
    }).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Hyperliquid could not be reached." }));
    if (!closed.ok) return { ok: false, error: `Hyperliquid did not close it: ${closed.error}`, status: 502 };

    /* A long is closed by sales ("A"), a short by buys ("B"). */
    const closing = side === "long" ? "A" : "B";
    const fills = await fillsSince(tradingNetwork(), agent.account, Date.parse(row.opened_at))
      .then((all) => all.filter((fill) => fill.coin === row.coin && fill.side === closing))
      .catch(() => []);
    exitPrice = closed.exitPrice;
    pnl = fills.length > 0 ? fills.reduce((sum, fill) => sum + Number(fill.closedPnl) - Number(fill.fee), 0) : netPnl(side, size, entry, exitPrice);
  }

  const { data: updated, error } = await serviceClient()
    .from("trading_positions")
    .update({
      status: "closed",
      exit_price: Number(exitPrice.toPrecision(8)),
      exit_reason: reason,
      realised_pnl_usd: Number(pnl.toFixed(4)),
      closed_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("user_id", userId)
    .eq("status", "open")
    .select("*")
    .maybeSingle();
  if (error !== null) {
    return {
      ok: false,
      error: row.mode === "live" ? "The position is closed on Hyperliquid, but Elyra could not record it. Refresh to check." : "The position could not be closed.",
      status: 503,
    };
  }
  if (updated === null || updated === undefined) return { ok: false, error: "That position was closed a moment ago.", status: 409 };
  return { ok: true, position: toPosition(updated) };
}
