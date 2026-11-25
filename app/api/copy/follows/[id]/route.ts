import { NextResponse } from "next/server";
import { liveRefusal } from "@/lib/autotrade/liveGate";
import { automationUser } from "@/lib/autotrade/session";
import { num } from "@/lib/autotrade/store";
import { validateFollow } from "@/lib/copy/rules";
import { UUID } from "@/lib/copy/session";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   One copy: PATCH pauses or resumes it or changes its terms (re-validated
   whole); DELETE stops it. Neither closes anything: copies already open keep
   their take-profit and stop-loss and still close when the leader closes.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such copy." }, { status: 404 });

  const db = serviceClient();
  const { data: existing } = await db.from("copy_follows").select("*").eq("id", id).eq("user_id", resolved.userId).maybeSingle();
  if (existing === null || existing === undefined) return NextResponse.json({ error: "No such copy." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = validateFollow(body, {
    sizeUsd: num(existing.size_usd),
    maxLeverage: existing.max_leverage,
    mode: existing.mode,
    maxDriftPct: num(existing.max_drift_pct),
  });
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") return NextResponse.json({ error: "Choose on or off." }, { status: 400 });
  const terms = checked.terms;

  if (terms.mode === "live" && existing.mode !== "live") {
    const refusal = await liveRefusal(resolved.userId);
    if (refusal !== null) return NextResponse.json({ error: refusal }, { status: 400 });
  }

  const { error } = await db
    .from("copy_follows")
    .update({
      size_usd: terms.sizeUsd,
      max_leverage: terms.maxLeverage,
      mode: terms.mode,
      max_drift_pct: terms.maxDriftPct,
      enabled: typeof body.enabled === "boolean" ? body.enabled : existing.enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", resolved.userId);
  if (error !== null) return NextResponse.json({ error: "The copy could not be saved." }, { status: 503 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such copy." }, { status: 404 });
  const { error } = await serviceClient().from("copy_follows").delete().eq("id", id).eq("user_id", resolved.userId);
  if (error !== null) return NextResponse.json({ error: "The copy could not be stopped." }, { status: 503 });
  return new Response(null, { status: 204 });
}
