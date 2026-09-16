import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   The swap path — the only code in the app that can move funds.

   What these guard is narrow and specific: Jupiter answers HTTP 200 for a
   swap that failed on-chain, so the status field IS the outcome and the HTTP
   code is not. Reporting a failed swap as a success is the worst available
   bug here — it is indistinguishable from a real one downstream, and the
   operator believes they hold something they do not.
--------------------------------------------------------------------------- */

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("JUPITER_API_KEY", "test-key");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const { resetProviderHealth, clearProviderCache } = await import("@/lib/providers/http");
  resetProviderHealth();
  clearProviderCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const SIGNATURE = "5V1nKQ5xW8yq5oZ2s9ZcJ8h9mKQ2wq5oZ2s9ZcJ8h9mKQ2wq5oZ2s9ZcJ8h9mKQ2w";

describe("jupiterSwapExecute", () => {
  it("returns the signature when the swap lands", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: "Success", signature: SIGNATURE }),
    );

    const { jupiterSwapExecute } = await import("@/lib/providers/jupiter");
    const result = await jupiterSwapExecute({
      signedTransaction: "AQAB",
      quoteRef: "req_1",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.signature).toBe(SIGNATURE);
  });

  it("treats a 200 with a failed status as a failure", async () => {
    /* The trap. Jupiter reports an on-chain failure with HTTP 200, so a
       caller checking only the status code would report a swap that never
       happened as done. */
    fetchMock.mockResolvedValue(
      jsonResponse({ status: "Failed", code: 6001, error: "Slippage tolerance exceeded" }),
    );

    const { jupiterSwapExecute } = await import("@/lib/providers/jupiter");
    const result = await jupiterSwapExecute({
      signedTransaction: "AQAB",
      quoteRef: "req_1",
    });

    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/slippage/i);
  });

  it("treats a success with no signature as a failure", async () => {
    /* Nothing to show the operator and nothing to look up on an explorer is
       not a completed swap, whatever the status says. */
    fetchMock.mockResolvedValue(jsonResponse({ status: "Success" }));

    const { jupiterSwapExecute } = await import("@/lib/providers/jupiter");
    const result = await jupiterSwapExecute({
      signedTransaction: "AQAB",
      quoteRef: "req_1",
    });

    expect(result.ok).toBe(false);
  });

  it("never resubmits a swap", async () => {
    /* A retry is a second submission of money that may already have moved.
       The provider layer retries by default, so this asserts the opt-out. */
    fetchMock.mockResolvedValue(new Response("upstream", { status: 503 }));

    const { jupiterSwapExecute } = await import("@/lib/providers/jupiter");
    const result = await jupiterSwapExecute({
      signedTransaction: "AQAB",
      quoteRef: "req_1",
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the signed bytes verbatim, under Jupiter's own field name", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: "Success", signature: SIGNATURE }),
    );

    const { jupiterSwapExecute } = await import("@/lib/providers/jupiter");
    await jupiterSwapExecute({ signedTransaction: "AQABgg==", quoteRef: "req_42" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      signedTransaction: string;
      requestId: string;
    };
    expect(body.signedTransaction).toBe("AQABgg==");
    /* Carried as `quoteRef` above the adapter, `requestId` on the wire. */
    expect(body.requestId).toBe("req_42");
  });

  it("refuses to submit without an API key, without calling out", async () => {
    vi.stubEnv("JUPITER_API_KEY", "");

    const { jupiterSwapExecute } = await import("@/lib/providers/jupiter");
    const result = await jupiterSwapExecute({
      signedTransaction: "AQAB",
      quoteRef: "req_1",
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("jupiterSwapQuote", () => {
  it("carries the unsigned transaction through", async () => {
    /* Without this the browser has a price and nothing to sign, and the
       quote silently degrades to the preview-only behaviour it replaced. */
    fetchMock.mockResolvedValue(
      jsonResponse({
        inputMint: "So11111111111111111111111111111111111111112",
        outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        inAmount: "1000000000",
        outAmount: "150000000",
        otherAmountThreshold: "149000000",
        requestId: "req_7",
        transaction: "BASE64TX",
      }),
    );

    const { jupiterSwapQuote } = await import("@/lib/providers/jupiter");
    const result = await jupiterSwapQuote({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amount: "1000000000",
      taker: "AxqtG9SHDkZTLSWg81Sp7VqAzQpRqXtR9ziJ3VQAS8As",
    });

    expect(result.data?.unsignedTransaction).toBe("BASE64TX");
    expect(result.data?.quoteRef).toBe("req_7");
  });

  it("treats an EMPTY transaction as no transaction, and keeps the reason", async () => {
    /* Observed live, and the shape that actually occurs: a taker who cannot
       afford the trade gets HTTP 200, a full set of prices, an empty-STRING
       transaction and `error: "Insufficient funds"`. An `=== null` check or a
       truthiness check on presence would call this signable and hand the
       browser an empty string to sign. */
    fetchMock.mockResolvedValue(
      jsonResponse({
        outAmount: "9809094",
        requestId: "req_9",
        transaction: "",
        error: "Insufficient funds",
        errorMessage: "Insufficient funds",
      }),
    );

    const { jupiterSwapQuote } = await import("@/lib/providers/jupiter");
    const result = await jupiterSwapQuote({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amount: "100000000",
      taker: "AxqtG9SHDkZTLSWg81Sp7VqAzQpRqXtR9ziJ3VQAS8As",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.unsignedTransaction).toBeUndefined();
    expect(result.data?.unexecutableReason).toBe("Insufficient funds");
  });

  it("reports no transaction rather than inventing one", async () => {
    /* A route Jupiter priced but could not build is a price, not a trade.
       `undefined` here is what keeps readiness at `unsupported` upstream. */
    fetchMock.mockResolvedValue(
      jsonResponse({ outAmount: "150000000", requestId: "req_8", transaction: null }),
    );

    const { jupiterSwapQuote } = await import("@/lib/providers/jupiter");
    const result = await jupiterSwapQuote({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amount: "1000000000",
      taker: "AxqtG9SHDkZTLSWg81Sp7VqAzQpRqXtR9ziJ3VQAS8As",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.unsignedTransaction).toBeUndefined();
  });
});
