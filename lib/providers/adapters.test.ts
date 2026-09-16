import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   The adapters added for the unified Capital OS: Kamino, Raydium, Polymarket,
   Binance public, Hyperliquid public, DFlow.

   Every fixture below is the SHAPE OBSERVED LIVE while writing the adapters —
   Kamino's decimal strings, Polymarket's JSON-encoded outcome arrays,
   Hyperliquid's positional two-array join. The traps these guard are the ones
   that survive a code review because the wrong answer looks reasonable:
   an unindexed protocol section rendering as $0, a probability read off a
   misaligned array, funding rates compared across venues with different
   settlement intervals.
--------------------------------------------------------------------------- */

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const { resetProviderHealth, clearProviderCache } = await import("@/lib/providers/http");
  resetProviderHealth();
  clearProviderCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const WALLET = "AxqtG9SHDkZTLSWg81Sp7VqAzQpRqXtR9ziJ3VQAS8As";

/* ---------------------------------------------------------------------------
   Kamino
--------------------------------------------------------------------------- */

const KAMINO_SECTIONS = {
  lending: { indexed: true, positionsRefreshedOn: null, pricesRefreshedOn: null, errors: [] },
  multiply: { indexed: true, positionsRefreshedOn: null, pricesRefreshedOn: null, errors: [] },
  leverage: { indexed: true, positionsRefreshedOn: null, pricesRefreshedOn: null, errors: [] },
  liquidity: { indexed: true, positionsRefreshedOn: null, pricesRefreshedOn: null, errors: [] },
  earn: { indexed: true, positionsRefreshedOn: null, pricesRefreshedOn: null, errors: [] },
  privateCredit: { indexed: true, positionsRefreshedOn: null, pricesRefreshedOn: null, errors: [] },
  staking: { indexed: true, positionsRefreshedOn: null, pricesRefreshedOn: null, errors: [] },
};

/* Copied from Kamino's own OpenAPI example: every figure is a string. */
const KAMINO_OBLIGATION = {
  obligation: "2JsWdyxA15WodMBzRY5uNUJDvL71xm9NwfMj6qdYi3SC",
  market: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
  tag: "Multiply",
  netValue: "39.032947857306441512",
  totalDepositValue: "124.32509095187057771",
  totalBorrowValue: "85.292143094564136198",
  ltv: "0.68604126843215345899",
  maxLtv: "0.87000000000000000002",
  liquidationLtv: "0.91999999999999999997",
  leverage: "3.1851319917308934971",
  deposits: [
    {
      mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
      symbol: "JitoSOL",
      amount: "1.4488817124626824571",
      value: "124.32509095187057771",
      price: "85.807619685221685924",
    },
  ],
  borrows: [
    {
      mint: "So11111111111111111111111111111111111111112",
      symbol: "SOL",
      amount: "1.276825076608483649",
      value: "85.292143094564136198",
      price: "66.80017855",
    },
  ],
};

describe("kamino", () => {
  it("parses decimal strings into numbers", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        timestamp: "2026-09-16T00:00:00.000Z",
        sections: KAMINO_SECTIONS,
        multiply: [KAMINO_OBLIGATION],
      }),
    );

    const { kaminoPositions } = await import("@/lib/providers/kamino");
    const result = await kaminoPositions(WALLET);

    expect(result.ok).toBe(true);
    const position = result.data?.[0];
    /* Every one of these arrives as a string on the wire. A caller doing
       arithmetic on the raw field gets string concatenation, not a sum. */
    expect(position?.netUsd).toBeCloseTo(39.0329, 3);
    expect(position?.borrowedUsd).toBeCloseTo(85.2921, 3);
    expect(position?.ltv).toBeCloseTo(0.686, 3);
    expect(position?.liquidationLtv).toBeCloseTo(0.92, 3);
    expect(position?.supplied[0].amount).toBeCloseTo(1.44888, 4);
  });

  it("reports an unindexed section as a warning, never as no position", async () => {
    /* The failure this prevents: a leveraged position that Kamino has not
       indexed disappearing from a risk screen while it is still liquidatable. */
    fetchMock.mockResolvedValue(
      jsonResponse({
        timestamp: "2026-09-16T00:00:00.000Z",
        sections: { ...KAMINO_SECTIONS, leverage: { indexed: false, errors: [] } },
        lending: [],
      }),
    );

    const { kaminoPositions } = await import("@/lib/providers/kamino");
    const result = await kaminoPositions(WALLET);

    expect(result.ok).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.warnings?.join(" ")).toMatch(/leverage.*not indexed/i);
  });

  it("surfaces a section error", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        sections: { ...KAMINO_SECTIONS, earn: { indexed: true, errors: ["boom"] } },
      }),
    );

    const { kaminoPositions } = await import("@/lib/providers/kamino");
    const result = await kaminoPositions(WALLET);

    expect(result.partial).toBe(true);
    expect(result.warnings?.join(" ")).toMatch(/error reading earn/i);
  });

  it("does not report an LTV for a position with no borrows", async () => {
    /* Nothing borrowed is not a 0% LTV — it is a ratio with no meaningful
       denominator, and a risk table should show a dash. */
    fetchMock.mockResolvedValue(
      jsonResponse({
        sections: KAMINO_SECTIONS,
        lending: [{ ...KAMINO_OBLIGATION, borrows: [], ltv: "0" }],
      }),
    );

    const { kaminoPositions } = await import("@/lib/providers/kamino");
    const result = await kaminoPositions(WALLET);

    expect(result.data?.[0].ltv).toBeNull();
  });

  it("uses the provider's own timestamp rather than our clock", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ timestamp: "2026-01-01T00:00:00.000Z", sections: {}, lending: [] }),
    );

    const { kaminoPositions } = await import("@/lib/providers/kamino");
    const result = await kaminoPositions(WALLET);

    /* Kamino indexes on a cadence; stamping "now" would claim the positions
       were read at request time when they may be an hour old. */
    expect(result.asOf).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects something that is not an address without calling out", async () => {
    const { kaminoPositions } = await import("@/lib/providers/kamino");
    const result = await kaminoPositions("nope");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_REQUEST");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a failure, not an empty portfolio, when Kamino is down", async () => {
    fetchMock.mockResolvedValue(new Response("upstream", { status: 503 }));

    const { kaminoPositions } = await import("@/lib/providers/kamino");
    const result = await kaminoPositions(WALLET);

    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
  });
});

describe("liquidationHeadroom", () => {
  it("is null unless both figures came from the provider", async () => {
    const { liquidationHeadroom } = await import("@/lib/providers/types");
    const base = {
      id: "x",
      provider: "kamino" as const,
      kind: "lending" as const,
      label: "x",
      netUsd: 1,
      suppliedUsd: 1,
      borrowedUsd: 1,
      supplied: [],
      borrowed: [],
      leverage: 3,
      apy: null,
    };

    /* Leverage is present in both of these. Deriving a distance from it is
       exactly the estimate this function exists to refuse. */
    expect(liquidationHeadroom({ ...base, ltv: 0.5, liquidationLtv: null })).toBeNull();
    expect(liquidationHeadroom({ ...base, ltv: null, liquidationLtv: 0.9 })).toBeNull();
    expect(liquidationHeadroom({ ...base, ltv: 0.45, liquidationLtv: 0.9 })).toBeCloseTo(0.5, 6);
  });
});

/* ---------------------------------------------------------------------------
   Polymarket
--------------------------------------------------------------------------- */

const PM_MARKET = {
  id: "2252244",
  question: "Will there be no change in Fed interest rates?",
  slug: "fed-september",
  /* Observed live: JSON-encoded strings, not arrays. */
  outcomes: '["Yes", "No"]',
  outcomePrices: '["0.115", "0.885"]',
  liquidity: "1037180.2791",
  volume24hr: 6430262.81,
  endDate: "2026-09-16T00:00:00Z",
  closed: false,
};

describe("polymarket", () => {
  it("parses outcomes delivered as a JSON-encoded string", async () => {
    fetchMock.mockResolvedValue(jsonResponse([PM_MARKET]));

    const { polymarketTrending } = await import("@/lib/providers/polymarket");
    const result = await polymarketTrending(1);

    /* Iterating the raw field yields the characters of a string — "[", "\"",
       "Y" — which renders as a market with 15 nonsense outcomes. */
    expect(result.data?.[0].outcomes).toEqual([
      { label: "Yes", price: 0.115 },
      { label: "No", price: 0.885 },
    ]);
  });

  it("accepts real arrays too, in case the field stops being encoded", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ ...PM_MARKET, outcomes: ["Yes", "No"], outcomePrices: ["0.4", "0.6"] }]),
    );

    const { polymarketTrending } = await import("@/lib/providers/polymarket");
    const result = await polymarketTrending(1);

    expect(result.data?.[0].outcomes[0].price).toBeCloseTo(0.4, 6);
  });

  it("drops a market whose prices do not line up with its outcomes", async () => {
    /* Three labels and two prices has no correct interpretation. Guessing the
       alignment puts a wrong probability beside a real question. */
    fetchMock.mockResolvedValue(
      jsonResponse([{ ...PM_MARKET, outcomes: '["A","B","C"]', outcomePrices: '["0.5","0.5"]' }]),
    );

    const { polymarketTrending } = await import("@/lib/providers/polymarket");
    const result = await polymarketTrending(5);

    expect(result.data).toHaveLength(0);
    expect(result.partial).toBe(true);
    expect(result.warnings?.join(" ")).toMatch(/skipped/i);
  });

  it("clamps a crossed book to a real probability", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ ...PM_MARKET, outcomePrices: '["1.04", "-0.02"]' }]),
    );

    const { polymarketTrending } = await import("@/lib/providers/polymarket");
    const result = await polymarketTrending(1);

    /* A 104% probability on screen destroys trust in every number near it. */
    expect(result.data?.[0].outcomes[0].price).toBe(1);
    expect(result.data?.[0].outcomes[1].price).toBe(0);
  });

  it("fails rather than returning nothing when the shape is wrong", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }));

    const { polymarketTrending } = await import("@/lib/providers/polymarket");
    const result = await polymarketTrending(1);

    expect(result.ok).toBe(false);
  });

  it("will not search for an empty term", async () => {
    const { polymarketSearch } = await import("@/lib/providers/polymarket");
    const result = await polymarketSearch("   ");

    expect(result.error?.code).toBe("INVALID_REQUEST");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
   Hyperliquid
--------------------------------------------------------------------------- */

const HL_META = [
  { universe: [{ name: "BTC", maxLeverage: 40 }, { name: "SOL", maxLeverage: 20 }] },
  [
    { funding: "0.0000125", openInterest: "36024.9", markPx: "75691.0", oraclePx: "75729.0", dayNtlVlm: "5497828234.16" },
    { funding: "-0.0000098", openInterest: "912344.1", markPx: "96.88", oraclePx: "96.93", dayNtlVlm: "412344234.10" },
  ],
];

describe("hyperliquid public", () => {
  it("joins the universe and context arrays positionally", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HL_META));

    const { hyperliquidMarkets } = await import("@/lib/providers/hyperliquid-public");
    const result = await hyperliquidMarkets();

    const sol = result.data?.find((market) => market.symbol === "SOL");
    expect(sol?.markPrice).toBeCloseTo(96.88, 4);
    expect(sol?.fundingRate).toBeCloseTo(-0.0000098, 9);
    expect(sol?.maxLeverage).toBe(20);
  });

  it("drops everything when the two arrays disagree on length", async () => {
    /* Nothing says a short array was truncated from the END, so the overlap
       is not trustworthy either — and attaching BTC's funding rate to SOL is
       a wrong number that looks entirely plausible. */
    fetchMock.mockResolvedValue(jsonResponse([HL_META[0], [HL_META[1] as never].flat().slice(0, 1)]));

    const { hyperliquidMarkets } = await import("@/lib/providers/hyperliquid-public");
    const result = await hyperliquidMarkets();

    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/mismatched/i);
  });

  it("reports funding as hourly", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HL_META));

    const { hyperliquidMarket } = await import("@/lib/providers/hyperliquid-public");
    const result = await hyperliquidMarket("SOL");

    /* Hyperliquid settles hourly and Binance every eight hours. Comparing the
       raw rates without this is off by 8x. */
    expect(result.data?.fundingIntervalHours).toBe(1);
  });

  it("strips a quote suffix when looking up a market", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HL_META));

    const { hyperliquidMarket } = await import("@/lib/providers/hyperliquid-public");
    expect((await hyperliquidMarket("SOL-PERP")).data?.symbol).toBe("SOL");
  });

  it("says NOT_FOUND for an unlisted market rather than inventing one", async () => {
    fetchMock.mockResolvedValue(jsonResponse(HL_META));

    const { hyperliquidMarket } = await import("@/lib/providers/hyperliquid-public");
    expect((await hyperliquidMarket("DOGE")).error?.code).toBe("NOT_FOUND");
  });
});

/* ---------------------------------------------------------------------------
   Binance public
--------------------------------------------------------------------------- */

describe("binance public", () => {
  it("normalises a loose symbol", async () => {
    const { binanceSymbol } = await import("@/lib/providers/binance-public");
    expect(binanceSymbol("sol")).toBe("SOLUSDT");
    expect(binanceSymbol("SOL/USDT")).toBe("SOLUSDT");
    expect(binanceSymbol("BTCUSDC")).toBe("BTCUSDC");
    expect(binanceSymbol("ETHBTC")).toBe("ETHBTC");
  });

  it("quotes a bare BTC or ETH rather than reading it as a pair", async () => {
    /* The regression: a trailing quote currency is only a quote currency when
       something precedes it. Without that, the two most-asked-about assets in
       the product query symbols Binance does not list. */
    const { binanceSymbol } = await import("@/lib/providers/binance-public");
    expect(binanceSymbol("BTC")).toBe("BTCUSDT");
    expect(binanceSymbol("ETH")).toBe("ETHUSDT");
    expect(binanceSymbol("bnb")).toBe("BNBUSDT");
  });

  it("parses a 24h ticker", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        symbol: "SOLUSDT",
        lastPrice: "96.93000000",
        priceChangePercent: "-5.416",
        highPrice: "103.00",
        lowPrice: "95.10",
        volume: "4231.5",
        quoteVolume: "412344.2",
      }),
    );

    const { binanceTicker } = await import("@/lib/providers/binance-public");
    const result = await binanceTicker("SOL");

    expect(result.data?.lastPrice).toBeCloseTo(96.93, 4);
    expect(result.data?.change24hPct).toBeCloseTo(-5.416, 4);
  });

  it("treats an unknown symbol as NOT_FOUND, not as a price of zero", async () => {
    /* Binance answers 200 with an error object rather than a 404, so status
       alone does not establish that this worked. */
    fetchMock.mockResolvedValue(jsonResponse({ code: -1121, msg: "Invalid symbol." }));

    const { binanceTicker } = await import("@/lib/providers/binance-public");
    const result = await binanceTicker("NOTATOKEN");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("reports funding with its eight-hour interval", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        symbol: "SOLUSDT",
        markPrice: "96.88000000",
        indexPrice: "96.93281081",
        lastFundingRate: "-0.00003984",
        nextFundingTime: 1789545600000,
      }),
    );

    const { binanceFunding, annualisedFundingPct } = await import(
      "@/lib/providers/binance-public"
    );
    const result = await binanceFunding("SOL");

    expect(result.data?.fundingIntervalHours).toBe(8);
    expect(result.data?.nextFundingAt).toBe(new Date(1789545600000).toISOString());

    /* -0.00003984 × 3 × 365 × 100 = -4.362% a year. */
    expect(annualisedFundingPct(result.data!)).toBeCloseTo(-4.362, 2);
  });

  it("annualises hourly and eight-hourly funding differently", async () => {
    const { annualisedFundingPct } = await import("@/lib/providers/binance-public");
    const base = {
      symbol: "SOL",
      provider: "binance" as const,
      markPrice: 1,
      indexPrice: 1,
      fundingRate: 0.0001,
      nextFundingAt: null,
      openInterest: null,
      volume24hUsd: null,
      maxLeverage: null,
    };

    const hourly = annualisedFundingPct({ ...base, fundingIntervalHours: 1 });
    const eightHourly = annualisedFundingPct({ ...base, fundingIntervalHours: 8 });

    expect(hourly).toBeCloseTo(87.6, 1);
    expect(eightHourly).toBeCloseTo(10.95, 2);
    /* The whole reason the interval travels with the rate. */
    expect(hourly! / eightHourly!).toBeCloseTo(8, 6);
  });

  it("returns null rather than guessing when the interval is unknown", async () => {
    const { annualisedFundingPct } = await import("@/lib/providers/binance-public");
    expect(
      annualisedFundingPct({
        symbol: "X",
        provider: "binance",
        markPrice: 1,
        indexPrice: null,
        fundingRate: 0.0001,
        fundingIntervalHours: null,
        nextFundingAt: null,
        openInterest: null,
        volume24hUsd: null,
        maxLeverage: null,
      }),
    ).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
   Raydium
--------------------------------------------------------------------------- */

describe("raydium", () => {
  const POOL = {
    id: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
    type: "Standard",
    mintA: { address: "So111", symbol: "WSOL", decimals: 9 },
    mintB: { address: "EPjFW", symbol: "USDC", decimals: 6 },
    tvl: 32555483.68,
    feeRate: 0.0025,
    day: { volume: 28259206.04, apr: 139.21, feeApr: 79.21, rewardApr: [60, 0] },
  };

  it("keeps fee APR separate from emissions", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { count: 1, data: [POOL] } }),
    );

    const { raydiumPools } = await import("@/lib/providers/raydium");
    const result = await raydiumPools("So111", "EPjFW");

    /* A pool paying 79% in fees and 60% in its own token is not a 139% pool
       in any sense an allocator cares about. */
    expect(result.data?.[0].feeApr24h).toBeCloseTo(79.21, 2);
    expect(result.data?.[0].totalApr24h).toBeCloseTo(139.21, 2);
    expect(result.data?.[0].pair).toBe("WSOL-USDC");
  });

  it("treats success:false as a failure despite the 200", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, data: null }));

    const { raydiumPools } = await import("@/lib/providers/raydium");
    const result = await raydiumPools("So111", "EPjFW");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_REQUEST");
  });

  it("requires two mints", async () => {
    const { raydiumPools } = await import("@/lib/providers/raydium");
    expect((await raydiumPools("", "EPjFW")).error?.code).toBe("INVALID_REQUEST");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
   DFlow
--------------------------------------------------------------------------- */

describe("dflow", () => {
  it("is never a routing candidate and says why", async () => {
    const { dflowSwapQuote, dflowProvider } = await import("@/lib/providers/dflow");

    expect(dflowProvider.configured()).toBe(false);

    const result = await dflowSwapQuote();
    expect(result.error?.code).toBe("UNSUPPORTED");
    /* "Not connected" is true. An empty route list would read as "DFlow has
       no route for this pair", which is a claim nobody verified. */
    expect(result.error?.message).toMatch(/not connected/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays unconfigured even when a credential is present", async () => {
    process.env.DFLOW_API_KEY = "placeholder-not-a-real-credential";
    try {
      const { dflowProvider, dflowCredentialPresent } = await import("@/lib/providers/dflow");
      expect(dflowCredentialPresent()).toBe(true);
      /* A key does not supply the response schema the adapter would need. */
      expect(dflowProvider.configured()).toBe(false);
    } finally {
      delete process.env.DFLOW_API_KEY;
    }
  });
});

/* ---------------------------------------------------------------------------
   Router
--------------------------------------------------------------------------- */

describe("router — defi and perps", () => {
  it("combines protocols and reports the stalest timestamp", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        timestamp: "2026-01-01T00:00:00.000Z",
        sections: KAMINO_SECTIONS,
        multiply: [KAMINO_OBLIGATION],
      }),
    );

    const { routeDefiPositions } = await import("@/lib/providers/router");
    const result = await routeDefiPositions(WALLET);

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.asOf).toBe("2026-01-01T00:00:00.000Z");
  });

  it("falls back to Binance for a perp Hyperliquid does not list", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("hyperliquid")) return jsonResponse(HL_META);
      return jsonResponse({
        symbol: "DOGEUSDT",
        markPrice: "0.21",
        indexPrice: "0.21",
        lastFundingRate: "0.00001",
        nextFundingTime: 1789545600000,
      });
    });

    const { routePerpMarket } = await import("@/lib/providers/router");
    const result = await routePerpMarket("DOGE");

    expect(result.ok).toBe(true);
    expect(result.data?.provider).toBe("binance");
    expect(result.data?.fundingIntervalHours).toBe(8);
  });

  it("prefers Hyperliquid, the venue this product trades on", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("hyperliquid")) return jsonResponse(HL_META);
      throw new Error("binance should not have been called");
    });

    const { routePerpMarket } = await import("@/lib/providers/router");
    const result = await routePerpMarket("SOL");

    expect(result.data?.provider).toBe("hyperliquid");
  });

  it("never routes a swap quote to DFlow", async () => {
    process.env.JUPITER_API_KEY = "test-key-not-a-real-credential";
    try {
      const { providersFor } = await import("@/lib/providers/router");
      expect(providersFor("swap_quote")).not.toContain("dflow");
    } finally {
      delete process.env.JUPITER_API_KEY;
    }
  });

  it("drops a protocol from the candidate list when its flag is off", async () => {
    process.env.ENABLE_KAMINO = "false";
    try {
      const { providersFor } = await import("@/lib/providers/router");
      expect(providersFor("defi_positions")).not.toContain("kamino");
    } finally {
      delete process.env.ENABLE_KAMINO;
    }
  });
});
