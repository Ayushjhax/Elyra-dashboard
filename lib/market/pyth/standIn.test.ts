import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/market/cache", () => ({
  TTL: { price: 1_000 },
  cached: async (_key: string, _ttl: number, load: () => Promise<unknown>) => ({ value: await load() }),
}));

vi.mock("@/lib/market/router", () => ({
  snapshots: async (symbols: string[]) =>
    symbols.filter((symbol) => symbol === "JUP").map((symbol) => ({ symbol, price: 0.4123, source: "okx", fetchedAt: "2026-11-26T11:00:00.000Z" })),
}));

import { cryptoBase, sessionAt, standInPrices } from "@/lib/market/pyth/standIn";

/* ---------------------------------------------------------------------------
   Yahoo stands in for the feeds Pyth's plan refuses: the right Yahoo symbol
   for each market, the price shaped like Pyth's and marked as Yahoo's, and
   a session that never claims an extended-hours price Yahoo did not give.
--------------------------------------------------------------------------- */

const OPEN = 1795617000; // 25 Nov 2026, 14:30 UTC — New York's open
const CLOSE = 1795640400;

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const asked = () => fetchMock.mock.calls.map((call) => decodeURIComponent(new URL(call[0] as string).searchParams.get("symbols") ?? ""));
function answer(known: Record<string, number>) {
  fetchMock.mockImplementation(async (url: string) => {
    const symbols = decodeURIComponent(new URL(url).searchParams.get("symbols") ?? "").split(",");
    const result = symbols
      .filter((symbol) => known[symbol] !== undefined)
      .map((symbol) => ({ symbol, response: [{ meta: { symbol, regularMarketPrice: known[symbol], regularMarketTime: OPEN + 600, currentTradingPeriod: { regular: { start: OPEN, end: CLOSE } } } }] }));
    return new Response(JSON.stringify({ spark: { result } }), { status: 200 });
  });
}

describe("Yahoo as a stand-in", () => {
  it("asks each market under its own Yahoo symbol, in one request", async () => {
    answer({ AAPL: 231.5, "^GSPC": 7182.78, "0700.HK": 612, "7203.T": 2900, "2330.TW": 1450 });
    const prices = await standInPrices(
      [
        { id: 922, symbol: "AAPL", pythSymbol: "Equity.US.AAPL/USD" },
        { id: 3290, symbol: "US500", pythSymbol: "Equity.Index.US500/USD" },
        { id: 5001, symbol: "Equity.HK.0700/HKD", pythSymbol: "Equity.HK.0700/HKD" },
        { id: 5002, symbol: "Equity.JP.7203/JPY", pythSymbol: "Equity.JP.7203/JPY" },
        { id: 5003, symbol: "Equity.TW.2330/TWD", pythSymbol: "Equity.TW.2330/TWD" },
      ],
      (OPEN + 900) * 1000,
    );
    expect(asked()).toEqual(["AAPL,^GSPC,0700.HK,7203.T,2330.TW"]);
    expect(prices.map((p) => [p.symbol, p.price, p.source])).toEqual([
      ["AAPL", 231.5, "yahoo"],
      ["US500", 7182.78, "yahoo"],
      ["Equity.HK.0700/HKD", 612, "yahoo"],
      ["Equity.JP.7203/JPY", 2900, "yahoo"],
      ["Equity.TW.2330/TWD", 1450, "yahoo"],
    ]);
  });

  it("tries KOSDAQ when KOSPI has no such Korean ticker", async () => {
    answer({ "263750.KQ": 41000 });
    const prices = await standInPrices([{ id: 6001, symbol: "Equity.KR.263750/KRW", pythSymbol: "Equity.KR.263750/KRW" }]);
    expect(asked()).toEqual(["263750.KS", "263750.KQ"]);
    expect(prices[0]).toMatchObject({ price: 41000, source: "yahoo" });
  });

  it("leaves a feed with no dependable Yahoo symbol without a price, and asks nothing for it", async () => {
    answer({});
    expect(await standInPrices([{ id: 7001, symbol: "OPENAI", pythSymbol: "Equity.Index.OPENAI/USD" }])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is quiet, not broken, when Yahoo fails", async () => {
    fetchMock.mockResolvedValue(new Response("busy", { status: 503 }));
    expect(await standInPrices([{ id: 922, symbol: "AAPL", pythSymbol: "Equity.US.AAPL/USD" }])).toEqual([]);
  });

  it("stands in for a refused coin with the exchange price, named by its exchange, and never asks Yahoo for crypto", async () => {
    answer({});
    expect(cryptoBase("Crypto.JUP/USD")).toBe("JUP");
    expect(cryptoBase("Crypto.Index.GML2/USD")).toBeNull();
    const prices = await standInPrices([{ id: 92, symbol: "JUP", pythSymbol: "Crypto.JUP/USD" }]);
    expect(prices).toEqual([expect.objectContaining({ id: 92, symbol: "JUP", price: 0.4123, source: "okx", marketSession: "regular" })]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls a price outside the regular session the last close, never pre- or post-market", () => {
    const meta = { currentTradingPeriod: { regular: { start: OPEN, end: CLOSE } } };
    expect(sessionAt(meta, OPEN + 60)).toBe("regular");
    expect(sessionAt(meta, OPEN - 60)).toBe("closed");
    expect(sessionAt(meta, CLOSE + 60)).toBe("closed");
    expect(sessionAt({}, OPEN)).toBe("closed");
  });
});
