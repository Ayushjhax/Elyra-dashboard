import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSunriseCache, sunriseConfigured, sunriseEquities, sunriseExecute, sunriseQuotes } from "@/lib/providers/sunrise";

const SPCX = "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb";
const OTHER = "BPxxfRCXkUVhig4HS1Lh7kZqV6SPJhzfEk4x6fVBjPCy";
const TX = "5".repeat(88);

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const token = (address: string, symbol: string, issuer: string | null = "backpack_securities") => ({
  chain: "solana",
  address,
  symbol,
  name: symbol,
  decimals: 8,
  platform: "sunrise",
  assetClass: "stock",
  issuer,
  icon: null,
  tokenProgram: null,
});

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  resetSunriseCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SUNRISE_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("without a key", () => {
  it("says it is not set up and asks nothing", async () => {
    vi.stubEnv("SUNRISE_API_KEY", "");
    expect(sunriseConfigured()).toBe(false);
    const result = await sunriseEquities();
    expect(result).toMatchObject({ ok: false, failure: { code: "unconfigured" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sunriseEquities", () => {
  it("reads every page for the stock issuer, keeps only its tokens, and caches the list", async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { success: true, data: { count: 2, tokens: [token(SPCX, "SPCX"), token(OTHER, "BP", null)], pagination: { limit: 2, nextCursor: "page2" } } }))
      .mockResolvedValueOnce(json(200, { success: true, data: { count: 1, tokens: [token(SPCX, "SPCX")], pagination: { limit: 2, nextCursor: null } } }));
    const result = await sunriseEquities();
    expect(result.ok && result.data.map((entry) => entry.symbol)).toEqual(["SPCX"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.sunrise.xyz/v1/tokens?issuer=backpack_securities");
    expect(String(fetchMock.mock.calls[1][0])).toContain("cursor=page2");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    expect(String(url)).not.toContain("test-key");
    await sunriseEquities();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("sunriseQuotes", () => {
  it("asks for both sides at the person's wallet, and is never retried", async () => {
    fetchMock.mockResolvedValueOnce(json(503, { success: false, error: { code: "service_unavailable", message: "x" }, requestId: "r", timestamp: "t" }));
    const result = await sunriseQuotes({ fromToken: "native", toToken: SPCX, fromAmount: "1000", wallet: OTHER });
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ fromToken: "native", toToken: SPCX, fromAmount: "1000", fromAddress: OTHER, toAddress: OTHER });
  });
});

describe("sunriseExecute", () => {
  const request = { signedTransaction: "AQID", quoteId: "q-1", routeName: "rfq-fill", providerRequestId: "p-1" };

  it("resends the SAME signed request once when the outcome is unknown", async () => {
    fetchMock
      .mockResolvedValueOnce(json(503, { success: false, error: { code: "execute_status_unknown", message: "x" }, requestId: "r", timestamp: "t" }))
      .mockResolvedValueOnce(json(200, { success: true, data: { txHash: TX, status: "SUBMITTED", done: false, orders: [] } }));
    const result = await sunriseExecute(request);
    expect(result).toMatchObject({ ok: true, data: { txHash: TX } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.body).toBe(fetchMock.mock.calls[1][1]?.body);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(request);
  });

  it("does not resend what Sunrise refused before sending", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { success: false, error: { code: "price_moved", message: "x" }, requestId: "r", timestamp: "t" }));
    const result = await sunriseExecute(request);
    expect(result).toMatchObject({ ok: false, failure: { action: "requote" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats no answer as unknown, resends once, and reports it as unknown", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    const result = await sunriseExecute(request);
    expect(result).toMatchObject({ ok: false, failure: { action: "resend" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
