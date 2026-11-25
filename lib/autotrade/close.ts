import "server-only";

import { cancelOrders, closePosition, fillsSince, midPrice, placeExits } from "@/lib/autotrade/hyperliquid";
import { agentKeyFor } from "@/lib/autotrade/liveGate";
import { afterPartial, type PartialClose } from "@/lib/autotrade/manage";
import { LIMITS, paperFill, type Side } from "@/lib/autotrade/rules";
import { num, toPosition, tradingNetwork, type PositionView } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";
import type { TradingPositionRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Closes an open position now, in whole or in part — the one path for every
   close that is not the position's own take-profit or stop-loss: by hand on
   the Automation page or the chart's trade panel, by a fund's manager or
   owner, or by Elyra when a fund halts or winds down. Whoever asks, the
   reason is recorded as `exit_reason`.

   Live: traded on Hyperliquid by `closePosition` (a reduce-only order, so it
   can never open the other way). A whole close cancels the exits after, and
   its result is Hyperliquid's own, read from every closing fill since the
   position opened — partial closes included. A partial close keeps the
   position open: new exits sized to what remains are placed FIRST, and only
   then is the old pair cancelled, so the position is never unprotected.
   Paper: closed at the mid less `PAPER_COSTS` slippage, after the taker fee
   on both legs.

   A part that would leave less than the smallest order open closes it all.
   An AI fund's position closes whole or not at all: its book is its
   manager's to size. The row changes only while it is still open at the
   size that was read, so a close that races another is recorded once.
--------------------------------------------------------------------------- */

export type CloseOutcome =
  | { ok: true; position: PositionView; note: string | null }
  | { ok: false; error: string; status: number };

export async function closeTrade(userId: string, row: TradingPositionRow, reason: string, fraction = 1): Promise<CloseOutcome> {
  if (row.user_id !== userId) return { ok: false, error: "No such position.", status: 404 };
  if (row.status !== "open") {
    return {
      ok: false,
      error: row.status === "opening" ? "That entry is still being confirmed. Try again in a moment." : `That position is already ${row.status}.`,
      status: 400,
    };
  }
  if (fraction < 1 && row.fund_id !== null && row.fund_id !== undefined) {
    return { ok: false, error: "A fund's position closes whole: its size is its manager's to set.", status: 400 };
  }

  const side: Side = row.side === "short" ? "short" : "long";
  const size = num(row.size);
  const entry = num(row.entry_price);
  const realisedSoFar = Number(row.realised_partial_usd ?? 0) || 0;
  const network = row.network ?? tradingNetwork();
  const live = row.mode === "live";

  if (live && network !== tradingNetwork()) return { ok: false, error: `That position is on Hyperliquid ${network}; close it there.`, status: 400 };
  const agent = live ? await agentKeyFor(userId) : null;
  if (live && agent === null) return { ok: false, error: "Elyra's trading key is not approved; close the position on Hyperliquid.", status: 400 };

  const mid = await midPrice(live ? tradingNetwork() : "mainnet", row.coin).catch(() => null);
  if (mid === null) return { ok: false, error: `Hyperliquid has no price for ${row.coin} right now.`, status: 503 };
  /* Dust left behind is a position nobody can close by hand: take it all. */
  const part = fraction < 1 && size * (1 - fraction) * mid < LIMITS.minSizeUsd ? 1 : fraction;

  let exitPrice: number;
  let filledSize: number | null = null;
  if (!live || agent === null) {
    exitPrice = paperFill(side, "exit", mid);
  } else {
    const closed = await closePosition({
      network: tradingNetwork(),
      key: agent.key,
      side,
      coin: row.coin,
      size: part >= 1 ? size : size * part,
      cloids: { tp: row.tp_cloid, sl: row.sl_cloid },
      keepExits: part < 1,
    }).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Hyperliquid could not be reached." }));
    if (!closed.ok) return { ok: false, error: `Hyperliquid did not close it: ${closed.error}`, status: 502 };
    exitPrice = closed.exitPrice;
    filledSize = closed.size;
  }

  const outcome = afterPartial({ side, size, entryPrice: entry, fraction: part, exitPrice, filledSize, realisedSoFar });
  const db = serviceClient();

  if (outcome.full) {
    let pnl = outcome.realised;
    if (live && agent !== null) {
      /* A part asked for kept the exits; the fill took it all, so they go too. */
      if (part < 1) {
        const old = [row.tp_cloid, row.sl_cloid].filter((cloid): cloid is string => cloid !== null);
        if (old.length > 0) await cancelOrders(tradingNetwork(), agent.key, row.coin, old).catch(() => null);
      }
      /* A long is closed by sales ("A"), a short by buys ("B"). */
      const closing = side === "long" ? "A" : "B";
      const fills = await fillsSince(tradingNetwork(), agent.account, Date.parse(row.opened_at))
        .then((all) => all.filter((fill) => fill.coin === row.coin && fill.side === closing))
        .catch(() => []);
      if (fills.length > 0) pnl = fills.reduce((sum, fill) => sum + Number(fill.closedPnl) - Number(fill.fee), 0);
    }
    const { data: updated, error } = await db
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
        error: live ? "The position is closed on Hyperliquid, but Elyra could not record it. Refresh to check." : "The position could not be closed.",
        status: 503,
      };
    }
    if (updated === null || updated === undefined) return { ok: false, error: "That position was closed a moment ago.", status: 409 };
    return { ok: true, position: toPosition(updated), note: null };
  }

  /* ---- partial: the rest stays open, its exits resized ---- */
  let cloids = { tp: row.tp_cloid, sl: row.sl_cloid };
  let note: string | null = null;
  const history = Array.isArray(row.partial_closes) ? (row.partial_closes as PartialClose[]) : [];
  if (live && agent !== null) {
    const placed = await placeExits({
      network: tradingNetwork(),
      key: agent.key,
      side,
      coin: row.coin,
      size: outcome.remaining,
      takeProfit: num(row.take_profit),
      stopLoss: num(row.stop_loss),
      seed: `${row.id}:resize:${history.length + 1}`,
    }).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "Hyperliquid could not be reached." }));
    if (placed.ok) {
      const old = [row.tp_cloid, row.sl_cloid].filter((cloid): cloid is string => cloid !== null);
      if (old.length > 0) await cancelOrders(tradingNetwork(), agent.key, row.coin, old).catch(() => null);
      cloids = placed.cloids;
    } else {
      /* The old exits still stand. They are reduce-only, so when one fires it closes what remains. */
      note = `Closed in part. The take-profit and stop-loss could not be resized (${placed.error}); the old ones still protect what remains.`;
    }
  }

  const { data: updated, error } = await db
    .from("trading_positions")
    .update({
      size: Number(outcome.remaining.toPrecision(8)),
      partial_closes: [
        ...history,
        { at: new Date().toISOString(), size: Number(outcome.closed.toPrecision(8)), price: Number(exitPrice.toPrecision(8)), pnlUsd: Number(outcome.pnlUsd.toFixed(4)), reason },
      ],
      realised_partial_usd: Number(outcome.realised.toFixed(4)),
      tp_cloid: cloids.tp,
      sl_cloid: cloids.sl,
    })
    .eq("id", row.id)
    .eq("user_id", userId)
    .eq("status", "open")
    .eq("size", row.size)
    .select("*")
    .maybeSingle();
  if (error !== null || updated === null || updated === undefined) {
    return {
      ok: false,
      error: live ? "Part of the position is closed on Hyperliquid, but Elyra could not record it. Refresh to check." : "That position changed a moment ago. Refresh and try again.",
      status: error !== null ? 503 : 409,
    };
  }
  return { ok: true, position: toPosition(updated), note };
}
