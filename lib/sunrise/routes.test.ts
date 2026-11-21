import { beforeEach, describe, expect, it, vi } from "vitest";

const SPCX = "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const TX = "5".repeat(88);

const state = vi.hoisted(() => ({
  resolve: vi.fn(),
  quotes: vi.fn(),
  execute: vi.fn(),
  readMint: vi.fn(),
  guard: vi.fn(),
  previewSwap: vi.fn(),
  jupiterExecute: vi.fn(),
}));

vi.mock("@/lib/personalized/session", () => ({ resolve: state.resolve }));
vi.mock("@/lib/providers/sunrise", () => ({
  sunriseConfigured: () => true,
  sunriseEquities: async () => ({
    ok: true,
    data: [{ address: "SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb", symbol: "SPCX", name: "SpaceX", decimals: 8, assetClass: "stock", issuer: "backpack_securities", icon: null, tokenProgram: null }],
  }),
  sunriseQuotes: state.quotes,
  sunriseExecute: state.execute,
}));
vi.mock("@/lib/passport/server", () => ({
  readMint: state.readMint,
  assetPassport: async () => null,
  PassportError: class extends Error {
    status = 400;
  },
}));
vi.mock("@/lib/solana/swapGuard", () => ({ guardSwap: state.guard }));
vi.mock("@/lib/providers/jupiter", async (original) => ({ ...(await original<typeof import("@/lib/providers/jupiter")>()), jupiterSwapExecute: state.jupiterExecute }));
vi.mock("@/lib/trade", async (original) => ({ ...(await original<typeof import("@/lib/trade")>()), previewSwap: state.previewSwap }));

import { POST as build } from "@/app/api/swap/build/route";
import { POST as submit } from "@/app/api/swap/submit/route";
import { encodeRef } from "@/lib/sunrise/api";

const post = (url: string, body: unknown, country: string | null = "SG") =>
  new Request(`https://elyra.test${url}`, {
    method: "POST",
    headers: country === null ? {} : { "x-vercel-ip-country": country },
    body: JSON.stringify(body),
  });

const buy = (extra: Record<string, unknown> = {}) => ({ fromSymbol: "USDC", toSymbol: "SPCX", amount: "100", ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  state.resolve.mockResolvedValue({ session: { solanaAddress: WALLET } });
  state.readMint.mockResolvedValue({ decimals: 8 });
  state.guard.mockResolvedValue({ ok: true });
  state.quotes.mockResolvedValue({
    ok: true,
    data: {
      quotes: [
        { quoteId: "q-1", routeName: "rfq-fill", providerRequestId: "p-1", unsignedTransaction: "AQID", fromAmount: "100000000", toAmount: "50000000", fromAmountUSD: 100, toAmountUSD: 99.8, slippageBps: 10, estimatedDurationMs: 2000, expiresAt: null },
        { quoteId: "q-2", routeName: "jupiter", providerRequestId: null, unsignedTransaction: "AQID", fromAmount: "100000000", toAmount: "49000000", fromAmountUSD: 100, toAmountUSD: 98, slippageBps: 50, estimatedDurationMs: 1000, expiresAt: null },
      ],
      unavailable: [],
    },
  });
});

describe("/api/swap/build with a Sunrise-listed stock", () => {
  it("asks the person to confirm eligibility before quoting", async () => {
    const response = await build(post("/api/swap/build", buy()));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ eligibility: "unconfirmed" });
    expect(state.quotes).not.toHaveBeenCalled();
  });

  it("refuses a request from a restricted or unknown country, confirmed or not", async () => {
    for (const country of ["US", "CN", null]) {
      const response = await build(post("/api/swap/build", buy({ confirmEligible: true }), country));
      expect(response.status).toBe(403);
    }
    expect(state.quotes).not.toHaveBeenCalled();
  });

  it("quotes through Sunrise for the session's wallet and holds the transaction to the swap guard", async () => {
    const response = await build(post("/api/swap/build", buy({ confirmEligible: true })));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(state.quotes).toHaveBeenCalledWith({ fromToken: USDC, toToken: SPCX, fromAmount: "100000000", wallet: WALLET });
    expect(state.guard).toHaveBeenCalledWith(expect.objectContaining({ owner: WALLET, transaction: "AQID", sellMint: USDC, sellAmount: "100000000" }));
    expect(body.action.readiness).toBe("ready");
    expect(body.quoteRef.startsWith("sunrise:")).toBe(true);
    expect(body.action.warnings.join(" ")).toMatch(/not the share itself/);
    expect(body.action.warnings.join(" ")).toMatch(/places an order/);
    expect(state.previewSwap).not.toHaveBeenCalled();
  });

  it("offers nothing to sign when the guard refuses", async () => {
    state.guard.mockResolvedValueOnce({ ok: false, error: "simulated, it would take SOL" });
    const body = await (await build(post("/api/swap/build", buy({ confirmEligible: true })))).json();
    expect(body.unsignedTransaction).toBeNull();
    expect(body.quoteRef).toBeNull();
  });

  it("refuses when the chain's decimals disagree with Sunrise's", async () => {
    state.readMint.mockResolvedValueOnce({ decimals: 6 });
    const response = await build(post("/api/swap/build", buy({ confirmEligible: true })));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/decimals/);
    expect(state.quotes).not.toHaveBeenCalled();
  });

  it("finds a stock named by its mint too", async () => {
    const response = await build(post("/api/swap/build", { fromSymbol: "USDC", toSymbol: "", toMint: SPCX, amount: "100" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ eligibility: "unconfirmed" });
  });

  it("leaves every other swap on Jupiter's path, with no eligibility question", async () => {
    state.previewSwap.mockResolvedValueOnce({ error: "stop here" });
    const response = await build(post("/api/swap/build", { fromSymbol: "SOL", toSymbol: "USDC", amount: "1" }, null));
    expect(response.status).toBe(400);
    expect(state.previewSwap).toHaveBeenCalled();
    expect(state.quotes).not.toHaveBeenCalled();
  });
});

describe("/api/swap/submit with a Sunrise quote", () => {
  const ref = encodeRef({ quoteId: "q-1", routeName: "rfq-fill", providerRequestId: "p-1" });

  it("checks the country again before anything is sent", async () => {
    const response = await submit(post("/api/swap/submit", { signedTransaction: "AQID", quoteRef: ref, confirmEligible: true }, "US"));
    expect(response.status).toBe(403);
    expect(state.execute).not.toHaveBeenCalled();
  });

  it("hands Sunrise the signed bytes unchanged, with the quote they were built for", async () => {
    state.execute.mockResolvedValueOnce({ ok: true, data: { txHash: TX, status: "SUBMITTED", done: false, orders: [{ status: "OPEN" }] } });
    const response = await submit(post("/api/swap/submit", { signedTransaction: "AQID", quoteRef: ref, confirmEligible: true }));
    expect(state.execute).toHaveBeenCalledWith({ signedTransaction: "AQID", quoteId: "q-1", routeName: "rfq-fill", providerRequestId: "p-1" });
    expect(await response.json()).toEqual({ executed: true, signature: TX, confirmed: false, order: { status: "OPEN" } });
    expect(state.jupiterExecute).not.toHaveBeenCalled();
  });

  it("never tells the person to sign again when the outcome is unknown", async () => {
    state.execute.mockResolvedValueOnce({ ok: false, failure: { status: 503, code: "execute_status_unknown", message: "x", action: "resend", retryAfterSec: null, requestId: null, txHash: null } });
    const response = await submit(post("/api/swap/submit", { signedTransaction: "AQID", quoteRef: ref, confirmEligible: true }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/do not sign it again/);
  });

  it("leaves a Jupiter quote on Jupiter", async () => {
    state.jupiterExecute.mockResolvedValueOnce({ ok: true, data: { signature: TX } });
    const response = await submit(post("/api/swap/submit", { signedTransaction: "AQID", quoteRef: "jupiter-request-1" }, null));
    expect(await response.json()).toEqual({ executed: true, signature: TX });
    expect(state.execute).not.toHaveBeenCalled();
  });
});
