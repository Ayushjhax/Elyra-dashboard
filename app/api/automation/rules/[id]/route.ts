import { NextResponse } from "next/server";
import { liveRefusal } from "@/lib/autotrade/liveGate";
import { validateRule } from "@/lib/autotrade/rules";
import { STRATEGY_REFS, automationUser } from "@/lib/autotrade/session";
import { toRule } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   One trading rule: PATCH changes it (re-validated whole), DELETE removes it.

   Deleting a rule does not close its position. A live position keeps its TP
   and SL on Hyperliquid; its row stays in the trade history, unlinked.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such rule." }, { status: 404 });

  const db = serviceClient();
  const { data: existing } = await db.from("trading_rules").select("*").eq("id", id).eq("user_id", resolved.userId).maybeSingle();
  if (existing === null || existing === undefined) return NextResponse.json({ error: "No such rule." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const merged = { ...toRule(existing), ...body };
  const checked = validateRule(merged, STRATEGY_REFS);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const rule = checked.rule;

  if (rule.mode === "live" && existing.mode !== "live") {
    const refusal = await liveRefusal(resolved.userId);
    if (refusal !== null) return NextResponse.json({ error: refusal }, { status: 400 });
  }

  const { data, error } = await db
    .from("trading_rules")
    .update({
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", resolved.userId)
    .select("*")
    .single();
  if (error !== null || data === null) return NextResponse.json({ error: "The rule could not be saved." }, { status: 503 });
  return NextResponse.json({ rule: toRule(data) });
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such rule." }, { status: 404 });
  const { error } = await serviceClient().from("trading_rules").delete().eq("id", id).eq("user_id", resolved.userId);
  if (error !== null) return NextResponse.json({ error: "The rule could not be deleted." }, { status: 503 });
  return new NextResponse(null, { status: 204 });
}
