import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  search: vi.fn(),
  cgId: vi.fn(),
  cgMarkets: vi.fn(),
  rug: vi.fn(),
  readMint: vi.fn(),
  pythSymbols: vi.fn(),
  pythIds: vi.fn(),
  catalogue: vi.fn(),
  fetchJson: vi.fn(),
}));

vi.mock("@/lib/market/cache", () => ({ cached: async (_key: string, _ttl: number, compute: () => Promise<unknown>) => ({ value: await compute(), fetchedAt: "", hit: false }) }));
vi.mock("@/lib/market/http", () => ({ fetchJson: state.fetchJson }));
vi.mock("@/lib/providers/jupiter", async (original) => ({ ...(await original<typeof import("@/lib/providers/jupiter")>()), jupiterTokenSearch: state.search }));
vi.mock("@/lib/providers/coingecko", () => ({ coingeckoIdFor: state.cgId, coingeckoMarkets: state.cgMarkets }));
vi.mock("@/lib/providers/rugcheck", () => ({ rugcheckSummary: state.rug }));
vi.mock("@/lib/providers/hyperliquid-public", async (original) => ({ ...(await original<typeof import("@/lib/providers/hyperliquid-public")>()), hyperliquidMarket: vi.fn() }));
vi.mock("@/lib/research/sentiment", () => ({ sentimentRead: vi.fn() }));
vi.mock("@/lib/passport/server", () => ({ readMint: state.readMint }));
vi.mock("@/lib/market/pyth/catalog", () => ({ catalogue: state.catalogue }));
vi.mock("@/lib/market/pyth/client", () => ({ pricesForSymbols: state.pythSymbols, pricesForIds: state.pythIds }));

import { macroSnapshot, tokenOverview, tokenSafety } from "@/lib/analysis/server";

const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const UNLISTED = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

const entry = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: "Token",
  symbol: "TKN",
  usdPrice: 1,
  mcap: 1000,
  liquidity: 500_000,
  holderCount: 20_000,
  audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true, topHoldersPercentage: 12 },
  isVerified: true,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.search.mockImplementation(async (query: string) => ({ ok: true, data: [entry(query)] }));
  state.cgId.mockImplementation(async (symbol: string) => ({ id: symbol.toLowerCase(), name: symbol, rank: 10 }));
  state.cgMarkets.mockImplementation(async (ids: string[]) => ids.map((id) => ({ id, symbol: id.toUpperCase(), name: id, rank: 10, marketCapUsd: 5e9 })));
  state.pythSymbols.mockResolvedValue([{ id: 1, price: 0.22 }]);
  state.rug.mockResolvedValue({ riskScore: 7, risks: [], lpLockedPct: 1 });
  state.readMint.mockResolvedValue({ decimals: 6, mintAuthority: null, freezeAuthority: null, extensions: [] });
});

describe("tokenOverview", () => {
  it("reads a Solana token on Elyra's list from Jupiter and CoinGecko, priced by Pyth", async () => {
    const overview = await tokenOverview("jup");
    expect(state.search).toHaveBeenCalledWith(JUP);
    expect(state.cgId).toHaveBeenCalledWith("JUP");
    expect(overview).toMatchObject({ symbol: "JUP", mint: JUP, price: { usd: 0.22, source: "pyth" }, market: { source: "coingecko" }, onSolana: { source: "jupiter" } });
  });

  it("reads SOL from CoinGecko alone — its mint would be wrapped SOL", async () => {
    const overview = await tokenOverview("SOL");
    expect(state.search).not.toHaveBeenCalled();
    expect(overview.onSolana).toBeNull();
  });

  it("reads an unlisted mint from Jupiter only, and says it is not verified", async () => {
    const overview = await tokenOverview(UNLISTED);
    expect(state.cgId).not.toHaveBeenCalled();
    expect(overview.mint).toBe(UNLISTED);
    expect(overview.notes.join(" ")).toMatch(/not on Elyra's verified list/);
  });

  it("names what a source did not have", async () => {
    state.cgId.mockResolvedValueOnce(null);
    const overview = await tokenOverview("ZZZ");
    expect(overview.market).toBeNull();
    expect(overview.notes.join(" ")).toMatch(/CoinGecko lists no coin with the symbol ZZZ/);
  });
});

describe("tokenSafety", () => {
  it("scores from the chain and Jupiter, and keeps Rugcheck's reading beside it", async () => {
    const report = await tokenSafety(JUP);
    expect(report.safety.score).toBe(100);
    expect(report.rugcheck).toMatchObject({ riskScore: 7, source: "rugcheck" });
    expect(report.sources).toEqual(["Solana mint account", "Jupiter token index", "Rugcheck"]);
  });

  it("explains an issuer-run token's freeze authority", async () => {
    state.readMint.mockResolvedValueOnce({ decimals: 6, mintAuthority: "Auth111", freezeAuthority: "Auth111", extensions: [] });
    const report = await tokenSafety(USDC);
    expect(report.safety.deductions.map((entry) => entry.source)).toEqual(["chain", "chain"]);
    expect(report.safety.notes.join(" ")).toMatch(/issuer-run token/);
  });

  it("still answers when the chain cannot be read", async () => {
    state.readMint.mockRejectedValueOnce(new Error("RPC down"));
    const report = await tokenSafety(JUP);
    expect(report.facts.controls).toBeNull();
    expect(report.safety.notes.join(" ")).toMatch(/could not be read on-chain/);
  });
});

describe("macroSnapshot", () => {
  it("takes levels from Pyth where it carries them, else Yahoo, and reads the VIX", async () => {
    state.catalogue.mockResolvedValue({ byPythSymbol: new Map([["Equity.US.SPY/USD", { id: 11 }], ["Metal.XAU/USD", { id: 12 }]]) });
    state.pythIds.mockResolvedValue([
      { id: 11, price: 718.5, marketSession: "regular" },
      { id: 12, price: 3600, marketSession: "regular" },
    ]);
    state.fetchJson.mockImplementation(async ({ url }: { url: string }) => {
      const level = url.includes("%5EVIX") ? 26.36 : url.includes("%5ETNX") ? 4.904 : 100;
      return { chart: { result: [{ meta: { regularMarketPrice: level, chartPreviousClose: level * 0.99 } }] } };
    });
    const snapshot = await macroSnapshot();
    const by = Object.fromEntries(snapshot.rows.map((row) => [row.key, row]));
    expect(by.SPY).toMatchObject({ value: 718.5, source: "pyth", session: "regular" });
    expect(by.VIX).toMatchObject({ value: 26.36, source: "yahoo", unit: "index" });
    expect(by.US10Y).toMatchObject({ value: 4.904, unit: "%" });
    expect(by.SPY.changePct).toBeCloseTo(1.01, 2);
    expect(snapshot.vix).toEqual({ level: 26.36, regime: "elevated" });
  });
});
