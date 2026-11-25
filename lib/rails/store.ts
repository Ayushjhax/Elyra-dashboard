import "server-only";

import { appUrl } from "@/lib/env";
import { GENESIS_HASH, ledgerHash } from "@/lib/rails/ledger";
import { intentSummary } from "@/lib/rails/policy";
import { fromBase, solanaPayUrl } from "@/lib/rails/solanaPay";
import type {
  IntentParams,
  IntentView,
  LedgerEvent,
  Mandate,
  PaymentRequestView,
  Screening,
} from "@/lib/rails/types";
import { serviceClient } from "@/lib/supabase/server";
import type { AgentIntentRow, AgentMandateRow, PaymentRequestRow, RailsLedgerRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Agent rails, the database half: the ledger chain, mandates, intents and
   payment requests. Every read and write is scoped by user in the query
   itself — the service-role client bypasses RLS, so a missing filter here is
   caught by nothing downstream.
--------------------------------------------------------------------------- */

export const MIGRATION = "Agent rails need database migration 0024, which has not been applied.";

const num = (value: number | string | null): number | null => (value === null ? null : Number(value));

/* ---------------------------------------------------------------------------
   The ledger
--------------------------------------------------------------------------- */

export type Actor = "person" | "elyra" | `agent:${string}`;

/**
 * Appends one event to the person's chain and returns its hash.
 *
 * The head is read, the next event is hashed onto it, and the insert is
 * refused by the database if anything else took that position first
 * (unique seq and unique predecessor) — in which case it reads the new head
 * and tries again. A chain written this way cannot fork or skip.
 */
export async function appendLedger(
  userId: string,
  entry: { actor: Actor; event: string; subjectId: string | null; body: Record<string, unknown> },
): Promise<string | null> {
  const db = serviceClient();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const head = await db.from("rails_ledger").select("seq, hash").eq("user_id", userId).order("seq", { ascending: false }).limit(1).maybeSingle();
    if (head.error !== null) return null;
    const seq = (head.data?.seq ?? 0) + 1;
    const prevHash = head.data?.hash ?? GENESIS_HASH;
    const at = new Date().toISOString();
    const hash = ledgerHash({ prevHash, seq, at, actor: entry.actor, event: entry.event, subjectId: entry.subjectId, body: entry.body });
    const inserted = await db.from("rails_ledger").insert({
      user_id: userId,
      seq,
      occurred_at: at,
      actor: entry.actor,
      event: entry.event,
      subject_id: entry.subjectId,
      body: entry.body,
      prev_hash: prevHash,
      hash,
    });
    if (inserted.error === null) return hash;
    if (inserted.error.code !== "23505") return null;
  }
  return null;
}

function toEvent(row: RailsLedgerRow): LedgerEvent {
  return {
    seq: Number(row.seq),
    at: row.occurred_at,
    actor: row.actor,
    event: row.event,
    subjectId: row.subject_id,
    body: row.body,
    prevHash: row.prev_hash,
    hash: row.hash,
  };
}

/** The whole chain, in order, for verification and export. */
export async function readLedger(userId: string): Promise<LedgerEvent[] | null> {
  const db = serviceClient();
  const out: LedgerEvent[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await db
      .from("rails_ledger")
      .select("*")
      .eq("user_id", userId)
      .order("seq", { ascending: true })
      .range(from, from + 999);
    if (page.error !== null) return null;
    out.push(...(page.data ?? []).map((row) => toEvent(row as RailsLedgerRow)));
    if ((page.data ?? []).length < 1000) return out;
  }
}

/* ---------------------------------------------------------------------------
   Mandates
--------------------------------------------------------------------------- */

export function toMandate(row: AgentMandateRow): Mandate {
  return {
    id: row.id,
    keyId: row.key_id,
    kinds: row.kinds,
    assets: row.assets,
    perIntentUsd: Number(row.per_intent_usd),
    dailyUsd: Number(row.daily_usd),
    payees: row.payees ?? [],
    autoPerps: row.auto_perps,
    livePerps: row.live_perps,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The live mandate on a key, or null. */
export async function mandateFor(userId: string, keyId: string): Promise<Mandate | null> {
  const { data } = await serviceClient()
    .from("agent_mandates")
    .select("*")
    .eq("user_id", userId)
    .eq("key_id", keyId)
    .is("revoked_at", null)
    .maybeSingle();
  return data === null || data === undefined ? null : toMandate(data as AgentMandateRow);
}

/* ---------------------------------------------------------------------------
   Intents
--------------------------------------------------------------------------- */

export function toIntent(row: AgentIntentRow, agent: string): IntentView {
  const params = row.params as unknown as IntentParams;
  return {
    id: row.id,
    keyId: row.key_id,
    agent,
    kind: row.kind,
    params,
    summary: intentSummary(params),
    usdValue: num(row.usd_value),
    status: row.status,
    reasons: row.reasons ?? [],
    memo: row.memo,
    screening: (row.screening as unknown as Screening | null) ?? null,
    result: row.result,
    receipt: row.receipt,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    decidedAt: row.decided_at,
    settledAt: row.settled_at,
  };
}

/** Today's (UTC) dollars a key's intents hold against its cap, and how many wait for review. */
export async function keyUsage(userId: string, keyId: string, now: number): Promise<{ spentTodayUsd: number; pending: number }> {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await serviceClient()
    .from("agent_intents")
    .select("usd_value, status")
    .eq("user_id", userId)
    .eq("key_id", keyId)
    .gte("created_at", start.toISOString())
    .in("status", ["pending", "approved", "executed"]);
  const rows = (data ?? []) as Array<{ usd_value: number | string | null; status: string }>;
  return {
    spentTodayUsd: rows.reduce((sum, row) => sum + (num(row.usd_value) ?? 0), 0),
    pending: rows.filter((row) => row.status === "pending").length,
  };
}

/** Agent names by key id, for the console and notifications. */
export async function keyNames(userId: string): Promise<Map<string, string>> {
  const { data } = await serviceClient().from("agent_keys").select("id, name").eq("user_id", userId);
  return new Map(((data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
}

/* ---------------------------------------------------------------------------
   Payment requests
--------------------------------------------------------------------------- */

export function toRequest(row: PaymentRequestRow, agent: string | null): PaymentRequestView {
  const amount = fromBase(row.amount_base, row.decimals);
  return {
    id: row.id,
    label: row.label,
    memo: row.memo,
    recipient: row.recipient,
    mint: row.mint,
    amount,
    status: row.status,
    solanaPayUrl: solanaPayUrl({ recipient: row.recipient, amount, mint: row.mint, reference: row.reference, label: row.label, message: row.memo }),
    payUrl: `${appUrl().replace(/\/$/, "")}/pay/${row.id}`,
    paidSignature: row.paid_signature,
    paidBy: row.paid_by,
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    agent,
  };
}
