import "server-only";

import { NextResponse } from "next/server";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";
import { verifyChain } from "@/lib/rails/ledger";
import { validateMandate } from "@/lib/rails/policy";
import { appendLedger, keyNames, keyUsage, MIGRATION, readLedger, toIntent, toMandate, toRequest } from "@/lib/rails/store";
import type { AgentWithMandate, Mandate, RailsResponse } from "@/lib/rails/types";
import { isSolanaAddress } from "@/lib/solana/address";
import { serviceClient } from "@/lib/supabase/server";
import type { AgentIntentRow, AgentKeyRow, AgentMandateRow, PaymentRequestRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The console's side of the rails: who is asking (the verified session,
   never the body), everything the Agents page shows in one read, and the
   person's own changes to their agents' mandates — each written to the
   ledger, so the record shows not only what agents did but what they were
   allowed to do at the time.
--------------------------------------------------------------------------- */

export async function railsUser(request: Request): Promise<{ response: Response } | { userId: string; solanaAddress: string | null }> {
  const user = await getSessionUser(request);
  if (user === null) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (!hasProfile(user)) return { response: NextResponse.json({ error: databaseUnavailableMessage("Agents") }, { status: 503 }) };
  return {
    userId: user.userId,
    solanaAddress: user.solanaAddress !== null && isSolanaAddress(user.solanaAddress) ? user.solanaAddress : null,
  };
}

/** How many recent ledger events the console shows; the export has them all. */
const SHOWN_EVENTS = 40;

export async function railsState(userId: string): Promise<RailsResponse> {
  const db = serviceClient();
  const now = Date.now();
  const [keys, mandates, intents, requests, ledger] = await Promise.all([
    db.from("agent_keys").select("*").eq("user_id", userId).is("revoked_at", null).order("created_at", { ascending: false }),
    db.from("agent_mandates").select("*").eq("user_id", userId).is("revoked_at", null),
    db.from("agent_intents").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(60),
    db.from("payment_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    readLedger(userId),
  ]);
  if (mandates.error !== null || intents.error !== null || requests.error !== null || ledger === null) {
    return { agents: [], intents: [], requests: [], ledger: { events: [], verification: { ok: true, count: 0, head: "" } }, error: MIGRATION };
  }

  const names = new Map(((keys.data ?? []) as AgentKeyRow[]).map((row) => [row.id, row.name]));
  const byKey = new Map(((mandates.data ?? []) as AgentMandateRow[]).map((row) => [row.key_id, toMandate(row)]));
  const agents: AgentWithMandate[] = await Promise.all(
    ((keys.data ?? []) as AgentKeyRow[]).map(async (row) => ({
      keyId: row.id,
      name: row.name,
      prefix: row.prefix,
      lastUsedAt: row.last_used_at,
      mandate: byKey.get(row.id) ?? null,
      spentTodayUsd: byKey.has(row.id) ? (await keyUsage(userId, row.id, now)).spentTodayUsd : 0,
    })),
  );
  /* A revoked key's past intents keep its name. */
  const allNames = names.size === 0 ? new Map<string, string>() : await keyNames(userId);
  const nameOf = (keyId: string | null) => (keyId === null ? null : (names.get(keyId) ?? allNames.get(keyId) ?? "A revoked agent"));

  return {
    agents,
    intents: ((intents.data ?? []) as AgentIntentRow[]).map((row) => toIntent(row, nameOf(row.key_id) ?? "An agent")),
    requests: ((requests.data ?? []) as PaymentRequestRow[]).map((row) => toRequest(row, nameOf(row.key_id))),
    ledger: { events: ledger.slice(-SHOWN_EVENTS).reverse(), verification: verifyChain(ledger) },
    error: null,
  };
}

/** Grants or replaces the mandate on one of the person's live keys. */
export async function saveMandate(userId: string, input: Record<string, unknown>): Promise<{ ok: true; mandate: Mandate } | { ok: false; error: string; status: number }> {
  const keyId = typeof input.keyId === "string" ? input.keyId : "";
  const db = serviceClient();
  const { data: key } = await db.from("agent_keys").select("id").eq("id", keyId).eq("user_id", userId).is("revoked_at", null).maybeSingle();
  if (key === null || key === undefined) return { ok: false, error: "No live agent key with that id.", status: 404 };

  const checked = validateMandate(input);
  if ("error" in checked) return { ok: false, error: checked.error, status: 400 };
  const value = checked.mandate;
  const now = new Date();

  /* Replaced, not edited: the old grant is closed and a new one opened, so
     the ledger and the table both show what was allowed when. */
  await db.from("agent_mandates").update({ revoked_at: now.toISOString() }).eq("user_id", userId).eq("key_id", keyId).is("revoked_at", null);
  const { data, error } = await db
    .from("agent_mandates")
    .insert({
      user_id: userId,
      key_id: keyId,
      kinds: value.kinds,
      assets: value.assets,
      per_intent_usd: value.perIntentUsd,
      daily_usd: value.dailyUsd,
      payees: value.payees,
      auto_perps: value.autoPerps,
      live_perps: value.livePerps,
      expires_at: value.expiresInDays === null ? null : new Date(now.getTime() + value.expiresInDays * 86_400_000).toISOString(),
    })
    .select("*")
    .single();
  if (error !== null || data === null) return { ok: false, error: error?.code === "42P01" ? MIGRATION : "The mandate could not be saved.", status: 503 };
  const mandate = toMandate(data as AgentMandateRow);

  await appendLedger(userId, {
    actor: "person",
    event: "mandate.granted",
    subjectId: mandate.id,
    body: {
      keyId,
      kinds: mandate.kinds,
      assets: mandate.assets,
      perIntentUsd: String(mandate.perIntentUsd),
      dailyUsd: String(mandate.dailyUsd),
      payees: mandate.payees,
      autoPerps: mandate.autoPerps,
      livePerps: mandate.livePerps,
      expiresAt: mandate.expiresAt,
    },
  });
  return { ok: true, mandate };
}

export async function revokeMandate(userId: string, id: string): Promise<boolean> {
  const { data } = await serviceClient()
    .from("agent_mandates")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("key_id");
  const row = (data ?? [])[0] as { key_id: string } | undefined;
  if (row === undefined) return false;
  await appendLedger(userId, { actor: "person", event: "mandate.revoked", subjectId: id, body: { keyId: row.key_id } });
  return true;
}
