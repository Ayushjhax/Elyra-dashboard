import { NextResponse } from "next/server";
import { automationUser } from "@/lib/autotrade/session";
import { tablesMissing } from "@/lib/autotrade/store";
import { COPY_LIMITS, validateSet } from "@/lib/copy/rules";
import { assignRules, setRefusal } from "@/lib/copy/sets";
import { MIGRATION_NOTE } from "@/lib/copy/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Groups some of the person's rules into a set, shared or not. A rule is in
   one set at most: putting it here takes it out of any other.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;

  const checked = validateSet((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const set = checked.set;

  const db = serviceClient();
  const { count, error: countError } = await db.from("trading_rule_sets").select("id", { count: "exact", head: true }).eq("user_id", resolved.userId);
  if (countError !== null) return NextResponse.json({ error: tablesMissing(countError) ? MIGRATION_NOTE : "Sets could not be read." }, { status: 503 });
  if ((count ?? 0) >= COPY_LIMITS.maxSetsPerAccount) {
    return NextResponse.json({ error: `An account can have ${COPY_LIMITS.maxSetsPerAccount} sets. Delete one first.` }, { status: 400 });
  }
  const refusal = await setRefusal(resolved.userId, set);
  if (refusal !== null) return NextResponse.json({ error: refusal }, { status: 400 });

  const { data, error } = await db
    .from("trading_rule_sets")
    .insert({ user_id: resolved.userId, name: set.name, description: set.description, published: set.published, house: false })
    .select("id")
    .single();
  if (error !== null || data === null) return NextResponse.json({ error: "The set could not be saved." }, { status: 503 });
  if (!(await assignRules(resolved.userId, data.id, set.ruleIds))) {
    return NextResponse.json({ error: "The set was saved, but its rules could not be added. Try again." }, { status: 503 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
