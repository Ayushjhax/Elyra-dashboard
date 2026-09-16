import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codeForStatus, fail, isRetryable, ok } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Provider layer.

   §84 asks every adapter to be exercised against happy path, malformed JSON,
   provider error, timeout, 401/403, 429 and normalization — with upstream
   mocked, never called for real. `fetch` is stubbed per test.

   The failure each test guards against is the same one: a provider problem
   turning into a confident wrong number. A 401 that becomes an empty wallet,
   a 429 that becomes a zero price, a malformed body that throws through an
   aggregate and takes five healthy providers down with it.
--------------------------------------------------------------------------- */

const OK_PRICE = {
  "So11111111111111111111111111111111111111112": {
    usdPrice: 96.76,
    decimals: 9,
    priceChange24h: -5.47,
    liquidity: 828_312_541,
  },
};

const MINT = "So11111111111111111111111111111111111111112";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  process.env.JUPITER_API_KEY = "test-key-not-a-real-credential";
  process.env.BIRDEYE_API_KEY = "test-key-not-a-real-credential";

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const { resetProviderHealth, clearProviderCache } = await import("@/lib/providers/http");
  resetProviderHealth();
  clearProviderCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.JUPITER_API_KEY;
  delete process.env.BIRDEYE_API_KEY;
});

/* ------------------------------------------------------------------------- */

describe("result envelope", () => {
  it("marks only transient codes retryable", () => {
    expect(isRetryable("RATE_LIMIT")).toBe(true);
    expect(isRetryable("UPSTREAM_TIMEOUT")).toBe(true);
    /* A bad key does not become good by asking again, and a plan gap is not
       a blip — retrying either forever is pure waste. */
    expect(isRetryable("AUTH")).toBe(false);
    expect(isRetryable("INVALID_REQUEST")).toBe(false);
    expect(isRetryable("UNSUPPORTED")).toBe(false);
  });

  it("maps 403 to AUTH, because a plan gap is not a transient fault", () => {
    expect(codeForStatus(401)).toBe("AUTH");
    expect(codeForStatus(403)).toBe("AUTH");
    expect(codeForStatus(429)).toBe("RATE_LIMIT");
    expect(codeForStatus(404)).toBe("NOT_FOUND");
    expect(codeForStatus(500)).toBe("UPSTREAM_UNAVAILABLE");
    expect(codeForStatus(400)).toBe("INVALID_REQUEST");
  });

  it("never carries data on a failure", () => {
    const result = fail<number[]>("jupiter", "AUTH", "nope");
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
  });

  it("stamps every success with a time", () => {
    expect(() => new Date(ok([], "jupiter").asOf).toISOString()).not.toThrow();
  });
});

describe("providerFetch", () => {
  it("returns normalized data on success", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ hello: "world" }));
    const { providerFetch } = await import("@/lib/providers/http");

    const result = await providerFetch<{ hello: string }>({
      provider: "jupiter",
      url: "https://example.test/x",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ hello: "world" });
  });

  it("turns malformed JSON into a failure rather than throwing", async () => {
    /* An aggregate reading six providers must not die because one returned
       an HTML error page. */
    fetchMock.mockResolvedValue(new Response("<html>gateway error</html>", { status: 200 }));
    const { providerFetch } = await import("@/lib/providers/http");

    const result = await providerFetch({ provider: "birdeye", url: "https://example.test/x" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("does not retry an auth failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "no permission" }, 401));
    const { providerFetch } = await import("@/lib/providers/http");

    const result = await providerFetch({ provider: "birdeye", url: "https://example.test/x" });
    expect(result.error?.code).toBe("AUTH");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and succeeds on a later attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(jsonResponse({ fine: true }));
    const { providerFetch } = await import("@/lib/providers/http");

    const result = await providerFetch({ provider: "birdeye", url: "https://example.test/x" });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a timeout as a timeout", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    const { providerFetch } = await import("@/lib/providers/http");

    const result = await providerFetch({
      provider: "jupiter",
      url: "https://example.test/x",
      timeoutMs: 10,
      attempts: 1,
    });
    expect(result.error?.code).toBe("UPSTREAM_TIMEOUT");
  });

  it("never leaks a response body verbatim into the error message", async () => {
    /* Provider error pages echo request parameters, and a key in a query
       string would come straight back out into a log or a prompt. */
    const secret = "supersecretvalue123";
    fetchMock.mockResolvedValue(new Response(`request failed for key=${secret}`, { status: 401 }));
    const { providerFetch } = await import("@/lib/providers/http");

    const result = await providerFetch({ provider: "birdeye", url: "https://example.test/x" });
    expect(result.error?.message).not.toContain(secret);
  });

  it("opens a circuit after repeated failures and stops calling", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const { providerFetch, providerHealth } = await import("@/lib/providers/http");

    for (let index = 0; index < 4; index += 1) {
      await providerFetch({ provider: "kamino", url: "https://example.test/x", attempts: 1 });
    }

    const callsBefore = fetchMock.mock.calls.length;
    const skipped = await providerFetch({ provider: "kamino", url: "https://example.test/x" });

    expect(skipped.ok).toBe(false);
    /* The point of the breaker: no further network call was made. */
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(providerHealth("kamino").circuitOpen).toBe(true);
  });

  it("does not let our own malformed request trip the breaker", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 400));
    const { providerFetch, providerHealth } = await import("@/lib/providers/http");

    for (let index = 0; index < 6; index += 1) {
      await providerFetch({ provider: "raydium", url: "https://example.test/x", attempts: 1 });
    }

    expect(providerHealth("raydium").circuitOpen).toBe(false);
  });
});

describe("cache", () => {
  it("serves a repeat read without a second call", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ n: 1 }));
    const { cached, providerFetch } = await import("@/lib/providers/http");

    const load = () => providerFetch<{ n: number }>({ provider: "jupiter", url: "https://example.test/x" });
    await cached("k", 60_000, load);
    await cached("k", 60_000, load);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves a stale reading when the provider fails, and says so", async () => {
    /* An expired reading, clearly marked, beats nothing at all. */
    fetchMock.mockResolvedValueOnce(jsonResponse({ n: 1 }));
    const { cached, providerFetch } = await import("@/lib/providers/http");
    const load = () => providerFetch<{ n: number }>({ provider: "jupiter", url: "https://example.test/x" });

    await cached("k2", 0, load);
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    const result = await cached("k2", 0, load);
    expect(result.ok).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.warnings?.join(" ")).toMatch(/cached/i);
  });

  it("never caches a failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const { cached, providerFetch } = await import("@/lib/providers/http");
    const load = () => providerFetch({ provider: "jupiter", url: "https://example.test/x" });

    await cached("k3", 60_000, load);
    const callsAfterFirst = fetchMock.mock.calls.length;
    await cached("k3", 60_000, load);

    /* A one-second blip must not become a full TTL of unavailability. */
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});

describe("jupiter adapter", () => {
  it("normalizes a price response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(OK_PRICE));
    const { jupiterPrices } = await import("@/lib/providers/jupiter");

    const result = await jupiterPrices([MINT]);
    expect(result.ok).toBe(true);
    expect(result.data?.[0]).toMatchObject({
      id: MINT,
      usdPrice: 96.76,
      change24hPct: -5.47,
      decimals: 9,
    });
  });

  it("sends the key as a header, never in the URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse(OK_PRICE));
    const { jupiterPrices } = await import("@/lib/providers/jupiter");
    await jupiterPrices([MINT]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("test-key-not-a-real-credential");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBeDefined();
  });

  it("reports an unpriced mint as a warning, never as zero", async () => {
    /* A mint with an unknown price and a mint worth nothing are different
       facts, and only one of them belongs in a total. */
    fetchMock.mockResolvedValue(jsonResponse({}));
    const { jupiterPrices } = await import("@/lib/providers/jupiter");

    const result = await jupiterPrices([MINT]);
    expect(result.data).toEqual([]);
    expect(result.partial).toBe(true);
    expect(result.warnings?.join(" ")).toMatch(/No price returned/i);
  });

  it("refuses a swap quote with a non-integer amount before calling out", async () => {
    const { jupiterSwapQuote } = await import("@/lib/providers/jupiter");

    const result = await jupiterSwapQuote({
      inputMint: "a",
      outputMint: "b",
      amount: "1.5",
      taker: "t",
    });

    expect(result.error?.code).toBe("INVALID_REQUEST");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes a swap order and stamps an expiry", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        inputMint: "a",
        outputMint: "b",
        inAmount: "1000000",
        outAmount: "10332",
        otherAmountThreshold: "10280",
        priceImpactPct: "0.0004",
        slippageBps: 50,
        requestId: "req-1",
        routePlan: [{ swapInfo: { label: "Orca" } }],
      }),
    );
    const { jupiterSwapQuote } = await import("@/lib/providers/jupiter");

    const result = await jupiterSwapQuote({
      inputMint: "a",
      outputMint: "b",
      amount: "1000000",
      taker: "t",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.outAmount).toBe("10332");
    expect(result.data?.priceImpactPct).toBeCloseTo(0.04, 6);
    expect(result.data?.routeLabels).toEqual(["Orca"]);
    /* A quote without an expiry is a quote someone can confirm at a price
       that no longer exists. */
    expect(result.data?.expiresAt).toBeDefined();
  });

  it("does not retry a swap quote — a retry is a different price", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const { jupiterSwapQuote } = await import("@/lib/providers/jupiter");

    await jupiterSwapQuote({ inputMint: "a", outputMint: "b", amount: "1", taker: "t" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("birdeye adapter", () => {
  it("normalizes a price and uses the provider's own timestamp", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { value: 96.78, priceChange24h: -5.5, updateUnixTime: 1_789_520_709 } }),
    );
    const { birdeyePrice } = await import("@/lib/providers/birdeye");

    const result = await birdeyePrice(MINT);
    expect(result.data?.usdPrice).toBe(96.78);
    /* Not "now": a reading five minutes old must not be stamped fresh. */
    expect(result.asOf).toBe(new Date(1_789_520_709 * 1_000).toISOString());
  });

  it("reports the wallet plan gap as AUTH with an actionable message", async () => {
    /* Verified against the live API: this key's plan answers 401 here. The
       one thing that must never happen is an empty array, which would render
       a funded wallet as empty. */
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, message: "Your API key lacks sufficient permissions" }, 401),
    );
    const { birdeyeWalletPortfolio } = await import("@/lib/providers/birdeye");

    const result = await birdeyeWalletPortfolio("wallet123");
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error?.message).toMatch(/plan/i);
  });

  it("reports an empty history window as NOT_FOUND rather than an empty series", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { items: [] } }));
    const { birdeyeHistoricalPrice } = await import("@/lib/providers/birdeye");

    const result = await birdeyeHistoricalPrice({
      mint: MINT,
      interval: "1H",
      fromMs: 1,
      toMs: 2,
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

describe("router", () => {
  it("does not offer Birdeye for capabilities its plan excludes", async () => {
    const { providersFor } = await import("@/lib/providers/router");
    /* Spending a round trip to be told something already known is exactly
       what this avoids. */
    expect(providersFor("wallet_balances")).not.toContain("birdeye");
    expect(providersFor("solana_price")).toContain("jupiter");
  });

  it("falls back to Birdeye for a mint Jupiter could not price", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { value: 1.23 } }));
    const { routePrices } = await import("@/lib/providers/router");

    const result = await routePrices([MINT]);
    expect(result.ok).toBe(true);
    expect(result.data?.[0].usdPrice).toBe(1.23);
  });

  it("fails rather than inventing a price when every provider is down", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const { routePrices } = await import("@/lib/providers/router");

    const result = await routePrices([MINT]);
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
  });

  it("reports partial coverage when only some mints priced", async () => {
    fetchMock.mockResolvedValue(jsonResponse(OK_PRICE));
    const { routePrices } = await import("@/lib/providers/router");

    const result = await routePrices([MINT, "UnknownMint111"]);
    expect(result.ok).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it("refuses when no price provider is configured at all", async () => {
    delete process.env.JUPITER_API_KEY;
    delete process.env.BIRDEYE_API_KEY;
    vi.resetModules();
    const { routePrices } = await import("@/lib/providers/router");

    const result = await routePrices([MINT]);
    expect(result.error?.code).toBe("AUTH");
  });
});
