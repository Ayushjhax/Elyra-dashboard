import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { cohereProvider } = await import("@/lib/agent/providers/cohere");
const { openAICompatibleProvider } = await import("@/lib/agent/providers/openaiCompatible");
const { ProviderError } = await import("@/lib/agent/providers/types");

/* ---------------------------------------------------------------------------
   The Desk's text-only adapters: what goes on the wire, what is read back,
   and how a failure is named — the router's and the Desk's rules are written
   against `kind`, so a mislabelled failure would be retried or hidden.
--------------------------------------------------------------------------- */

const request = (overrides: Record<string, unknown> = {}) => ({
  system: { stable: "You are the Quant.", volatile: "" },
  messages: [{ role: "user" as const, content: "Facts..." }],
  tools: [],
  maxTokens: 600,
  timeoutMs: 1_000,
  ...overrides,
});

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Cohere v2 chat", () => {
  it("sends the system prompt as a system message with a bearer key, and reads only the text items", async () => {
    const fetchMock = answer(200, {
      finish_reason: "COMPLETE",
      message: { role: "assistant", content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: '{"p_up": 61}' }] },
      usage: { tokens: { input_tokens: 71, output_tokens: 12 } },
    });
    const result = await cohereProvider("command-a-plus-05-2026", "co-key").complete(request());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cohere.com/v2/chat");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer co-key");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "command-a-plus-05-2026",
      stream: false,
      max_tokens: 600,
      messages: [
        { role: "system", content: "You are the Quant." },
        { role: "user", content: "Facts..." },
      ],
    });
    expect(result).toMatchObject({ text: '{"p_up": 61}', provider: "cohere", model: "command-a-plus-05-2026", usage: { input: 71, output: 12 }, refused: false });
  });

  it("treats ERROR and TIMEOUT as failures, and names each HTTP failure", async () => {
    answer(200, { finish_reason: "ERROR", message: { content: [] } });
    await expect(cohereProvider("m", "k").complete(request())).rejects.toMatchObject({ kind: "server_error" });
    answer(429, { message: "Too many requests" });
    await expect(cohereProvider("m", "k").complete(request())).rejects.toMatchObject({ kind: "rate_limited", status: 429 });
    answer(401, { message: "invalid api token" });
    await expect(cohereProvider("m", "k").complete(request())).rejects.toMatchObject({ kind: "auth" });
    answer(404, { message: "model not found" });
    await expect(cohereProvider("m", "k").complete(request())).rejects.toMatchObject({ kind: "bad_request" });
  });

  it("refuses tools rather than drop them", async () => {
    answer(200, {});
    await expect(cohereProvider("m", "k").complete(request({ tools: [{ name: "x", description: "", parameters: { type: "object" } }] }))).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("OpenAI-compatible hosts", () => {
  it("posts to the host's chat completions with its headers, and records the model that answered", async () => {
    const fetchMock = answer(200, {
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      choices: [{ finish_reason: "stop", message: { content: '{"p_up": 44}' } }],
      usage: { prompt_tokens: 300, completion_tokens: 20 },
    });
    const provider = openAICompatibleProvider({ baseUrl: "https://openrouter.ai/api/v1/", apiKey: "or-key", model: "openrouter/free", headers: { "X-Title": "Elyra" } });
    const result = await provider.complete(request());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers).toMatchObject({ authorization: "Bearer or-key", "X-Title": "Elyra" });
    expect(JSON.parse(init.body as string)).not.toHaveProperty("response_format");
    expect(result).toMatchObject({ text: '{"p_up": 44}', model: "nvidia/nemotron-3-ultra-550b-a55b:free", provider: "openai_compatible", usage: { input: 300, output: 20 } });
  });

  it("surfaces a content filter or a refusal as a refusal", async () => {
    answer(200, { choices: [{ finish_reason: "content_filter", message: { content: null } }] });
    const filtered = await openAICompatibleProvider({ baseUrl: "https://api.groq.com/openai/v1", apiKey: "k", model: "m" }).complete(request());
    expect(filtered).toMatchObject({ refused: true, refusalReason: "content_filter", text: null });
  });

  it("never echoes a key from an error page", async () => {
    answer(400, "bad request for key sk-abcdefghijklmnopqrstuvwxyz123456");
    const error: unknown = await openAICompatibleProvider({ baseUrl: "https://api.mistral.ai/v1", apiKey: "k", model: "m" })
      .complete(request())
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ kind: "bad_request", status: 400 });
    expect(String((error as Error).message)).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("names a timeout as one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }),
    );
    await expect(openAICompatibleProvider({ baseUrl: "https://x/v1", apiKey: "k", model: "m" }).complete(request())).rejects.toMatchObject({ kind: "timeout" });
  });
});
