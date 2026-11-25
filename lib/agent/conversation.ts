import "server-only";

import type { RoutedResult } from "@/lib/agent/providers/router";
import type { AgentMessage } from "@/lib/agent/providers/types";
import { serviceClient } from "@/lib/supabase/server";
import type { Surface } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   A conversation's storage: the turns read back as history, each turn
   written as it happens, and the one run row per question.

   Shared by `runAgent` and `runTeam`, so both remember a conversation the
   same way and a person moving between them reads one history. Every read
   and write is scoped by `user_id` in the query: this client bypasses RLS.
--------------------------------------------------------------------------- */

/** Enough recent turns for continuity without resending an entire history. */
const HISTORY_LIMIT = 20;
/**
 * Past this, a past turn's prices are old enough to mislead.
 *
 * Older assistant replies are dropped rather than annotated. Annotating them
 * worked — the model stopped quoting stale prices — but it also taught it the
 * marker, and replies started opening with "[sent just now]" and
 * "[fetched just now]". Anything written into an assistant turn is a pattern
 * the model will reproduce, so the fix is to remove the stale figures, not to
 * label them. The user messages around them stay, which is what carries the
 * conversation's intent.
 */
const STALE_AFTER_MS = 30 * 60_000;

/** The last turns of a conversation, oldest first. */
export async function loadHistory(
  conversationId: string,
  userId: string,
): Promise<AgentMessage[]> {
  /* Scoped by user_id as well as conversation_id. The conversation id alone
     would be enough if it were unguessable, but "unguessable" is not an
     access control and this client bypasses RLS. */
  const { data, error } = await serviceClient()
    .from("messages")
    .select("role, content, tool_calls, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) throw error;

  const rows = (data ?? []).reverse();
  const messages: AgentMessage[] = [];

  for (const row of rows) {
    if (row.role === "user") {
      messages.push({ role: "user", content: row.content ?? "" });
    } else if (row.role === "assistant") {
      /* Tool rounds are not replayed. Re-sending a previous turn's tool calls
         without their results would leave dangling calls the provider
         rejects, and the text of that turn already carries its conclusions. */
      const content = row.content ?? "";
      if (content.length === 0) continue;

      const age = row.created_at ? Date.now() - Date.parse(row.created_at) : 0;
      if (Number.isFinite(age) && age > STALE_AFTER_MS) continue;

      messages.push({ role: "assistant", content });
    }
  }

  return messages;
}

export async function persistMessage(row: {
  conversationId: string;
  userId: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  toolCalls?: unknown;
  toolResults?: unknown;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
}): Promise<void> {
  await serviceClient()
    .from("messages")
    .insert({
      conversation_id: row.conversationId,
      user_id: row.userId,
      role: row.role,
      content: row.content,
      tool_calls: row.toolCalls ?? null,
      tool_results: row.toolResults ?? null,
      provider: row.provider ?? null,
      model: row.model ?? null,
      input_tokens: row.inputTokens ?? null,
      output_tokens: row.outputTokens ?? null,
      latency_ms: row.latencyMs ?? null,
    });
}

/**
 * One row per run, whether it succeeded or not, and the conversation marked
 * as just used. `fell_back` and `fallback_reason` are what make the Anthropic
 * failure rate observable. Returns the run's id, or "" when it was not stored.
 */
export async function recordRun(run: {
  userId: string;
  conversationId: string;
  surface: Surface;
  last: RoutedResult | null;
  iterations: number;
  latencyMs: number;
  error: string | null;
}): Promise<string> {
  const db = serviceClient();
  const inserted = await db
    .from("agent_runs")
    .insert({
      user_id: run.userId,
      conversation_id: run.conversationId,
      surface: run.surface,
      primary_provider: run.last?.primaryProvider ?? "anthropic",
      final_provider: run.last?.provider ?? null,
      fell_back: run.last?.fellBack ?? false,
      fallback_reason: run.last?.fallbackReason ?? null,
      tool_iterations: run.iterations,
      total_latency_ms: run.latencyMs,
      error: run.error,
    })
    .select("id")
    .single();

  await db
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", run.conversationId)
    .eq("user_id", run.userId);

  return inserted.data?.id ?? "";
}
