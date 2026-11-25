import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/market/cache", () => ({
  TTL: { price: 1_000 },
  cached: async (_key: string, _ttl: number, load: () => Promise<unknown>) => ({ value: await load() }),
}));
vi.mock("@/lib/market/pyth/catalog", () => ({
  pythApiKey: () => "test-key",
  catalogue: async () => ({
    byId: new Map([
      [1, { symbol: "BTC", assetType: "crypto", pythSymbol: "Crypto.BTC/USD" }],
      [2, { symbol: "ETH", assetType: "crypto", pythSymbol: "Crypto.ETH/USD" }],
      [922, { symbol: "AAPL", assetType: "equity", pythSymbol: "Equity.US.AAPL/USD" }],
      [923, { symbol: "MSFT", assetType: "equity", pythSymbol: "Equity.US.MSFT/USD" }],
      [3290, { symbol: "US500", assetType: "equity", pythSymbol: "Equity.Index.US500/USD" }],
    ]),
  }),
}));

import { PRICE_URL, grantGroup, latestPriceBody, pricesForIds, refusedFeed, unwrapLatest } from "@/lib/market/pyth/client";
import { PythError } from "@/lib/market/pyth/types";

const feed = (id: number, price: string) => ({ priceFeedId: id, price, exponent: -8, publisherCount: 3, feedUpdateTimestamp: 1795621264400000 });
const answer = (...feeds: ReturnType<typeof feed>[]) => new Response(JSON.stringify({ parsed: { timestampUs: "1795621264400000", priceFeeds: feeds } }), { status: 200 });
const refusal = (id: number) => new Response(`Not entitled: feed ${id} (no grant accepts this feed)`, { status: 403 });
const askedFor = (call: unknown[]) => (JSON.parse((call[1] as { body: string }).body) as { priceFeedIds: number[] }).priceFeedIds;

/* A real answer from POST /v1/latest_price, 25 November 2026. */
const ANSWER = {
  parsed: {
    timestampUs: "1795621264400000",
    priceFeeds: [
      {
        priceFeedId: 1,
        price: "5823934060079",
        bestBidPrice: "5823920504682",
        bestAskPrice: "5824055324245",
        publisherCount: 28,
        exponent: -8,
        confidence: 5105939921,
        marketSession: "regular",
        emaPrice: "5806773409000",
        feedUpdateTimestamp: 1795621264400000,
      },
    ],
  },
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("Pyth's latest price read", () => {
  it("asks the price host by POST for every field the decoder reads", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(ANSWER), { status: 200 }));
    const [btc] = await pricesForIds([1]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(PRICE_URL);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toEqual(latestPriceBody([1]));
    expect(btc).toMatchObject({ id: 1, symbol: "BTC", publisherCount: 28, marketSession: "regular" });
    expect(btc.price).toBeCloseTo(58239.34, 2);
    expect(btc.bestBid).toBeCloseTo(58239.2, 1);
  });

  it("says when the plan, not the key, is short", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Not entitled: feed 923 (no grant accepts this feed)", { status: 403 }));
    await expect(pricesForIds([923])).rejects.toThrow(/plan for PYTH_API_KEY does not cover/);
  });

  it("keeps the plain message for a refusal with no reason, such as a block page", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<!DOCTYPE html><title>Attention Required</title>", { status: 403 }));
    await expect(pricesForIds([2])).rejects.toThrow("Pyth rejected the API key. Check PYTH_API_KEY.");
  });

  it("refuses an answer without its parsed feeds", () => {
    expect(() => unwrapLatest({ priceFeeds: [] })).toThrow(/no priceFeeds/);
    expect(unwrapLatest(ANSWER).priceFeeds).toHaveLength(1);
  });
});

describe("a plan that covers only some feeds", () => {
  it("groups feeds by the grant they fall under", () => {
    expect(grantGroup({ assetType: "crypto", pythSymbol: "Crypto.BTC/USD" })).toBe("crypto");
    expect(grantGroup({ assetType: "equity", pythSymbol: "Equity.US.AAPL/USD" })).toBe("Equity.US");
    expect(grantGroup({ assetType: "equity", pythSymbol: "Equity.Index.US500/USD" })).toBe("Equity.Index");
    expect(refusedFeed(new PythError("unauthorized", "Pyth's plan … (Not entitled: feed 922 (no grant))"))).toBe(922);
    expect(refusedFeed(new PythError("upstream", "Not entitled: feed 922"))).toBeNull();
  });

  it("keeps crypto when the plan has no equities, and stops asking for the refused group", async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      const ids = (JSON.parse(init.body) as { priceFeedIds: number[] }).priceFeedIds;
      return ids.includes(922) || ids.includes(923) ? refusal(ids.includes(922) ? 922 : 923) : answer(feed(1, "5800000000000"), feed(2, "164000000000"));
    });
    const prices = await pricesForIds([1, 2, 922, 923]);
    expect(prices.map((p) => p.symbol).sort()).toEqual(["BTC", "ETH"]);

    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => answer(feed(1, "5800000000000"), feed(2, "164000000000")));
    await pricesForIds([1, 2, 922, 923]);
    expect(fetchMock.mock.calls.flatMap(askedFor).sort()).toEqual([1, 2]);
    await expect(pricesForIds([922])).rejects.toThrow(/does not cover/);
  });

  it("drops one gated feed and keeps the rest of its group", async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      const ids = (JSON.parse(init.body) as { priceFeedIds: number[] }).priceFeedIds;
      return ids.includes(3290) ? refusal(3290) : answer(feed(1, "5800000000000"));
    });
    const prices = await pricesForIds([3290]).catch(() => []);
    expect(prices).toEqual([]);
  });
});
