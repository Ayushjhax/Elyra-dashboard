import { afterEach, describe, expect, it, vi } from "vitest";
import { UpstreamError, fetchJson } from "@/lib/market/http";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
});

async function failureFor(status: number): Promise<UpstreamError> {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("refused", { status })));
  try {
    await fetchJson({ source: "binance", url: "https://example.test" });
  } catch (error) {
    if (error instanceof UpstreamError) return error;
  }
  throw new Error("expected an UpstreamError");
}

describe("fetchJson failures", () => {
  /* Binance refuses US addresses with 451; Vercel runs in the US. Treating
     that as final left every 24h change blank in production instead of
     falling through to OKX and Hyperliquid. */
  it("treats a location block as worth another source", async () => {
    for (const status of [451, 403]) {
      const error = await failureFor(status);
      expect(error.kind).toBe("blocked");
      expect(error.retryable).toBe(true);
    }
  });

  it("does not retry a malformed request elsewhere", async () => {
    const error = await failureFor(400);
    expect(error.kind).toBe("client_error");
    expect(error.retryable).toBe(false);
  });

  it("retries rate limits and server errors", async () => {
    expect((await failureFor(429)).retryable).toBe(true);
    expect((await failureFor(502)).retryable).toBe(true);
  });
});
