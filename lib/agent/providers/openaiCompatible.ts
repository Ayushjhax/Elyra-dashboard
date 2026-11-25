import "server-only";

import { maxTokensOf, postJson, textMessages } from "@/lib/agent/providers/textChat";
import { ProviderError, type Provider, type ProviderRequest, type ProviderResult } from "@/lib/agent/providers/types";

/* ---------------------------------------------------------------------------
   Any host that speaks OpenAI's Chat Completions shape: POST
   {baseUrl}/chat/completions with a bearer key, `messages` with system /
   user / assistant roles, the answer at `choices[0].message.content`.

   The Desk seats several through it — Groq and Mistral (free tiers),
   OpenRouter (whose `openrouter/free` routes to a free model), and OpenAI
   (paid). Each is configured in lib/desk/roster.ts by base URL, key and
   model; nothing here knows which host it is talking to.

   - `finish_reason: "content_filter"` is a refusal, surfaced as one.
   - A host that routes to another model reports the model that answered in
     `model`; that, not the one asked for, is what gets recorded.
   - No `response_format`: free routed models do not all support it, and a
     400 for asking would cost the seat its vote. JSON is asked for in the
     prompt and parsed leniently by the Desk.
--------------------------------------------------------------------------- */

interface CompletionResponse {
  model?: string;
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface CompatibleHost {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Extra headers a host asks for, e.g. OpenRouter's attribution. */
  headers?: Record<string, string>;
}

export function openAICompatibleProvider(host: CompatibleHost): Provider {
  const url = `${host.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return {
    id: "openai_compatible",
    model: host.model,
    async complete(request: ProviderRequest): Promise<ProviderResult> {
      const body = {
        model: host.model,
        messages: textMessages("openai_compatible", request),
        max_tokens: maxTokensOf(request),
        temperature: 0.3,
        stream: false,
      };
      const payload = (await postJson("openai_compatible", url, { authorization: `Bearer ${host.apiKey}`, ...host.headers }, body, request)) as CompletionResponse;
      const choice = payload.choices?.[0];
      if (choice === undefined) throw new ProviderError("malformed_response", "openai_compatible", "No choices");
      const refusal = choice.message?.refusal ?? null;
      const filtered = choice.finish_reason === "content_filter";
      const text = typeof choice.message?.content === "string" ? choice.message.content.trim() : "";
      return {
        text: text.length > 0 ? text : null,
        toolCalls: [],
        provider: "openai_compatible",
        model: typeof payload.model === "string" && payload.model.length > 0 ? payload.model : host.model,
        usage: { input: payload.usage?.prompt_tokens ?? 0, output: payload.usage?.completion_tokens ?? 0 },
        refused: refusal !== null || filtered,
        refusalReason: refusal ?? (filtered ? "content_filter" : null),
      };
    },
  };
}
