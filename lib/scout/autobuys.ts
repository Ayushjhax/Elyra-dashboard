import "server-only";

import { randomUUID } from "node:crypto";
import { liveRefusal } from "@/lib/autotrade/liveGate";
import { liveEnabled } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";
import { AUTOBUY_COINS, AUTOBUY_LIMITS, utcDay, type AutoBuyRule, type Trigger } from "@/lib/scout/autobuy";
import type { AutoBuysResponse, AutoBuyView, FireView } from "@/lib/scout/types";

/* ---------------------------------------------------------------------------
   The person's auto-buy rules and what they fired, in the database.
   The rules are run by the tick (lib/scout/engine.ts); this is the CRUD.
--------------------------------------------------------------------------- */

const MIGRATION = "Auto-buys need their tables: run migration 0035_scout.sql.";
const missing = (code: string | undefined) => code === "42P01" || code === "PGRST205";

export function ruleFromRow(row: Record<string, unknown>): AutoBuyRule & { id: string; userId: string; status: "active" | "paused"; createdAt: string } {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    trigger: row.trigger as Trigger,
    side: row.side as AutoBuyRule["side"],
    coins: Array.isArray(row.coins) ? (row.coins as string[]) : [],
    minWallets: Number(row.min_wallets),
    sizeUsd: Number(row.size_usd),
    leverage: Number(row.leverage),
    takeProfitPct: Number(row.take_profit_pct),
    stopLossPct: Number(row.stop_loss_pct),
    maxPerDay: Number(row.max_per_day),
    mode: row.mode === "live" ? "live" : "paper",
    status: row.status === "paused" ? "paused" : "active",
    createdAt: String(row.created_at),
  };
}

function fireFromRow(row: Record<string, unknown>, names: Map<string, string>): FireView {
  return {
    id: String(row.id),
    ruleId: String(row.rule_id),
    ruleName: names.get(String(row.rule_id)) ?? "",
    trigger: row.trigger as Trigger,
    coin: String(row.coin),
    side: row.side === "short" ? "short" : "long",
    outcome: row.outcome === "opened" ? "opened" : "refused",
    reason: String(row.reason ?? ""),
    positionId: (row.position_id as string | null) ?? null,
    at: String(row.created_at),
  };
}

export async function listAutoBuys(userId: string): Promise<AutoBuysResponse> {
  const db = serviceClient();
  const [rules, fires] = await Promise.all([
    db.from("scout_rules").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    db.from("scout_fires").select("*").eq("user_id", userId).neq("outcome", "pending").order("created_at", { ascending: false }).limit(30),
  ]);
  const error = rules.error ?? fires.error;
  if (error !== null) {
    return { rules: [], fires: [], coins: [...AUTOBUY_COINS], live: liveEnabled(), error: missing(error.code) ? MIGRATION : "Your auto-buys could not be loaded." };
  }
  const today = utcDay(Date.now());
  const fireRows = (fires.data ?? []) as Array<Record<string, unknown>>;
  const views: AutoBuyView[] = ((rules.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const rule = ruleFromRow(row);
    const { userId: _owner, ...rest } = rule;
    void _owner;
    return { ...rest, firedToday: fireRows.filter((fire) => fire.rule_id === rule.id && fire.outcome === "opened" && String(fire.created_at).slice(0, 10) === today).length };
  });
  const names = new Map(views.map((view) => [view.id, view.name]));
  return { rules: views, fires: fireRows.map((row) => fireFromRow(row, names)), coins: [...AUTOBUY_COINS], live: liveEnabled(), error: null };
}

export async function createAutoBuy(userId: string, rule: AutoBuyRule): Promise<{ ok: true; id: string } | { ok: false; error: string; status: number }> {
  const db = serviceClient();
  const { count, error } = await db.from("scout_rules").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error !== null) return { ok: false, error: missing(error.code) ? MIGRATION : "Your auto-buys could not be read.", status: 503 };
  if ((count ?? 0) >= AUTOBUY_LIMITS.maxRules) return { ok: false, error: `You can keep ${AUTOBUY_LIMITS.maxRules} auto-buy rules. Delete one first.`, status: 409 };
  if (rule.mode === "live") {
    const refusal = await liveRefusal(userId);
    if (refusal !== null) return { ok: false, error: refusal, status: 400 };
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const inserted = await db.from("scout_rules").insert({
    id,
    user_id: userId,
    name: rule.name,
    trigger: rule.trigger,
    side: rule.side,
    coins: rule.coins,
    min_wallets: rule.minWallets,
    size_usd: rule.sizeUsd,
    leverage: rule.leverage,
    take_profit_pct: rule.takeProfitPct,
    stop_loss_pct: rule.stopLossPct,
    max_per_day: rule.maxPerDay,
    mode: rule.mode,
    status: "active",
    created_at: now,
    updated_at: now,
  });
  if (inserted.error !== null) return { ok: false, error: "The rule could not be saved.", status: 503 };
  return { ok: true, id };
}

export async function setAutoBuyStatus(userId: string, id: string, status: "active" | "paused"): Promise<boolean> {
  const { data } = await serviceClient()
    .from("scout_rules")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  return (data ?? []).length > 0;
}

export async function deleteAutoBuy(userId: string, id: string): Promise<boolean> {
  const { data } = await serviceClient().from("scout_rules").delete().eq("id", id).eq("user_id", userId).select("id");
  return (data ?? []).length > 0;
}
