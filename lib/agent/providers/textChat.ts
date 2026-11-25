import "server-only";

import {
  PROVIDER_TIMEOUT_MS,
  DEFAULT_MAX_TOKENS,
  ProviderError,
  type ProviderId,
  type ProviderRequest,
} from "@/lib/agent/providers/types";

/* ---------------------------------------------------------------------------
   What the text-only adapters share — Cohere and the OpenAI-compatible hosts.

   They sit at the Desk (lib/desk), where every member reads one fact sheet
   and writes one answer: no tools, no attachments, no streaming. So a request
   flattens to a system prompt and alternating user and assistant text, and
   anything else is refused as a bad request rather than half-sent — a tool
   call silently dropped would be a different question asked.
--------------------------------------------------------------------------- */

export interface TextMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function textMessages(provider: ProviderId, request: ProviderRequest): TextMessage[] {
  if (request.tools.length > 0) throw new ProviderError("bad_request", provider, "This provider is seated without tools.");
  const system = [request.system.stable, request.system.volatile].filter((part) => part.trim().length > 0).join("\n\n");
  const messages: TextMessage[] = system.length > 0 ? [{ role: "system", content: system }] : [];
  for (const message of request.messages) {
    if (message.role === "tool") throw new ProviderError("bad_request", provider, "This provider is seated without tools.");
    if (message.role === "user" && (message.attachments?.length ?? 0) > 0) {
      throw new ProviderError("bad_request", provider, "This provider is seated without attachments.");
    }
    messages.push({ role: message.role, content: message.content });
  }
  return messages;
}

export function classifyStatus(status: number): ProviderError["kind"] {
  if (status === 429 || status === 503) return "rate_limited";
  if (status === 401 || status === 403 || status === 498) return "auth";
  if (status >= 500) return "server_error";
  return "bad_request";
}

/** POSTs JSON; every transport failure and every non-2xx becomes a typed ProviderError. Never echoes a key. */
export async function postJson(provider: ProviderId, url: string, headers: Record<string, string>, body: unknown, request: ProviderRequest): Promise<unknown> {
  const timeoutMs = request.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new ProviderError(timedOut ? "timeout" : "network", provider, timedOut ? `No answer within ${timeoutMs}ms` : "Could not be reached");
  }
  if (!response.ok) {
    /* The body is summarised, not echoed: a provider that reflects the request would reflect the key with it. */
    const text = (await response.text().catch(() => "")).replace(/(Bearer\s+)?[A-Za-z0-9_-]{24,}/g, "[redacted]").slice(0, 200);
    throw new ProviderError(classifyStatus(response.status), provider, `HTTP ${response.status}: ${text}`, response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderError("malformed_response", provider, "Response was not valid JSON");
  }
}

export const maxTokensOf = (request: ProviderRequest) => Math.min(request.maxTokens ?? DEFAULT_MAX_TOKENS, DEFAULT_MAX_TOKENS);
