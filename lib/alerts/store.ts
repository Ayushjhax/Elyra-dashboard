import "server-only";

import { serviceClient } from "@/lib/supabase/server";
import type { PriceAlert } from "@/lib/alerts/types";

/* ---------------------------------------------------------------------------
   Price alerts.

   ── An alert is an EVENT, not a state ──────────────────────────────────

   "Tell me when SOL is above 120" evaluated continuously fires on every tick
   for as long as the condition holds. `triggered_at` is stamped on the first
   crossing and the row goes quiet until it is re-armed, so the user gets one
   message per crossing rather than one per poll.

   ── Direction is stored, never inferred ────────────────────────────────

   Inferring "above" from the price at creation time means an alert created
   while the market is moving can end up meaning the opposite of what the
   user typed. They said above; it is stored as above.
--------------------------------------------------------------------------- */

export type { PriceAlert };

/** `SOL > 120`, `SOL above 120`, `sol under 80`, `SOL 120`. */
export function parseAlertCommand(
  argument: string,
  currentPrice: number | null,
): { symbol: string; direction: "above" | "below"; target: number } | null {
  const cleaned = argument.trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) return null;

  const match =
    /^([A-Za-z][A-Za-z0-9]{0,11})\s*(>|<|above|below|over|under|=)?\s*\$?([\d.,]+)$/i.exec(
      cleaned,
    );
  if (match === null) return null;

  const target = Number.parseFloat(match[3].replace(/,/g, ""));
  if (!Number.isFinite(target) || target <= 0) return null;

  const word = (match[2] ?? "").toLowerCase();

  let direction: "above" | "below";
  if (word === ">" || word === "above" || word === "over") {
    direction = "above";
  } else if (word === "<" || word === "below" || word === "under") {
    direction = "below";
  } else if (currentPrice !== null) {
    /* No direction given: infer it from where the price is NOW, which is the
       only reading of "alert me at 120" that is not immediately true. */
    direction = target > currentPrice ? "above" : "below";
  } else {
    /* Without a current price there is nothing to infer from, and guessing
       would produce an alert that fires instantly or never. */
    return null;
  }

  return { symbol: match[1].toUpperCase(), direction, target };
}

export async function createAlert(input: {
  userId: string;
  symbol: string;
  direction: "above" | "below";
  target: number;
  currentPrice: number | null;
}): Promise<boolean> {
  const { error } = await serviceClient()
    .from("price_alerts")
    .upsert(
      {
        user_id: input.userId,
        symbol: input.symbol,
        direction: input.direction,
        target: input.target,
        created_price: input.currentPrice,
        /* Explicitly re-armed. Re-sending the same command for an alert that
           already fired should arm it again, not leave it silent. */
        triggered_at: null,
        triggered_price: null,
      },
      { onConflict: "user_id,symbol,direction,target" },
    );

  if (error) {
    console.error("[alerts] could not create alert", error.code);
    return false;
  }
  return true;
}

export async function listAlerts(userId: string): Promise<PriceAlert[]> {
  const { data, error } = await serviceClient()
    .from("price_alerts")
    .select("id, symbol, direction, target, created_price, triggered_at, triggered_price, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    direction: row.direction,
    target: Number(row.target),
    createdPrice: row.created_price === null ? null : Number(row.created_price),
    triggeredAt: row.triggered_at,
    triggeredPrice: row.triggered_price === null ? null : Number(row.triggered_price),
    createdAt: row.created_at,
  }));
}

/** Removes every alert on a symbol, or all of them when symbol is null. */
export async function clearAlerts(
  userId: string,
  symbol: string | null,
): Promise<number> {
  let query = serviceClient().from("price_alerts").delete().eq("user_id", userId);
  if (symbol !== null) query = query.eq("symbol", symbol);

  const { data } = await query.select("id");
  return (data ?? []).length;
}

/** Removes one alert, scoped to its owner. True when something was removed. */
export async function deleteAlert(userId: string, id: string): Promise<boolean> {
  const { data } = await serviceClient()
    .from("price_alerts")
    .delete()
    .eq("user_id", userId)
    .eq("id", id)
    .select("id");
  return (data ?? []).length > 0;
}

/* ---------------------------------------------------------------------------
   Evaluation — used by the delivery worker
--------------------------------------------------------------------------- */

export interface ArmedAlert extends PriceAlert {
  userId: string;
}

/** Every alert still waiting to fire, across all users. */
export async function armedAlerts(): Promise<ArmedAlert[]> {
  const { data, error } = await serviceClient()
    .from("price_alerts")
    .select("id, user_id, symbol, direction, target, created_price, triggered_at")
    .is("triggered_at", null)
    .limit(1000);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    direction: row.direction,
    target: Number(row.target),
    createdPrice: row.created_price === null ? null : Number(row.created_price),
    triggeredAt: null,
  }));
}

/** Whether a price has crossed an alert's level. */
export function hasCrossed(alert: PriceAlert, price: number): boolean {
  return alert.direction === "above" ? price >= alert.target : price <= alert.target;
}

/**
 * Marks an alert fired.
 *
 * The `triggered_at is null` filter makes this the claim: two workers racing
 * on the same crossing produce one update and one notification. Returns false
 * when someone else got there first.
 */
export async function markTriggered(
  alertId: string,
  price: number,
): Promise<boolean> {
  const { data } = await serviceClient()
    .from("price_alerts")
    .update({ triggered_at: new Date().toISOString(), triggered_price: price })
    .eq("id", alertId)
    .is("triggered_at", null)
    .select("id");

  return (data ?? []).length > 0;
}
