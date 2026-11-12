import "server-only";
import type { AgentEvent } from "@/lib/agent/events";

import { buildSystemPrompt } from "@/lib/agent/prompt";
import { route, type RoutedResult } from "@/lib/agent/providers/router";
import {
  DEFAULT_MAX_TOKENS,
  ProviderError,
  type AgentMessage,
  type ToolCall,
} from "@/lib/agent/providers/types";
import {
  executeTool,
  toolDefinitions,
  type ToolContext,
} from "@/lib/agent/tools/registry";
import { sourcesFrom, toolLabel } from "@/lib/agent/sources";
import { describeAttachments, type Attachment } from "@/lib/attachments";
import { claimAgentRun, UsageLimitError } from "@/lib/agent/quota";
import { predictionAccount } from "@/lib/prediction/account";
import { serviceClient } from "@/lib/supabase/server";
import type { Surface } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   runAgent — the whole system.

   Both surfaces call this and nothing else. Neither contains prompt text,
   tool definitions, or provider logic; a third surface would call this same
   function with a different `surface` value.
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
  /**
   * Progress, for a surface that can show it as it happens. The web streams
   * these; Telegram passes nothing and gets the finished reply as before.
   */
  onEvent?: (event: AgentEvent) => void;
}

export type { AgentEvent };
export { claimAgentRun, UsageLimitError };

export interface RunAgentResult {
  reply: string;
  runId: string;
  /** Where the figures in the reply came from, read from the tool results. */
  sources: string[];
}

/* ------------------------------------------------------------------------- */

/** The last turns of a conversation, oldest first. */
async function loadHistory(
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


async function persistMessage(row: {
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

/** Runs one turn's tool calls together and returns them as tool messages. */
async function runTools(
  calls: ToolCall[],
  context: ToolContext,
): Promise<{ messages: AgentMessage[]; results: unknown[] }> {
  /* allSettled, not all: one failing tool must not discard the results of the
     others that succeeded in the same turn. executeTool already converts a
     throw into a result, so a rejection here is a bug rather than a tool
     failure — but it is still not worth losing the turn over. */
  const settled = await Promise.allSettled(
    calls.map((call) => executeTool(call.name, call.arguments, context)),
  );

  const messages: AgentMessage[] = [];
  const results: unknown[] = [];

  settled.forEach((outcome, index) => {
    const call = calls[index];
    const result =
      outcome.status === "fulfilled"
        ? outcome.value.result
        : { error: "Tool did not complete." };

    results.push({ name: call.name, result });
    messages.push({
      role: "tool",
      toolCallId: call.id,
      name: call.name,
      result,
    });
  });

  return { messages, results };
}

/* ------------------------------------------------------------------------- */

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const startedAt = Date.now();
  const db = serviceClient();

  /* Check and increment atomically, before any model spend. A read-then-write
     here would let two concurrent runs both pass the last available slot. */
  await claimAgentRun(input.userId);

  const context: ToolContext = {
    userId: input.userId,
    sessionWallet: input.sessionWallet ?? null,
    solanaAddress: input.solanaAddress ?? null,
    /* Resolved from the profile rather than passed in: it is an identity,
       and identities do not travel through request bodies here. */
    polymarketAddress: (await predictionAccount(input.userId))?.address ?? null,
    /* The operator's words this turn, which the tools that change anything
       are held to. Never the model's text, and never a tool result's. */
    operatorMessage: input.message,
  };

  const [history, system] = await Promise.all([
    loadHistory(input.conversationId, input.userId),
    buildSystemPrompt(context),
  ]);

  const attachments = input.attachments ?? [];
  const messages: AgentMessage[] = [
    ...history,
    { role: "user", content: input.message, ...(attachments.length > 0 ? { attachments } : {}) },
  ];

  /* The files are not stored — only that they were sent, so a later turn
     knows something was attached and does not pretend to still see it. */
  const noted = describeAttachments(attachments);
  await persistMessage({
    conversationId: input.conversationId,
    userId: input.userId,
    role: "user",
    content: noted.length === 0 ? input.message : `${input.message}\n\n${noted}`.trim(),
  });

  const wallClockMs = attachments.length > 0 ? ATTACHMENT_WALL_CLOCK_MS : WALL_CLOCK_MS;
  const callTimeoutMs = attachments.length > 0 ? ATTACHMENT_CALL_TIMEOUT_MS : 30_000;

  const tools = toolDefinitions();

  const emit = input.onEvent;
  const toolResults: Array<{ name: string; result: unknown }> = [];

  let iterations = 0;
  let ranLong = false;
  let last: RoutedResult | null = null;
  let replyText: string | null = null;
  let failure: string | null = null;

  try {
    while (iterations < MAX_ITERATIONS) {
      const remaining = wallClockMs - (Date.now() - startedAt);
      if (remaining <= 0) {
        ranLong = true;
        break;
      }

      iterations += 1;

      const result = await route(
        {
          system,
          messages,
          tools,
          maxTokens: DEFAULT_MAX_TOKENS,
          /* Never let one provider call outlive the run's own budget. */
          timeoutMs: Math.min(remaining, callTimeoutMs),
        },
        undefined,
        emit === undefined ? undefined : (delta) => emit({ type: "text", delta }),
      );
      last = result;

      if (result.refused) {
        replyText =
          result.text ??
          "I can't answer that one. The request was declined on content policy grounds.";
        break;
      }

      if (result.toolCalls.length === 0) {
        replyText = result.text;
        /* A fallback provider answers whole; the surface still gets it. */
        if (!result.streamed && result.text) emit?.({ type: "text", delta: result.text });
        break;
      }

      emit?.({ type: "tools", labels: [...new Set(result.toolCalls.map((call) => toolLabel(call.name)))] });

      messages.push({
        role: "assistant",
        content: result.text ?? "",
        toolCalls: result.toolCalls,
        ...(result.rawContent !== undefined
          ? { providerContent: { provider: result.provider, blocks: result.rawContent } }
          : {}),
      });

      const { messages: toolMessages, results } = await runTools(
        result.toolCalls,
        context,
      );
      messages.push(...toolMessages);
      toolResults.push(...(results as Array<{ name: string; result: unknown }>));

      await persistMessage({
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
      });

      /* Ran out of iterations with tool calls still pending. */
      if (iterations >= MAX_ITERATIONS) ranLong = true;
    }
  } catch (error) {
    /* Record the failure *kind*, not just the message. Reading agent_runs
       later, "bad_request" and "timeout" call for completely different
       responses, and the message alone does not distinguish them. */
    failure =
      error instanceof ProviderError
        ? `${error.kind}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Agent run failed";
  }

  const latencyMs = Date.now() - startedAt;

  if (replyText === null && failure === null && ranLong) {
    /* The cap was hit mid-investigation. Returning what there is beats
       returning nothing, but it has to be labelled as incomplete. */
    replyText =
      last?.text ??
      "I ran out of time working through that one and stopped before " +
        "finishing. Ask again, or narrow it to a single symbol.";
  }

  if (failure !== null) {
    /* A 400 on a turn with files is almost always the file: too many PDF
       pages, an image too large. Saying so is the difference between the
       person fixing it and retrying the same thing. */
    replyText =
      attachments.length > 0 && failure.startsWith("bad_request")
        ? "The model could not read that attachment. PDFs can be up to 100 pages " +
          "and images up to 8000 pixels on a side. Nothing was changed."
        : "Something went wrong reaching the model, so I have no answer for that " +
          "one. Nothing was changed.";
  }

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

  /* One row per run, whether it succeeded or not. fell_back and
     fallback_reason are what make the Anthropic failure rate observable. */
  const run = await db
    .from("agent_runs")
    .insert({
      user_id: input.userId,
      conversation_id: input.conversationId,
      surface: input.surface,
      primary_provider: last?.primaryProvider ?? "anthropic",
      final_provider: last?.provider ?? null,
      fell_back: last?.fellBack ?? false,
      fallback_reason: last?.fallbackReason ?? null,
      tool_iterations: iterations,
      total_latency_ms: latencyMs,
      error: failure ?? (ranLong ? "exceeded_budget" : null),
    })
    .select("id")
    .single();

  await db
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", input.conversationId)
    .eq("user_id", input.userId);

  return {
    reply,
    runId: run.data?.id ?? "",
    /* No sources on a failed run: the reply says nothing was answered. */
    sources: failure === null ? sourcesFrom(toolResults) : [],
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
