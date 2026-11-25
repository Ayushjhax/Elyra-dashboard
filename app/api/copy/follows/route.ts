import { NextResponse } from "next/server";
import { liveRefusal } from "@/lib/autotrade/liveGate";
import { automationUser } from "@/lib/autotrade/session";
import { tablesMissing } from "@/lib/autotrade/store";
import { COPY_LIMITS, validateFollow } from "@/lib/copy/rules";
import { UUID } from "@/lib/copy/session";
import { MIGRATION_NOTE } from "@/lib/copy/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Starts copying a shared rule set. Its terms are held to `validateFollow`;
   live is refused unless this server sends live orders and the person's
   trading key is approved, as for a rule. Nobody copies their own set.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.leaderId !== "string" || !UUID.test(body.leaderId)) return NextResponse.json({ error: "Choose a set to copy." }, { status: 400 });
  const checked = validateFollow(body);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const terms = checked.terms;

  const db = serviceClient();
  const { data: set, error: setError } = await db.from("trading_rule_sets").select("*").eq("id", body.leaderId).maybeSingle();
  if (setError !== null) return NextResponse.json({ error: tablesMissing(setError) ? MIGRATION_NOTE : "The set could not be read." }, { status: 503 });
  if (set === null || set === undefined || !set.published) return NextResponse.json({ error: "That set is not shared." }, { status: 404 });
  if (set.user_id === resolved.userId) return NextResponse.json({ error: "That set is yours; your rules already trade it." }, { status: 400 });

  if (terms.mode === "live") {
    const refusal = await liveRefusal(resolved.userId);
    if (refusal !== null) return NextResponse.json({ error: refusal }, { status: 400 });
  }

  const { count } = await db.from("copy_follows").select("id", { count: "exact", head: true }).eq("user_id", resolved.userId);
  if ((count ?? 0) >= COPY_LIMITS.maxFollowsPerAccount) {
    return NextResponse.json({ error: `You can copy ${COPY_LIMITS.maxFollowsPerAccount} sets at once. Stop one first.` }, { status: 400 });
  }

  const { data, error } = await db
    .from("copy_follows")
    .insert({
      user_id: resolved.userId,
      set_id: set.id,
      size_usd: terms.sizeUsd,
      max_leverage: terms.maxLeverage,
      mode: terms.mode,
      max_drift_pct: terms.maxDriftPct,
      enabled: true,
      last_note: "Waiting for the leader's next entry.",
    })
    .select("id")
    .single();
  if (error !== null || data === null) {
    if (error?.code === "23505") return NextResponse.json({ error: "You already copy this set." }, { status: 409 });
    return NextResponse.json({ error: tablesMissing(error) ? MIGRATION_NOTE : "The copy could not be saved." }, { status: 503 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
