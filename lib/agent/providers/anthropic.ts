import "server-only";

import { optional, required } from "@/lib/env";
import {
  MessageAccumulator,
  StreamError,
  parseSse,
} from "@/lib/agent/providers/anthropic-stream";
import {
  DEFAULT_MAX_TOKENS,
  PROVIDER_TIMEOUT_MS,
  ProviderError,
  type AgentMessage,
  type Provider,
  type ProviderRequest,
  type ProviderResult,
  type ToolCall,
} from "@/lib/agent/providers/types";

/* ---------------------------------------------------------------------------
   Anthropic Messages API.

   Raw HTTP rather than the SDK, so this adapter and the Gemini one are the
   same shape and the difference between them is only the wire format.

   Two entry points over one request: `complete` waits for the whole
   message, `stream` reads it as server-sent events and hands text on as it
   is generated (see anthropic-stream.ts). Both return the provider's own
   content blocks, so the loop can send a tool turn back exactly as it came —
   thinking blocks and their signatures included — rather than rebuilt from
   its text and tool calls.
--------------------------------------------------------------------------- */

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";

interface TextBlock {
  type: "text";
  text: string;
}

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type ResponseBlock = TextBlock | ToolUseBlock | { type: string };

interface MessagesResponse {
  content: ResponseBlock[];
  model: string;
  stop_reason: string | null;
  stop_details: { type: string; category: string | null; explanation?: string } | null;
  usage: { input_tokens: number; output_tokens: number };
}

/* --- request construction ------------------------------------------------ */

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface WireMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[] | unknown[];
}

/**
 * Neutral messages to Anthropic's wire format.
 *
 * The one structural translation: a tool result is not its own role here, it
 * is a `tool_result` block inside a *user* message. Consecutive tool results
 * must be merged into a single user message — splitting them across several
 * teaches the model to stop making parallel calls, which quietly halves the
 * throughput of every multi-tool turn afterwards.
 */
function toWireMessages(messages: AgentMessage[]): WireMessage[] {
  const wire: WireMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      wire.push({ role: "user", content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      /* Our own turn, verbatim. Rebuilding it from text and tool calls would
         drop its thinking blocks, which the continuation is meant to carry. */
      if (message.providerContent?.provider === "anthropic" && message.providerContent.blocks.length > 0) {
        wire.push({ role: "assistant", content: message.providerContent.blocks });
        continue;
      }
      const blocks: ContentBlock[] = [];
      if (message.content.length > 0) {
        blocks.push({ type: "text", text: message.content });
      }
      for (const call of message.toolCalls ?? []) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.arguments,
        });
      }
      /* An assistant turn with neither text nor tool calls is not a legal
         message; skip it rather than send an empty content array. */
      if (blocks.length > 0) wire.push({ role: "assistant", content: blocks });
      continue;
    }

    const block: ContentBlock = {
      type: "tool_result",
      tool_use_id: message.toolCallId,
      content: JSON.stringify(message.result),
    };

    const previous = wire.at(-1);
    if (
      previous !== undefined &&
      previous.role === "user" &&
      Array.isArray(previous.content) &&
      (previous.content as ContentBlock[]).every((entry) => entry.type === "tool_result")
    ) {
      (previous.content as ContentBlock[]).push(block);
    } else {
      wire.push({ role: "user", content: [block] });
    }
  }

  return wire;
}

function requestBody(model: string, request: ProviderRequest, stream: boolean) {
  return {
    model,
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    ...(stream ? { stream: true } : {}),
    /* Two blocks, one breakpoint. Everything before `cache_control` is a
       stable prefix that caches across runs; the per-run user context goes
       after it, where a change costs nothing. One concatenated string would
       invalidate the cache on every single run. */
    system: [
      {
        type: "text",
        text: request.system.stable,
        cache_control: { type: "ephemeral" },
      },
      /* The API rejects an empty text block, so no context means no block. */
      ...(request.system.volatile.trim().length > 0
        ? [{ type: "text", text: request.system.volatile }]
        : []),
    ],
    messages: toWireMessages(request.messages),
    tools: request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    })),
  };
}

/** Sends the request; every transport failure becomes a typed ProviderError. */
async function send(model: string, request: ProviderRequest, stream: boolean): Promise<Response> {
  const apiKey = required("ANTHROPIC_API_KEY");
  const timeoutMs = request.timeoutMs ?? PROVIDER_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify(requestBody(model, request, stream)),
      /* Covers reading the body too, so a stream that stalls is cut off at
         the same budget as a response that never starts. */
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw transportError(error, timeoutMs);
  }

  if (!response.ok) {
    throw new ProviderError(
      classify(response.status),
      "anthropic",
      `HTTP ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`,
      response.status,
    );
  }
  return response;
}

function transportError(error: unknown, timeoutMs: number): ProviderError {
  const timedOut =
    error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
  return new ProviderError(
    timedOut ? "timeout" : "network",
    "anthropic",
    timedOut
      ? `No response within ${timeoutMs}ms`
      : `Request failed: ${error instanceof Error ? error.message : "unknown"}`,
  );
}

/** Content blocks to the neutral result. Shared by both entry points. */
function toResult(
  blocks: ResponseBlock[],
  meta: {
    model: string;
    stopReason: string | null;
    stopDetails: { category?: string | null } | null;
    usage: { input: number; output: number };
    streamed: boolean;
  },
): ProviderResult {
  const text: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of blocks) {
    if (block.type === "text") {
      text.push((block as TextBlock).text);
    } else if (block.type === "tool_use") {
      const use = block as ToolUseBlock;
      toolCalls.push({
        id: use.id,
        name: use.name,
        arguments: use.input ?? {},
      });
    }
  }

  /* `stop_details` is populated only on a refusal, so it must be read behind
     the stop_reason check rather than trusted to be present. */
  const refused = meta.stopReason === "refusal";

  return {
    text: text.length > 0 ? text.join("") : null,
    toolCalls,
    provider: "anthropic",
    model: meta.model,
    usage: meta.usage,
    refused,
    refusalReason: refused ? (meta.stopDetails?.category ?? "content_policy") : null,
    rawContent: blocks,
    streamed: meta.streamed,
  };
}

/** A mid-stream error event, in the router's taxonomy. */
function streamFailure(error: StreamError): ProviderError {
  const kind: ProviderError["kind"] =
    error.type === "rate_limit_error"
      ? "rate_limited"
      : error.type === "invalid_request_error"
        ? "bad_request"
        : error.type === "authentication_error" || error.type === "permission_error"
          ? "auth"
          : "server_error";
  return new ProviderError(kind, "anthropic", `${error.type}: ${error.message}`);
}

export function anthropicProvider(): Provider {
  const model = optional("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;

  return {
    id: "anthropic",
    model,

    async complete(request: ProviderRequest): Promise<ProviderResult> {
      const response = await send(model, request, false);

      let payload: MessagesResponse;
      try {
        payload = (await response.json()) as MessagesResponse;
      } catch {
        throw new ProviderError(
          "malformed_response",
          "anthropic",
          "Response was not valid JSON",
        );
      }

      return toResult(payload.content ?? [], {
        model: payload.model ?? model,
        stopReason: payload.stop_reason,
        stopDetails: payload.stop_details,
        usage: {
          input: payload.usage?.input_tokens ?? 0,
          output: payload.usage?.output_tokens ?? 0,
        },
        streamed: false,
      });
    },

    async stream(request: ProviderRequest, onText: (delta: string) => void): Promise<ProviderResult> {
      const response = await send(model, request, true);
      if (response.body === null) {
        throw new ProviderError("malformed_response", "anthropic", "The stream had no body");
      }

      const accumulator = new MessageAccumulator(onText);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const { events, rest } = parseSse(buffer + decoder.decode(value, { stream: true }));
          buffer = rest;
          for (const event of events) accumulator.apply(event.data);
        }
        /* A final event without its trailing blank line. */
        const { events } = parseSse(buffer + decoder.decode() + "\n\n");
        for (const event of events) accumulator.apply(event.data);
      } catch (error) {
        if (error instanceof StreamError) throw streamFailure(error);
        throw transportError(error, request.timeoutMs ?? PROVIDER_TIMEOUT_MS);
      }

      const outcome = accumulator.outcome();
      if (outcome.stopReason === null) {
        throw new ProviderError("malformed_response", "anthropic", "The stream ended before the message did");
      }

      return toResult(outcome.blocks as unknown as ResponseBlock[], {
        model: outcome.model ?? model,
        stopReason: outcome.stopReason,
        stopDetails: outcome.stopDetails,
        usage: outcome.usage,
        streamed: true,
      });
    },
  };
}

function classify(status: number): ProviderError["kind"] {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "server_error";
  return "bad_request";
}
