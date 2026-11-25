import "server-only";

import { maxTokensOf, postJson, textMessages } from "@/lib/agent/providers/textChat";
import { ProviderError, type Provider, type ProviderRequest, type ProviderResult } from "@/lib/agent/providers/types";

/* ---------------------------------------------------------------------------
   Cohere, through its v2 Chat API (docs.cohere.com/reference/chat, read
   2026-11-17): POST https://api.cohere.com/v2/chat with a bearer key.

   - The system prompt is a message with role "system"; there is no
     top-level field for it.
   - The text is `message.content[]` items of type "text" (a reasoning model
     can also return "thinking" items, which are not the answer and are
     skipped). Usage is `usage.tokens.{input_tokens, output_tokens}`.
   - `finish_reason` is upper case: COMPLETE, STOP_SEQUENCE, MAX_TOKENS,
     TOOL_CALL, ERROR, TIMEOUT. ERROR and TIMEOUT are failures, not answers.
   - 429 is the rate limit and 503 "too many users"; both may be retried
     elsewhere. 498 is a deny-listed token, treated as a refusal of access.

   Text only: the Desk asks for JSON in the prompt rather than through
   `response_format`, so every seat is asked the same way.
--------------------------------------------------------------------------- */

const ENDPOINT = "https://api.cohere.com/v2/chat";

interface ChatResponse {
  finish_reason?: string;
  message?: { content?: Array<{ type?: string; text?: string }> };
  usage?: { tokens?: { input_tokens?: number; output_tokens?: number } };
}

export function cohereProvider(model: string, apiKey: string): Provider {
  return {
    id: "cohere",
    model,
    async complete(request: ProviderRequest): Promise<ProviderResult> {
      const body = {
        model,
        stream: false,
        messages: textMessages("cohere", request),
        max_tokens: maxTokensOf(request),
        temperature: 0.3,
      };
      const payload = (await postJson("cohere", ENDPOINT, { authorization: `Bearer ${apiKey}` }, body, request)) as ChatResponse;
      const finish = (payload.finish_reason ?? "").toUpperCase();
      if (finish === "ERROR" || finish === "TIMEOUT") throw new ProviderError("server_error", "cohere", `finish_reason ${finish}`);
      if (!Array.isArray(payload.message?.content)) throw new ProviderError("malformed_response", "cohere", "No message content");
      const text = payload.message.content
        .filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text as string)
        .join("")
        .trim();
      return {
        text: text.length > 0 ? text : null,
        toolCalls: [],
        provider: "cohere",
        model,
        usage: { input: payload.usage?.tokens?.input_tokens ?? 0, output: payload.usage?.tokens?.output_tokens ?? 0 },
        refused: false,
        refusalReason: null,
      };
    },
  };
}
