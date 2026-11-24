import "server-only";

import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Saved deep research (0033): what the `deep_research` tool gathered, and
   the report the agent then wrote from it, kept so the person can come back
   to it without asking again. Scoped by user_id in every query — the
   service-role client bypasses RLS and nothing else would catch a missing
   filter.
--------------------------------------------------------------------------- */

/** Facts are bounded: a report is a summary, not an archive of every candle. */
const MAX_FACTS_CHARS = 60_000;
const MAX_REPLY_CHARS = 20_000;

export interface MarketReportLine {
  id: string;
  subject: string;
  createdAt: string;
  written: boolean;
}

export interface MarketReport extends MarketReportLine {
  facts: Record<string, unknown>;
  reply: string | null;
}

/** Saves what was gathered; null when it could not be (the table is missing, or the facts too large). */
export async function saveMarketReport(userId: string, subject: string, facts: Record<string, unknown>): Promise<string | null> {
  if (JSON.stringify(facts).length > MAX_FACTS_CHARS) return null;
  const { data, error } = await serviceClient()
    .from("market_reports")
    .insert({ user_id: userId, subject: subject.slice(0, 80), facts })
    .select("id")
    .maybeSingle();
  if (error !== null || data === null) return null;
  return data.id;
}

/**
 * Attaches the finished reply to the reports this person's run saved —
 * those created since the run began and not yet written. Called by the chat
 * route once the reply is final, so a report is the words the person read.
 */
export async function attachReply(userId: string, since: string, reply: string): Promise<void> {
  if (reply.trim().length === 0) return;
  await serviceClient()
    .from("market_reports")
    .update({ reply: reply.slice(0, MAX_REPLY_CHARS), replied_at: new Date().toISOString() })
    .eq("user_id", userId)
    .gte("created_at", since)
    .is("reply", null);
}

export async function listMarketReports(userId: string, limit = 30): Promise<MarketReportLine[] | null> {
  const { data, error } = await serviceClient()
    .from("market_reports")
    .select("id, subject, created_at, reply")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error !== null) return null;
  return (data ?? []).map((row) => ({ id: row.id, subject: row.subject, createdAt: row.created_at, written: row.reply !== null }));
}

export async function getMarketReport(userId: string, id: string): Promise<MarketReport | null> {
  const { data, error } = await serviceClient()
    .from("market_reports")
    .select("id, subject, facts, reply, created_at")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error !== null || data === null) return null;
  return { id: data.id, subject: data.subject, createdAt: data.created_at, written: data.reply !== null, facts: data.facts, reply: data.reply };
}
