import { NextResponse } from "next/server";
import { automationUser } from "@/lib/autotrade/session";
import { validateSet } from "@/lib/copy/rules";
import { UUID } from "@/lib/copy/session";
import { assignRules, setRefusal } from "@/lib/copy/sets";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   One rule set: PATCH changes its name, description, rules or whether it is
   shared (re-validated whole); DELETE removes it, and its rules stay as they
   are, in no set. Unsharing or deleting stops new copies; a follower's
   copies already open still close when the rule's position does.
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
  if (!UUID.test(id)) return NextResponse.json({ error: "No such set." }, { status: 404 });

  const db = serviceClient();
  const { data: existing } = await db.from("trading_rule_sets").select("*").eq("id", id).eq("user_id", resolved.userId).eq("house", false).maybeSingle();
  if (existing === null || existing === undefined) return NextResponse.json({ error: "No such set." }, { status: 404 });
  const { data: current } = await db.from("trading_rules").select("id").eq("user_id", resolved.userId).eq("set_id", id);

  const checked = validateSet((await request.json().catch(() => ({}))) as Record<string, unknown>, {
    name: existing.name,
    description: existing.description,
    ruleIds: (current ?? []).map((rule) => rule.id),
    published: existing.published,
  });
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const set = checked.set;
  const refusal = await setRefusal(resolved.userId, set);
  if (refusal !== null) return NextResponse.json({ error: refusal }, { status: 400 });

  const { error } = await db
    .from("trading_rule_sets")
    .update({ name: set.name, description: set.description, published: set.published, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", resolved.userId);
  if (error !== null || !(await assignRules(resolved.userId, id, set.ruleIds))) {
    return NextResponse.json({ error: "The set could not be saved." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such set." }, { status: 404 });
  const { error } = await serviceClient().from("trading_rule_sets").delete().eq("id", id).eq("user_id", resolved.userId).eq("house", false);
  if (error !== null) return NextResponse.json({ error: "The set could not be deleted." }, { status: 503 });
  return new Response(null, { status: 204 });
}
