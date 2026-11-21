import "server-only";
import type { AgentEvent } from "@/lib/agent/events";

import { loadHistory, persistMessage, recordRun } from "@/lib/agent/conversation";
import { toolLoop } from "@/lib/agent/loop";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import type { AgentMessage } from "@/lib/agent/providers/types";
import { toolDefinitions } from "@/lib/agent/tools/registry";
import { sourcesFrom } from "@/lib/agent/sources";
import { RAN_LONG_REPLY, failureReply, storedQuestion, toolContextFor } from "@/lib/agent/turn";
import type { Attachment } from "@/lib/attachments";
import { claimAgentRun, UsageLimitError } from "@/lib/agent/quota";
import { serviceClient } from "@/lib/supabase/server";
import type { Surface } from "@/lib/supabase/types";
import type { Locale } from "@/lib/i18n/locales";

/* ---------------------------------------------------------------------------
   runAgent — the whole system.

   Both surfaces call this and nothing else. Neither contains prompt text,
   tool definitions, or provider logic; a third surface would call this same
   function with a different `surface` value.

   The website asks a team instead (`runTeam`, lib/agent/team): the same
   tools, prompt rules, history and run cap, worked by several members
   around one shared board. Telegram and the Android app call this.
--------------------------------------------------------------------------- */

/** Iterations, not tool calls: one iteration may run several tools at once. */
const MAX_ITERATIONS = 6;
const WALL_CLOCK_MS = 45_000;
/**
 * A run that reads a PDF or a screenshot spends longer before its first
 * token and writes longer answers, so it gets more room — still well inside
 * the function's own limit.
 */
const ATTACHMENT_WALL_CLOCK_MS = 90_000;
const ATTACHMENT_CALL_TIMEOUT_MS = 75_000;

export interface RunAgentInput {
  userId: string;
  conversationId: string;
  message: string;
  surface: Surface;
  /** The Privy wallet, for the address-keyed Hyperliquid read. */
  sessionWallet?: string | null;
  /** The Solana address, for the wallet and DeFi reads. */
  solanaAddress?: string | null;
  /** Files sent with this message, already validated by the surface. */
  attachments?: Attachment[];
  /** The website reader's language; the reply is written in it. English when absent. */
  locale?: Locale;
  /**
   * Progress, for a surface that can show it as it happens. The web streams
   * these; Telegram passes nothing and gets the finished reply as before.
   */
  onEvent?: (event: AgentEvent) => void;
}

export type { AgentEvent };
export { claimAgentRun, UsageLimitError };
export { runTeam, type RunTeamInput, type RunTeamResult } from "@/lib/agent/team";

export interface RunAgentResult {
  reply: string;
  runId: string;
  /** Where the figures in the reply came from, read from the tool results. */
  sources: string[];
}

/* ------------------------------------------------------------------------- */

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const startedAt = Date.now();

  /* Check and increment atomically, before any model spend. A read-then-write
     here would let two concurrent runs both pass the last available slot. */
  await claimAgentRun(input.userId);

  const context = await toolContextFor(input);

  const [history, system] = await Promise.all([
    loadHistory(input.conversationId, input.userId),
    buildSystemPrompt(context),
  ]);

  const attachments = input.attachments ?? [];
  const messages: AgentMessage[] = [
    ...history,
    { role: "user", content: input.message, ...(attachments.length > 0 ? { attachments } : {}) },
  ];

  await persistMessage({
    conversationId: input.conversationId,
    userId: input.userId,
    role: "user",
    content: storedQuestion(input.message, attachments),
  });

  const emit = input.onEvent;

  const loop = await toolLoop({
    system,
    messages,
    tools: toolDefinitions(),
    context,
    maxIterations: MAX_ITERATIONS,
    wallClockMs: attachments.length > 0 ? ATTACHMENT_WALL_CLOCK_MS : WALL_CLOCK_MS,
    startedAt,
    callTimeoutMs: attachments.length > 0 ? ATTACHMENT_CALL_TIMEOUT_MS : 30_000,
    onText: emit === undefined ? undefined : (delta) => emit({ type: "text", delta }),
    onTools: emit === undefined ? undefined : (labels) => emit({ type: "tools", labels }),
    onToolRound: ({ result, results }) =>
      persistMessage({
        conversationId: input.conversationId,
        userId: input.userId,
        role: "tool",
        content: result.text,
        toolCalls: result.toolCalls,
        toolResults: results,
        provider: result.provider,
        model: result.model,
        inputTokens: result.usage.input,
        outputTokens: result.usage.output,
      }),
  });

  const { last, failure, ranLong } = loop;
  const latencyMs = Date.now() - startedAt;

  let replyText = loop.replyText;
  if (replyText === null && failure === null && ranLong) {
    /* The cap was hit mid-investigation. Returning what there is beats
       returning nothing, but it has to be labelled as incomplete. */
    replyText = last?.text ?? RAN_LONG_REPLY;
  }
  if (failure !== null) replyText = failureReply(failure, attachments.length > 0);

  const reply = (replyText ?? "").trim() || "I have no answer for that one.";

  await persistMessage({
    conversationId: input.conversationId,
    userId: input.userId,
    role: "assistant",
    content: reply,
    provider: last?.provider ?? null,
    model: last?.model ?? null,
    inputTokens: last?.usage.input ?? null,
    outputTokens: last?.usage.output ?? null,
    latencyMs,
  });

  const runId = await recordRun({
    userId: input.userId,
    conversationId: input.conversationId,
    surface: input.surface,
    last,
    iterations: loop.iterations,
    latencyMs,
    error: failure ?? (ranLong ? "exceeded_budget" : null),
  });

  return {
    reply,
    runId,
    /* No sources on a failed run: the reply says nothing was answered. */
    sources: failure === null ? sourcesFrom(loop.toolResults) : [],
  };
}

/* ------------------------------------------------------------------------- */

/**
 * The conversation for a surface, created on first use.
 *
 * Web keeps one thread per user; Telegram keeps one per chat, so a user in
 * two chats has two histories rather than one interleaved and confusing one.
 */
export async function ensureConversation(options: {
  userId: string;
  surface: Surface;
  telegramChatId?: number | null;
}): Promise<string> {
  const db = serviceClient();
  const chatId = options.telegramChatId ?? null;

  let query = db
    .from("conversations")
    .select("id")
    .eq("user_id", options.userId)
    .eq("surface", options.surface)
    .order("last_message_at", { ascending: false })
    .limit(1);

  query =
    chatId === null
      ? query.is("telegram_chat_id", null)
      : query.eq("telegram_chat_id", chatId);

  const existing = await query.maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;

  const created = await db
    .from("conversations")
    .insert({
      user_id: options.userId,
      surface: options.surface,
      telegram_chat_id: chatId,
    })
    .select("id")
    .single();

  if (created.error) throw created.error;
  return created.data.id;
}
