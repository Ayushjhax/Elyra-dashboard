import { NextResponse } from "next/server";
import { liveRefusal } from "@/lib/autotrade/liveGate";
import { LIMITS, validateRule } from "@/lib/autotrade/rules";
import { STRATEGY_REFS, automationUser } from "@/lib/autotrade/session";
import { tablesMissing, toRule } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Creates a trading rule. Every field is held to lib/autotrade/rules.ts
   `validateRule`; a rule starts on paper unless live is asked for AND the
   server sends live orders AND Elyra's trading key is approved.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = validateRule(body, STRATEGY_REFS);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const rule = checked.rule;

  if (rule.mode === "live") {
    const refusal = await liveRefusal(resolved.userId);
    if (refusal !== null) return NextResponse.json({ error: refusal }, { status: 400 });
  }

  const db = serviceClient();
  const { count } = await db.from("trading_rules").select("id", { count: "exact", head: true }).eq("user_id", resolved.userId);
  if ((count ?? 0) >= LIMITS.maxRulesPerAccount) {
    return NextResponse.json({ error: `An account can have ${LIMITS.maxRulesPerAccount} rules. Delete one first.` }, { status: 400 });
  }

  const { data, error } = await db
    .from("trading_rules")
    .insert({
      user_id: resolved.userId,
      name: rule.name,
      side: rule.side,
      coin: rule.coin,
      strategy_id: rule.strategyId,
      params: rule.params,
      interval: rule.interval,
      size_usd: rule.sizeUsd,
      leverage: rule.leverage,
      take_profit_pct: rule.takeProfitPct,
      stop_loss_pct: rule.stopLossPct,
      mode: rule.mode,
      enabled: rule.enabled,
    })
    .select("*")
    .single();
  if (error !== null || data === null) {
    return NextResponse.json(
      { error: tablesMissing(error) ? "Automation needs database migration 0018, which has not been applied." : "The rule could not be saved." },
      { status: 503 },
    );
  }
  return NextResponse.json({ rule: toRule(data) }, { status: 201 });
}
