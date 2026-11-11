import "server-only";

import { liveRefusal } from "@/lib/autotrade/liveGate";
import { marketFor, type RuleMode } from "@/lib/autotrade/rules";
import { num, readSettings, tablesMissing } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Whether this account may open one more position or order right now, for a
   trade placed by hand — a limit order or a market order.

   The account's own limits, the same ones the five-minute pass holds every
   rule to: not while paused, not past the day's loss limit, not past the
   most positions allowed (resting orders count, since each can become one).
   Live also needs the server switched to live and an approved key, and is
   refused on a coin Elyra already trades live: Hyperliquid nets one position
   per coin, so a second would quietly merge into the first.
--------------------------------------------------------------------------- */

export type GateResult = { ok: true } | { ok: false; error: string; status: number };

const MIGRATION = "Limit orders need database migration 0020, which has not been applied.";

export async function accountGate(userId: string, coin: string, mode: RuleMode, what: "orders" | "trades"): Promise<GateResult> {
  const db = serviceClient();
  const settings = await readSettings(userId);
  if (settings.paused) return { ok: false, error: `Automation is paused. Resume it to place ${what}.`, status: 400 };

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [today, openPositions, openOrders] = await Promise.all([
    db.from("trading_positions").select("realised_pnl_usd").eq("user_id", userId).gte("closed_at", startOfDay.toISOString()),
    db.from("trading_positions").select("coin, mode").eq("user_id", userId).in("status", ["opening", "open"]),
    db.from("trading_orders").select("coin, mode").eq("user_id", userId).eq("status", "open"),
  ]);
  if (openOrders.error !== null) {
    return { ok: false, error: tablesMissing(openOrders.error) ? MIGRATION : "Orders could not be read.", status: 503 };
  }
  if (openPositions.error !== null) return { ok: false, error: "Positions could not be read.", status: 503 };

  const realised = (today.data ?? []).reduce((sum, row) => sum + (num(row.realised_pnl_usd) || 0), 0);
  if (realised <= -settings.dailyLossLimitUsd) {
    return {
      ok: false,
      error: `Today's loss limit of $${settings.dailyLossLimitUsd} is reached; no new ${what} until 00:00 UTC.`,
      status: 400,
    };
  }
  const committed = (openPositions.data ?? []).length + (openOrders.data ?? []).length;
  if (committed >= settings.maxOpenPositions) {
    return {
      ok: false,
      error: `${committed} positions and orders are open, the most allowed. Close or cancel one, or raise the limit.`,
      status: 400,
    };
  }

  if (mode === "live") {
    const refusal = await liveRefusal(userId);
    if (refusal !== null) return { ok: false, error: refusal, status: 400 };
    const clash = [...(openPositions.data ?? []), ...(openOrders.data ?? [])].some((row) => row.mode === "live" && row.coin === coin);
    if (clash) {
      return {
        ok: false,
        error: `Elyra already trades ${marketFor(coin)?.label ?? coin} live for you. Hyperliquid keeps one position per coin, so close or cancel that first.`,
        status: 400,
      };
    }
  }
  return { ok: true };
}
