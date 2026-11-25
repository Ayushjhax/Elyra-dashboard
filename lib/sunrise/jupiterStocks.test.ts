import { beforeEach, describe, expect, it, vi } from "vitest";

import { BACKPACK_FREEZE_AUTHORITY, markStockRef, parseBackpackIndex, unmarkStockRef } from "@/lib/sunrise/api";

/* Backpack Securities' stocks on a deployment without Sunrise's key: listed
   from Jupiter's index, quoted by Jupiter, and asked the same eligibility
   question at build and at submit. */

const NVDA = "NVDAx1111111111111111111111111111111111111";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const TX = "5".repeat(88);
const OTHER_AUTHORITY = "Fake1111111111111111111111111111111111111111";

const entry = (overrides: Record<string, unknown> = {}) => ({
  id: NVDA,
  symbol: "NVDA",
  name: "Nvidia - Backpack Securities",
  decimals: 6,
  isVerified: true,
  tags: ["verified", "stocks", "rwa", "backpack", "token-2022"],
  freezeAuthority: BACKPACK_FREEZE_AUTHORITY,
  tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  icon: "https://example.test/nvda.png",
  ...overrides,
});

describe("parseBackpackIndex", () => {
  it("keeps the issuer's verified stock tokens, named without the issuer's suffix", () => {
    expect(parseBackpackIndex([entry()])).toEqual([
      expect.objectContaining({ address: NVDA, symbol: "NVDA", name: "Nvidia", decimals: 6, issuer: "backpack_securities", assetClass: "stock" }),
    ]);
  });

  it("drops anything not verified, not tagged both ways, not named for the issuer, or frozen by someone else", () => {
    expect(
      parseBackpackIndex([
        entry({ isVerified: false }),
        entry({ tags: ["verified", "stocks"] }),
        entry({ tags: ["verified", "backpack"] }),
        entry({ name: "Nvidia" }),
        entry({ freezeAuthority: OTHER_AUTHORITY }),
        entry({ freezeAuthority: null }),
        entry({ id: "not-a-mint" }),
        entry({ decimals: 40 }),
        "junk",
      ]),
    ).toEqual([]);
  });

  it("drops a symbol two tokens share rather than pick one", () => {
    const twin = entry({ id: "NVDAy1111111111111111111111111111111111111" });
    expect(parseBackpackIndex([entry(), twin])).toEqual([]);
  });

  it("marks and unmarks Jupiter's ref, refusing an empty one", () => {
    expect(unmarkStockRef(markStockRef("jupiter-request-1"))).toBe("jupiter-request-1");
    expect(unmarkStockRef("backpack:")).toBeNull();
    expect(unmarkStockRef("jupiter-request-1")).toBeNull();
  });
});

const state = vi.hoisted(() => ({
  resolve: vi.fn(),
  readMint: vi.fn(),
  guard: vi.fn(),
  previewSwap: vi.fn(),
  jupiterExecute: vi.fn(),
  sunriseQuotes: vi.fn(),
  sunriseExecute: vi.fn(),
}));

vi.mock("@/lib/personalized/session", () => ({ resolve: state.resolve }));
vi.mock("@/lib/providers/sunrise", () => ({
  sunriseConfigured: () => false,
  sunriseEquities: async () => ({ ok: false, failure: { message: "unconfigured" } }),
  sunriseStock: async () => null,
  sunriseQuotes: state.sunriseQuotes,
  sunriseExecute: state.sunriseExecute,
}));
vi.mock("@/lib/providers/jupiterStocks", () => ({
  backpackStocks: async () => ({
    ok: true,
    data: [{ address: "NVDAx1111111111111111111111111111111111111", symbol: "NVDA", name: "Nvidia", decimals: 6, assetClass: "stock", issuer: "backpack_securities", icon: null, tokenProgram: null }],
  }),
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
import { GET as tokens } from "@/app/api/swap/tokens/route";

const post = (url: string, body: unknown, country: string | null = "SG") =>
  new Request(`https://elyra.test${url}`, {
    method: "POST",
    headers: country === null ? {} : { "x-vercel-ip-country": country },
    body: JSON.stringify(body),
  });

const buy = (extra: Record<string, unknown> = {}) => ({ fromSymbol: "USDC", toSymbol: "NVDA", amount: "100", ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  state.resolve.mockResolvedValue({ session: { solanaAddress: WALLET } });
  state.readMint.mockResolvedValue({ decimals: 6, freezeAuthority: BACKPACK_FREEZE_AUTHORITY });
  state.guard.mockResolvedValue({ ok: true });
  state.previewSwap.mockResolvedValue({
    action: { id: "r-1", kind: "swap", summary: "Swap 100 USDC to 0.5 NVDA", fields: [], readiness: "ready", reason: null, warnings: ["stock notice"], preparedAt: "2026-11-25T00:00:00Z" },
    note: "Nothing has been sent.",
    unsignedTransaction: "AQID",
    quoteRef: "jupiter-request-1",
    sell: { mint: USDC, amount: "100000000" },
  });
});

describe("/api/swap/tokens without Sunrise's key", () => {
  it("offers Backpack's stocks from Jupiter's index, marked for the eligibility question", async () => {
    const body = await (await tokens(new Request("https://elyra.test/api/swap/tokens?include=sunrise"))).json();
    expect(body.groups).toContainEqual({ label: "Tokenized stocks (Backpack)", symbols: ["NVDA"], eligibility: "sunrise" });
  });
});

describe("/api/swap/build with a Backpack stock from Jupiter's index", () => {
  it("asks for eligibility before quoting, and refuses restricted or unknown countries", async () => {
    expect((await build(post("/api/swap/build", buy()))).status).toBe(403);
    for (const country of ["US", "CN", null]) {
      expect((await build(post("/api/swap/build", buy({ confirmEligible: true }), country))).status).toBe(403);
    }
    expect(state.previewSwap).not.toHaveBeenCalled();
  });

  it("quotes through Jupiter with the issuer's notice, guards the bytes and marks the ref", async () => {
    const response = await build(post("/api/swap/build", buy({ confirmEligible: true })));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(state.sunriseQuotes).not.toHaveBeenCalled();
    const call = state.previewSwap.mock.calls[0][0];
    expect(call.solanaAddress).toBe(WALLET);
    expect(call.unlisted.to).toMatchObject({ mint: NVDA, decimals: 6 });
    const notice = call.unlisted.to.warnings.join(" ");
    expect(notice).toMatch(/Jupiter's token index/);
    expect(notice).toMatch(/not the share itself/);
    expect(call.unlisted.from).toBeUndefined();
    expect(state.guard).toHaveBeenCalledWith(expect.objectContaining({ owner: WALLET, sellMint: USDC }));
    expect(body.quoteRef).toBe("backpack:jupiter-request-1");
  });

  it("refuses a mint the issuer's authority does not freeze", async () => {
    state.readMint.mockResolvedValueOnce({ decimals: 6, freezeAuthority: OTHER_AUTHORITY });
    const response = await build(post("/api/swap/build", buy({ confirmEligible: true })));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/not frozen by Backpack Securities' authority/);
    expect(state.previewSwap).not.toHaveBeenCalled();
  });
});

describe("/api/swap/submit with a marked Jupiter ref", () => {
  it("checks the country and the confirmation again before anything is sent", async () => {
    expect((await submit(post("/api/swap/submit", { signedTransaction: "AQID", quoteRef: "backpack:jupiter-request-1", confirmEligible: true }, "US"))).status).toBe(403);
    expect((await submit(post("/api/swap/submit", { signedTransaction: "AQID", quoteRef: "backpack:jupiter-request-1" }))).status).toBe(403);
    expect(state.jupiterExecute).not.toHaveBeenCalled();
  });

  it("hands Jupiter its own ref, unmarked, with the signed bytes unchanged", async () => {
    state.jupiterExecute.mockResolvedValueOnce({ ok: true, data: { signature: TX } });
    const response = await submit(post("/api/swap/submit", { signedTransaction: "AQID", quoteRef: "backpack:jupiter-request-1", confirmEligible: true }));
    expect(state.jupiterExecute).toHaveBeenCalledWith({ signedTransaction: "AQID", quoteRef: "jupiter-request-1" });
    expect(await response.json()).toEqual({ executed: true, signature: TX });
    expect(state.sunriseExecute).not.toHaveBeenCalled();
  });
});
