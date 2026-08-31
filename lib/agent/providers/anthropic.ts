import "server-only";

import { optional, required } from "@/lib/env";
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
  content: string | ContentBlock[];
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
      previous.content.every((entry) => entry.type === "tool_result")
    ) {
      previous.content.push(block);
    } else {
      wire.push({ role: "user", content: [block] });
    }
  }

  return wire;
}

export function anthropicProvider(): Provider {
  const model = optional("ANTHROPIC_MODEL") ?? DEFAULT_MODEL;

  return {
    id: "anthropic",
    model,

    async complete(request: ProviderRequest): Promise<ProviderResult> {
      const apiKey = required("ANTHROPIC_API_KEY");

      const body = {
        model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        /* Two blocks, one breakpoint. Everything before `cache_control` is a
           stable prefix that caches across runs; the per-run user context
           goes after it, where a change costs nothing. One concatenated
           string would invalidate the cache on every single run. */
        system: [
          {
            type: "text",
            text: request.system.stable,
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: request.system.volatile },
        ],
        messages: toWireMessages(request.messages),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        })),
      };

      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": API_VERSION,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(request.timeoutMs ?? PROVIDER_TIMEOUT_MS),
        });
      } catch (error) {
        const timedOut =
          error instanceof DOMException && error.name === "TimeoutError";
        throw new ProviderError(
          timedOut ? "timeout" : "network",
          "anthropic",
          timedOut
            ? `No response within ${request.timeoutMs ?? PROVIDER_TIMEOUT_MS}ms`
            : `Request failed: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }

      if (!response.ok) {
        throw new ProviderError(
          classify(response.status),
          "anthropic",
          `HTTP ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`,
          response.status,
        );
      }

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

      const text: string[] = [];
      const toolCalls: ToolCall[] = [];

      for (const block of payload.content ?? []) {
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

      /* `stop_details` is populated only on a refusal, so it must be read
         behind the stop_reason check rather than trusted to be present. */
      const refused = payload.stop_reason === "refusal";

      return {
        text: text.length > 0 ? text.join("") : null,
        toolCalls,
        provider: "anthropic",
        model: payload.model ?? model,
        usage: {
          input: payload.usage?.input_tokens ?? 0,
          output: payload.usage?.output_tokens ?? 0,
        },
        refused,
        refusalReason: refused
          ? (payload.stop_details?.category ?? "content_policy")
          : null,
      };
    },
  };
}

function classify(status: number): ProviderError["kind"] {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "server_error";
  return "bad_request";
}
