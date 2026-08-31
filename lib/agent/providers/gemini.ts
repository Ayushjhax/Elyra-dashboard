import "server-only";

import {
  collapseDuplicateToolCalls,
  sanitizeSchemaForGemini,
} from "@/lib/agent/providers/schema";
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
import { optional, requireFor } from "@/lib/env";

/* ---------------------------------------------------------------------------
   Gemini generateContent.

   Three differences from Anthropic that are not cosmetic:

   1. The assistant role is called "model".
   2. A tool result is a `functionResponse` part matched to its call by NAME.
      There is no call id on the wire — see collapseDuplicateToolCalls.
   3. The schema parser rejects most of JSON Schema — see
      sanitizeSchemaForGemini.
--------------------------------------------------------------------------- */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-pro";

interface FunctionCallPart {
  functionCall: { name: string; args: Record<string, unknown> };
}
interface TextPart {
  text: string;
}
type ResponsePart = TextPart | FunctionCallPart | Record<string, unknown>;

interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: ResponsePart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

type RequestPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface Content {
  role: "user" | "model";
  parts: RequestPart[];
}

/**
 * A functionResponse must carry a JSON object. Tool results here are often
 * arrays or scalars, which Gemini rejects outright, so anything that is not
 * a plain object is wrapped.
 */
function asObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { result: value };
}

function toContents(messages: AgentMessage[]): Content[] {
  const contents: Content[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      contents.push({ role: "user", parts: [{ text: message.content }] });
      continue;
    }

    if (message.role === "assistant") {
      const parts: RequestPart[] = [];
      if (message.content.length > 0) parts.push({ text: message.content });
      for (const call of message.toolCalls ?? []) {
        parts.push({
          functionCall: { name: call.name, args: call.arguments },
        });
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }

    /* Tool results are user-role parts, and consecutive ones merge into a
       single turn — same reason as the Anthropic adapter. */
    const part: RequestPart = {
      functionResponse: {
        name: message.name,
        response: asObject(message.result),
      },
    };

    const previous = contents.at(-1);
    if (
      previous !== undefined &&
      previous.role === "user" &&
      previous.parts.every((entry) => "functionResponse" in entry)
    ) {
      previous.parts.push(part);
    } else {
      contents.push({ role: "user", parts: [part] });
    }
  }

  return contents;
}

export function geminiProvider(): Provider {
  const model = optional("GEMINI_MODEL") ?? DEFAULT_MODEL;

  return {
    id: "gemini",
    model,

    async complete(request: ProviderRequest): Promise<ProviderResult> {
      const apiKey = requireFor("GEMINI_API_KEY", "the Gemini fallback provider");

      const body = {
        /* Gemini has no cache-breakpoint concept on this endpoint, so the two
           halves are simply concatenated. The split still matters upstream —
           it is what lets the Anthropic adapter cache. */
        systemInstruction: {
          parts: [
            { text: `${request.system.stable}\n\n${request.system.volatile}` },
          ],
        },
        contents: toContents(request.messages),
        tools:
          request.tools.length > 0
            ? [
                {
                  functionDeclarations: request.tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    parameters: sanitizeSchemaForGemini(tool.parameters),
                  })),
                },
              ]
            : undefined,
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        },
      };

      let response: Response;
      try {
        response = await fetch(
          `${BASE}/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              /* The key goes in a header rather than the query string, which
                 keeps it out of request logs and error URLs. */
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(
              request.timeoutMs ?? PROVIDER_TIMEOUT_MS,
            ),
          },
        );
      } catch (error) {
        const timedOut =
          error instanceof DOMException && error.name === "TimeoutError";
        throw new ProviderError(
          timedOut ? "timeout" : "network",
          "gemini",
          timedOut
            ? `No response within ${request.timeoutMs ?? PROVIDER_TIMEOUT_MS}ms`
            : `Request failed: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }

      if (!response.ok) {
        throw new ProviderError(
          classify(response.status),
          "gemini",
          `HTTP ${response.status}: ${(await response.text().catch(() => "")).slice(0, 300)}`,
          response.status,
        );
      }

      let payload: GenerateContentResponse;
      try {
        payload = (await response.json()) as GenerateContentResponse;
      } catch {
        throw new ProviderError(
          "malformed_response",
          "gemini",
          "Response was not valid JSON",
        );
      }

      const candidate = payload.candidates?.[0];
      const text: string[] = [];
      const rawCalls: ToolCall[] = [];

      for (const part of candidate?.content?.parts ?? []) {
        if ("text" in part && typeof part.text === "string") {
          text.push(part.text);
        } else if ("functionCall" in part) {
          const call = (part as FunctionCallPart).functionCall;
          rawCalls.push({
            /* Synthesised: Gemini sends no id, and the loop needs one to pair
               a result with its call internally. It never goes back on the
               wire — the name is what Gemini matches on. */
            id: `gemini-${call.name}`,
            name: call.name,
            arguments: call.args ?? {},
          });
        }
      }

      const { calls: toolCalls } = collapseDuplicateToolCalls(rawCalls);

      /* SAFETY on the candidate, or a blockReason on the prompt, is Gemini's
         equivalent of a refusal. The router must surface it, not retry. */
      const blocked =
        candidate?.finishReason === "SAFETY" ||
        candidate?.finishReason === "PROHIBITED_CONTENT" ||
        payload.promptFeedback?.blockReason !== undefined;

      return {
        text: text.length > 0 ? text.join("") : null,
        toolCalls,
        provider: "gemini",
        model,
        usage: {
          input: payload.usageMetadata?.promptTokenCount ?? 0,
          output: payload.usageMetadata?.candidatesTokenCount ?? 0,
        },
        refused: blocked,
        refusalReason: blocked
          ? (payload.promptFeedback?.blockReason ??
            candidate?.finishReason ??
            "safety")
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
