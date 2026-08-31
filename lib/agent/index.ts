import "server-only";

import { buildSystemPrompt } from "@/lib/agent/prompt";
import { route, type RoutedResult } from "@/lib/agent/providers/router";
import {
  DEFAULT_MAX_TOKENS,
  type AgentMessage,
  type ToolCall,
} from "@/lib/agent/providers/types";
import {
  executeTool,
  toolDefinitions,
  type ToolContext,
} from "@/lib/agent/tools/registry";
import { maxRunsPerDay } from "@/lib/env";
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
/** Enough recent turns for continuity without resending an entire history. */
const HISTORY_LIMIT = 20;

export interface RunAgentInput {
  userId: string;
  conversationId: string;
  message: string;
  surface: Surface;
  /** The Privy wallet, for the address-keyed Hyperliquid read. */
  sessionWallet?: string | null;
}

export interface RunAgentResult {
  reply: string;
  runId: string;
}

export class UsageLimitError extends Error {
  readonly runs: number;
  readonly limit: number;

  constructor(runs: number, limit: number) {
    super(
      `You have used all ${limit} agent runs for today. The counter resets at ` +
        "00:00 UTC.",
    );
    this.name = "UsageLimitError";
    this.runs = runs;
    this.limit = limit;
  }
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
    .select("role, content, tool_calls")
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
      if (content.length > 0) messages.push({ role: "assistant", content });
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
  const limit = maxRunsPerDay();

  /* Check and increment atomically, before any model spend. A read-then-write
     here would let two concurrent runs both pass the last available slot. */
  const claim = await db.rpc("claim_agent_run", {
    p_user_id: input.userId,
    p_limit: limit,
  });
  if (claim.error) throw claim.error;

  const claimed = claim.data?.[0];
  if (claimed && !claimed.allowed) {
    throw new UsageLimitError(claimed.runs, limit);
  }

  const context: ToolContext = {
    userId: input.userId,
    sessionWallet: input.sessionWallet ?? null,
  };

  const [history, system] = await Promise.all([
    loadHistory(input.conversationId, input.userId),
    buildSystemPrompt(context),
  ]);

  const messages: AgentMessage[] = [
    ...history,
    { role: "user", content: input.message },
  ];

  await persistMessage({
    conversationId: input.conversationId,
    userId: input.userId,
    role: "user",
    content: input.message,
  });

  const tools = toolDefinitions();

  let iterations = 0;
  let ranLong = false;
  let last: RoutedResult | null = null;
  let replyText: string | null = null;
  let failure: string | null = null;

  try {
    while (iterations < MAX_ITERATIONS) {
      const remaining = WALL_CLOCK_MS - (Date.now() - startedAt);
      if (remaining <= 0) {
        ranLong = true;
        break;
      }

      iterations += 1;

      const result = await route({
        system,
        messages,
        tools,
        maxTokens: DEFAULT_MAX_TOKENS,
        /* Never let one provider call outlive the run's own budget. */
        timeoutMs: Math.min(remaining, 30_000),
      });
      last = result;

      if (result.refused) {
        replyText =
          result.text ??
          "I can't answer that one. The request was declined on content policy grounds.";
        break;
      }

      if (result.toolCalls.length === 0) {
        replyText = result.text;
        break;
      }

      messages.push({
        role: "assistant",
        content: result.text ?? "",
        toolCalls: result.toolCalls,
      });

      const { messages: toolMessages, results } = await runTools(
        result.toolCalls,
        context,
      );
      messages.push(...toolMessages);

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
    failure = error instanceof Error ? error.message : "Agent run failed";
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
    replyText =
      "Something went wrong reaching the model, so I have no answer for that " +
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

  return { reply, runId: run.data?.id ?? "" };
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
