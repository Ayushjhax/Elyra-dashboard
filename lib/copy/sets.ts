import "server-only";

import type { SetInput } from "@/lib/copy/rules";
import { handleOf } from "@/lib/copy/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   The checks a rule set's write needs beyond its shape (`validateSet`):
   every rule is the person's own, and sharing needs an Arena handle — a
   shared set is shown by its owner's handle and never by a wallet.
--------------------------------------------------------------------------- */

export async function setRefusal(userId: string, set: SetInput): Promise<string | null> {
  if (set.ruleIds.length > 0) {
    const { data } = await serviceClient().from("trading_rules").select("id").eq("user_id", userId).in("id", set.ruleIds);
    if ((data ?? []).length !== set.ruleIds.length) return "Choose rules from your own.";
  }
  if (set.published && (await handleOf(userId)) === null) return "Choose an Arena handle first: a shared set is shown by your handle, never your wallet.";
  return null;
}

/** Puts exactly `ruleIds` of the person's rules in the set; any other rule of theirs leaves it. */
export async function assignRules(userId: string, setId: string, ruleIds: string[]): Promise<boolean> {
  const db = serviceClient();
  const cleared = await db.from("trading_rules").update({ set_id: null }).eq("user_id", userId).eq("set_id", setId);
  if (cleared.error !== null) return false;
  if (ruleIds.length === 0) return true;
  const assigned = await db.from("trading_rules").update({ set_id: setId }).eq("user_id", userId).in("id", ruleIds);
  return assigned.error === null;
}
