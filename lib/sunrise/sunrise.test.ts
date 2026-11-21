import { describe, expect, it } from "vitest";
import {
  bestQuote,
  decodeRef,
  encodeRef,
  isOrderRoute,
  parseExecution,
  parseFailure,
  parseOrders,
  parseQuotes,
  parseStock,
  parseToken,
  parseTokenPage,
  sunriseTokenId,
  unavailableReason,
  WSOL_MINT,
  type SunriseQuote,
} from "@/lib/sunrise/api";
import { eligibility, requestCountry, RESTRICTED_REGIONS } from "@/lib/sunrise/eligibility";

const SPCX = "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TX = "5".repeat(88);

const token = (overrides: Record<string, unknown> = {}) => ({
  chain: "solana",
  address: SPCX,
  symbol: "SPCX",
  name: "SpaceX",
  decimals: 8,
  platform: "sunrise",
  assetClass: "stock",
  issuer: "backpack_securities",
  icon: "https://sunrise.xyz/icons/spcx.png",
  tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  ...overrides,
});

const envelope = (data: unknown) => ({ success: true, data, timestamp: "2026-11-21T00:00:00Z", requestId: "req-1" });

describe("parseToken", () => {
  it("reads a Solana token Sunrise lists", () => {
    expect(parseToken(token())).toEqual({
      address: SPCX,
      symbol: "SPCX",
      name: "SpaceX",
      decimals: 8,
      assetClass: "stock",
      issuer: "backpack_securities",
      icon: "https://sunrise.xyz/icons/spcx.png",
      tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    });
  });

  it("drops what is not a usable Solana token", () => {
    expect(parseToken(token({ chain: "ethereum" }))).toBeNull();
    expect(parseToken(token({ address: "0xabc" }))).toBeNull();
    expect(parseToken(token({ decimals: 1.5 }))).toBeNull();
    expect(parseToken(token({ decimals: 40 }))).toBeNull();
    expect(parseToken(token({ symbol: "<script>" }))).toBeNull();
    expect(parseToken(token({ icon: "javascript:alert(1)" }))?.icon).toBeNull();
  });

  it("reads a page and its cursor", () => {
    const page = parseTokenPage(envelope({ count: 2, tokens: [token(), token({ chain: "sui" })], pagination: { limit: 100, nextCursor: "abc_123" } }));
    expect(page?.tokens.map((entry) => entry.symbol)).toEqual(["SPCX"]);
    expect(page?.nextCursor).toBe("abc_123");
    expect(parseTokenPage({ success: false })).toBeNull();
  });

  it("reads the stock behind a token, and nothing for one that is not", () => {
    expect(parseStock(envelope({ token: { ...token(), stock: { ticker: "HOOD", currency: "USD", exchange: { marketIdentifierCode: "XNAS", name: "Nasdaq" } } } }))).toEqual({
      ticker: "HOOD",
      currency: "USD",
      exchange: "Nasdaq",
    });
    expect(parseStock(envelope({ token: { ...token(), stock: null } }))).toBeNull();
  });
});

describe("quotes", () => {
  const quote = (overrides: Partial<SunriseQuote> & Record<string, unknown> = {}) => ({
    quoteId: "q-1",
    routeName: "jupiter",
    providerRequestId: "p-1",
    unsignedTransaction: "AQID",
    fromToken: USDC,
    toToken: SPCX,
    fromAmount: "100000000",
    toAmount: "500000",
    fromAmountUSD: 100,
    toAmountUSD: 99.7,
    slippageBps: 50,
    estimatedDurationMs: 2000,
    expiresAt: "2026-11-21T00:00:10Z",
    ...overrides,
  });

  it("parses quotes and the routes that could not quote", () => {
    const parsed = parseQuotes(
      envelope({
        quotes: [quote(), quote({ quoteId: "q-2", toAmount: "12.5" })],
        unavailableRoutes: [{ routeName: "rfq-fill", code: "market_closed", message: "The market is closed." }],
      }),
    );
    expect(parsed?.quotes.map((entry) => entry.quoteId)).toEqual(["q-1"]);
    expect(parsed?.unavailable).toEqual([{ routeName: "rfq-fill", code: "market_closed", message: "The market is closed.", maxFromAmount: null }]);
  });

  it("offers the signable quote that delivers most, then the quickest", () => {
    const parsed = parseQuotes(
      envelope({
        quotes: [
          quote({ quoteId: "slow", toAmount: "600000", estimatedDurationMs: 9000 }),
          quote({ quoteId: "unsigned", toAmount: "900000", unsignedTransaction: null }),
          quote({ quoteId: "fast", toAmount: "600000", estimatedDurationMs: 1000 }),
          quote({ quoteId: "less", toAmount: "599999" }),
        ],
      }),
    )!;
    expect(bestQuote(parsed.quotes)?.quoteId).toBe("fast");
    expect(bestQuote([])).toBeNull();
  });

  it("says why nothing quoted, the market's hours first", () => {
    expect(unavailableReason([{ routeName: "titan", code: "no_quote", message: "No quote." }, { routeName: "rfq-fill", code: "market_closed", message: "x" }].map((entry) => ({ ...entry, maxFromAmount: null })))).toMatch(
      /closed/,
    );
    expect(unavailableReason([])).toMatch(/No route/);
  });

  it("names SOL as Sunrise does, and knows which route places an order", () => {
    expect(sunriseTokenId(WSOL_MINT)).toBe("native");
    expect(sunriseTokenId(USDC)).toBe(USDC);
    expect(isOrderRoute("rfq-fill")).toBe(true);
    expect(isOrderRoute("jupiter")).toBe(false);
  });
});

describe("the quote reference", () => {
  it("carries what execute needs, and nothing else reads as one", () => {
    const ref = encodeRef({ quoteId: "q-1", routeName: "rfq-fill", providerRequestId: "p-1" });
    expect(ref.startsWith("sunrise:")).toBe(true);
    expect(decodeRef(ref)).toEqual({ quoteId: "q-1", routeName: "rfq-fill", providerRequestId: "p-1" });
    expect(decodeRef(encodeRef({ quoteId: "q-2", routeName: "jupiter", providerRequestId: null }))?.providerRequestId).toBeNull();
    expect(decodeRef("sunrise:not-json")).toBeNull();
    expect(decodeRef("jupiter-request-id")).toBeNull();
    expect(decodeRef(`sunrise:${Buffer.from(JSON.stringify({ q: "has space", r: "x" })).toString("base64url")}`)).toBeNull();
  });
});

describe("execution and orders", () => {
  it("reads an execution and its RFQ order", () => {
    const parsed = parseExecution(
      envelope({ txHash: TX, status: "SUBMITTED", done: false, orders: [{ orderId: "p-1", type: "rfq", status: "OPEN", details: { openTxHash: TX } }] }),
    );
    expect(parsed).toEqual({
      txHash: TX,
      status: "SUBMITTED",
      done: false,
      orders: [{ orderId: "p-1", status: "OPEN", openTxHash: TX, fillTxHash: null, cancelTxHash: null, refundTxHash: null, deliveredAmountRaw: null, returnedAmountRaw: null }],
    });
    expect(parseExecution(envelope({ txHash: "short", status: "SUBMITTED", done: false }))).toBeNull();
  });

  it("reads orders and drops ones with an unknown status", () => {
    const orders = parseOrders(
      envelope({
        count: 2,
        orders: [
          { orderId: "a", type: "rfq", status: "PARTIALLY_FILLED", details: { openTxHash: TX, fillTxHash: TX, returnedAmountRaw: "1200", deliveredAmountRaw: "34" } },
          { orderId: "b", type: "rfq", status: "TELEPORTED", details: {} },
        ],
        pagination: { nextCursor: null },
      }),
    );
    expect(orders).toHaveLength(1);
    expect(orders?.[0]).toMatchObject({ status: "PARTIALLY_FILLED", returnedAmountRaw: "1200", deliveredAmountRaw: "34" });
  });
});

describe("parseFailure", () => {
  const error = (code: string, message = "Upstream words.") => ({ success: false, error: { code, message }, requestId: "r", timestamp: "t" });

  it("refuses a trade Sunrise says the person may not make", () => {
    expect(parseFailure(403, error("geo_blocked"), null)).toMatchObject({ action: "refuse", message: "This trade isn't available in your region." });
    expect(parseFailure(403, error("address_blocked"), null).action).toBe("refuse");
    expect(parseFailure(403, error("trading_halted"), null).action).toBe("refuse");
  });

  it("asks for a new quote when nothing was sent", () => {
    expect(parseFailure(409, error("price_moved"), null).action).toBe("requote");
    expect(parseFailure(409, error("something_new"), null)).toMatchObject({ action: "requote", message: "Upstream words." });
    expect(parseFailure(422, { success: false, error: { code: "transaction_failed", message: "x", details: { txHash: TX } } }, null)).toMatchObject({ action: "requote", txHash: TX });
  });

  it("resends the same request when the outcome is unknown, and waits when rate limited", () => {
    expect(parseFailure(503, error("execute_status_unknown"), null).action).toBe("resend");
    expect(parseFailure(502, null, null).action).toBe("resend");
    expect(parseFailure(429, null, "60")).toMatchObject({ action: "wait", retryAfterSec: 60 });
  });
});

describe("eligibility", () => {
  it("refuses US persons, PRC residents and sanctioned jurisdictions by the request's country", () => {
    for (const code of ["US", "PR", "CN", "HK", "MO", "IR", "KP"]) {
      expect(eligibility(code, true)).toMatchObject({ ok: false, code: "region" });
    }
    expect(Object.keys(RESTRICTED_REGIONS)).toEqual(expect.arrayContaining(["US", "CN"]));
  });

  it("refuses an unknown country rather than assuming one", () => {
    expect(eligibility(null, true)).toMatchObject({ ok: false, code: "unknown_region" });
    expect(eligibility("XX1", true)).toMatchObject({ ok: false, code: "unknown_region" });
  });

  it("asks the person to confirm, then allows", () => {
    expect(eligibility("SG", false)).toMatchObject({ ok: false, code: "unconfirmed" });
    expect(eligibility("sg", true)).toEqual({ ok: true });
  });

  it("reads the platform's country header", () => {
    expect(requestCountry(new Headers({ "x-vercel-ip-country": "de" }))).toBe("DE");
    expect(requestCountry(new Headers({ "x-vercel-ip-country": "../" }))).toBeNull();
    expect(requestCountry(new Headers())).toBeNull();
  });
});
