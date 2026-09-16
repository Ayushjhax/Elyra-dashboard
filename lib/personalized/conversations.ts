import "server-only";

import { describe as describeError } from "@/lib/supabase/reachability";
import { serviceClient } from "@/lib/supabase/server";
import type {
  PersonalizedAnswer,
  PersonalizedConversation,
  PersonalizedMessage,
} from "@/lib/personalized/types";
import type {
  PersonalizedConversationRow,
  PersonalizedMessageRow,
} from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   What was said, and how much of it to replay.

   The long-conversation rule from the spec lives here: a model request never
   carries the whole transcript. It carries a rolling summary of everything
   older, the last few turns verbatim, and — critically — FRESHLY READ account
   data rather than the figures quoted thirty messages ago.

   That last part is the one that matters financially. A balance stated
   earlier in the conversation is a historical fact about a past moment, and
   an assistant that reasons from it is confidently describing a portfolio
   that no longer exists. Context is rebuilt per turn; only the words persist.

   Every query filters by `user_id`. The service-role client bypasses RLS, so
   that filter is the entire authorization boundary.
--------------------------------------------------------------------------- */

/** Turns replayed verbatim. Older ones reach the model through the summary. */
export const RECENT_WINDOW = 8;

let tableMissing = false;

function noteMissing(reason: string): void {
  if (tableMissing) return;
  tableMissing = true;
  console.warn(
    `\n[elyra] personalized_conversations is unavailable: ${reason}\n` +
      "  Conversations will not persist between turns. Run\n" +
      "  supabase/migrations/0005_personalized.sql to enable them.\n",
  );
}

function missingTable(error: { code?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}

export function conversationsAvailable(): boolean {
  return !tableMissing;
}

/* ---------------------------------------------------------------------------
   Titles

   Derived from the first message rather than by a model call: a title is
   worth roughly nothing and a round trip costs real latency on the very turn
   the operator is waiting on. It is renameable later if that changes.
--------------------------------------------------------------------------- */

export function deriveTitle(firstMessage: string): string {
  const cleaned = firstMessage.trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) return "New conversation";
  const cut = cleaned.length <= 48 ? cleaned : `${cleaned.slice(0, 45).trimEnd()}…`;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

/* ---------------------------------------------------------------------------
   Conversations
--------------------------------------------------------------------------- */

function toConversation(row: PersonalizedConversationRow): PersonalizedConversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listConversations(
  userId: string,
  limit = 30,
): Promise<PersonalizedConversation[]> {
  if (tableMissing) return [];
  try {
    const { data, error } = await serviceClient()
      .from("personalized_conversations")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error !== null) {
      if (missingTable(error)) noteMissing(error.message);
      return [];
    }
    return (data ?? []).map((row) => toConversation(row as PersonalizedConversationRow));
  } catch {
    return [];
  }
}

export async function createConversation(
  userId: string,
  title: string,
): Promise<PersonalizedConversation | null> {
  if (tableMissing) return null;
  try {
    const { data, error } = await serviceClient()
      .from("personalized_conversations")
      .insert({ user_id: userId, title })
      .select("*")
      .single();

    if (error !== null) {
      if (missingTable(error)) noteMissing(error.message);
      return null;
    }
    return toConversation(data as PersonalizedConversationRow);
  } catch {
    return null;
  }
}

/**
 * A conversation, only if this user owns it.
 *
 * The `user_id` filter is why an id guessed from another account returns null
 * rather than that account's transcript.
 */
export async function getConversation(
  userId: string,
  id: string,
): Promise<PersonalizedConversation | null> {
  if (tableMissing) return null;
  try {
    const { data, error } = await serviceClient()
      .from("personalized_conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();

    if (error !== null || data === null) return null;
    return toConversation(data as PersonalizedConversationRow);
  } catch {
    return null;
  }
}

export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  try {
    const { data, error } = await serviceClient()
      .from("personalized_conversations")
      .delete()
      .eq("user_id", userId)
      .eq("id", id)
      .select("id");
    if (error !== null) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * The conversation this turn belongs to, creating one on the first message.
 *
 * Returns null when the store is unavailable — the turn then answers without
 * persistence rather than failing, which is the right trade: an answer the
 * operator can read beats an error about a table.
 */
export async function ensureConversation(
  userId: string,
  conversationId: string | null,
  firstMessage: string,
): Promise<PersonalizedConversation | null> {
  if (conversationId !== null) {
    const existing = await getConversation(userId, conversationId);
    if (existing !== null) return existing;
    /* An id that does not resolve for THIS user starts a new conversation
       rather than erroring: it is either stale or someone else's, and both
       are handled by simply not using it. */
  }
  return createConversation(userId, deriveTitle(firstMessage));
}

/* ---------------------------------------------------------------------------
   Messages
--------------------------------------------------------------------------- */

function toMessage(row: PersonalizedMessageRow): PersonalizedMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    answer: (row.structured as PersonalizedAnswer | null) ?? null,
    createdAt: row.created_at,
  };
}

export async function listMessages(
  userId: string,
  conversationId: string,
  limit = 100,
): Promise<PersonalizedMessage[]> {
  if (tableMissing) return [];
  try {
    const { data, error } = await serviceClient()
      .from("personalized_messages")
      .select("*")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error !== null) {
      if (missingTable(error)) noteMissing(error.message);
      return [];
    }
    return (data ?? []).map((row) => toMessage(row as PersonalizedMessageRow));
  } catch {
    return [];
  }
}

export interface RunMetadata {
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export async function appendMessage(input: {
  userId: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  answer?: PersonalizedAnswer | null;
  run?: RunMetadata;
}): Promise<PersonalizedMessage | null> {
  if (tableMissing) return null;
  try {
    const { data, error } = await serviceClient()
      .from("personalized_messages")
      .insert({
        user_id: input.userId,
        conversation_id: input.conversationId,
        role: input.role,
        content: input.content,
        structured: input.answer ?? null,
        provider: input.run?.provider ?? null,
        model: input.run?.model ?? null,
        latency_ms: input.run?.latencyMs ?? null,
        input_tokens: input.run?.inputTokens ?? null,
        output_tokens: input.run?.outputTokens ?? null,
      })
      .select("*")
      .single();

    if (error !== null) {
      if (missingTable(error)) noteMissing(error.message);
      else console.warn("[personalized] message write failed:", describeError(error));
      return null;
    }

    /* Touch the conversation so the history drawer orders by real activity
       rather than by when the conversation happened to be created. */
    await serviceClient()
      .from("personalized_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("user_id", input.userId)
      .eq("id", input.conversationId);

    return toMessage(data as PersonalizedMessageRow);
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
   The replay window
--------------------------------------------------------------------------- */

export interface ConversationContext {
  /** Everything older than the window, compressed. Null on a short chat. */
  summary: string | null;
  recent: PersonalizedMessage[];
}

/**
 * What the model is given of the conversation so far.
 *
 * The summary is written by `summariseOlder` below and stored on the row, so
 * it is computed once per overflow rather than on every turn.
 */
export async function conversationContext(
  userId: string,
  conversationId: string,
): Promise<ConversationContext> {
  if (tableMissing) return { summary: null, recent: [] };

  const [messages, conversation] = await Promise.all([
    listMessages(userId, conversationId),
    getConversationRow(userId, conversationId),
  ]);

  const recent = messages.slice(-RECENT_WINDOW);
  return { summary: conversation?.summary ?? null, recent };
}

async function getConversationRow(
  userId: string,
  id: string,
): Promise<PersonalizedConversationRow | null> {
  try {
    const { data, error } = await serviceClient()
      .from("personalized_conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error !== null || data === null) return null;
    return data as PersonalizedConversationRow;
  } catch {
    return null;
  }
}

/**
 * Compresses the turns that have fallen out of the replay window.
 *
 * Extractive rather than generative: the first line of each older turn,
 * joined. A model call here would add latency and cost to a turn the operator
 * is already waiting on, to summarise text the model itself wrote. Topic
 * recall is what this is for, and the first line carries it.
 *
 * Financial figures are deliberately NOT preserved: they were true when
 * written and are not now, and the live context block supersedes them.
 */
export async function summariseOlder(
  userId: string,
  conversationId: string,
): Promise<void> {
  if (tableMissing) return;
  const messages = await listMessages(userId, conversationId);
  if (messages.length <= RECENT_WINDOW) return;

  const older = messages.slice(0, -RECENT_WINDOW);
  const lines = older
    .map((message) => {
      const first = message.content.split("\n")[0]?.trim() ?? "";
      if (first.length === 0) return null;
      const who = message.role === "user" ? "They asked" : "Elyra covered";
      return `${who}: ${first.slice(0, 140)}`;
    })
    .filter((line): line is string => line !== null)
    .slice(-24);

  if (lines.length === 0) return;

  const summary =
    "Earlier in this conversation (topics only — any figures mentioned are " +
    "stale and superseded by the live context):\n" +
    lines.join("\n");

  try {
    await serviceClient()
      .from("personalized_conversations")
      .update({ summary: summary.slice(0, 4_000) })
      .eq("user_id", userId)
      .eq("id", conversationId);
  } catch {
    /* A missing summary costs recall, not correctness. */
  }
}
