import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   The Polymarket provider.

   Every fixture is the shape observed live against the official APIs while
   writing the adapter. The traps guarded here are the ones that produce a
   plausible wrong number rather than an error:

   - both book sides put the BEST price last
   - timestamps are seconds, not milliseconds
   - `redeemable` is money sitting unclaimed, not an ordinary open position
   - a failed read must never normalise to an empty portfolio
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

const ACCOUNT = "0xf28e42d20e4826f2b10a24bc952001697947cab2";

/* ---------------------------------------------------------------------------
   Order book
--------------------------------------------------------------------------- */

/* Observed live: bids ASCEND and asks DESCEND, so the best of each is last.
   A book ending 0.11 / 0.12 reported a midpoint of 0.115. */
const BOOK = {
  market: "0xcond",
  asset_id: "123",
  bids: [
    { price: "0.09", size: "1589479.74" },
    { price: "0.10", size: "210926.26" },
    { price: "0.11", size: "139073.42" },
  ],
  asks: [
    { price: "0.14", size: "23809.18" },
    { price: "0.13", size: "114092.57" },
    { price: "0.12", size: "147638.78" },
  ],
  min_order_size: "5",
  tick_size: "0.01",
  last_trade_price: "0.12",
};

describe("orderbook", () => {
  it("puts the best price first on both sides", async () => {
    /* Reading index 0 as "best" quotes several ticks away on BOTH sides and
       looks entirely plausible doing it. */
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    const { polymarketOrderbook } = await import("@/lib/providers/polymarket");
    const result = await polymarketOrderbook("123");

    expect(result.data?.bids[0].price).toBeCloseTo(0.11, 6);
    expect(result.data?.asks[0].price).toBeCloseTo(0.12, 6);
  });

  it("derives the midpoint the venue itself reports", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    const { polymarketOrderbook } = await import("@/lib/providers/polymarket");
    const result = await polymarketOrderbook("123");

    /* The live venue reported 0.115 for exactly this book. */
    expect(result.data?.midpoint).toBeCloseTo(0.115, 6);
    expect(result.data?.spread).toBeCloseTo(0.01, 6);
  });

  it("has no midpoint on a one-sided book", async () => {
    /* Halving a single quote would invent a midpoint for a market nobody is
       willing to take the other side of. */
    fetchMock.mockResolvedValue(jsonResponse({ ...BOOK, asks: [] }));

    const { polymarketOrderbook } = await import("@/lib/providers/polymarket");
    const result = await polymarketOrderbook("123");

    expect(result.data?.midpoint).toBeNull();
    expect(result.data?.spread).toBeNull();
  });

  it("rejects a token id that is not one without calling out", async () => {
    const { polymarketOrderbook } = await import("@/lib/providers/polymarket");
    const result = await polymarketOrderbook("not-a-token");

    expect(result.error?.code).toBe("INVALID_REQUEST");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
   Price history
--------------------------------------------------------------------------- */

describe("price history", () => {
  it("reads second-precision timestamps", async () => {
    /* `t` is seconds. Treating it as milliseconds dates every point to
       January 1970 and renders an empty-looking chart. */
    fetchMock.mockResolvedValue(
      jsonResponse({ history: [{ t: 1789441215, p: 0.125 }, { t: 1789444814, p: 0.115 }] }),
    );

    const { polymarketPriceHistory } = await import("@/lib/providers/polymarket");
    const result = await polymarketPriceHistory("123", "1d");

    expect(result.data?.[0].at).toBe(new Date(1789441215 * 1000).toISOString());
    expect(new Date(result.data![0].at).getUTCFullYear()).toBeGreaterThan(2020);
  });

  it("clamps a probability to a real range", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ history: [{ t: 1789441215, p: 1.4 }] }));

    const { polymarketPriceHistory } = await import("@/lib/providers/polymarket");
    const result = await polymarketPriceHistory("123", "1d");

    expect(result.data?.[0].probability).toBe(1);
  });
});

/* ---------------------------------------------------------------------------
   Categories
--------------------------------------------------------------------------- */

describe("categories", () => {
  it("resolves a real category from provider metadata", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 21, label: "Crypto", slug: "crypto" }));

    const { polymarketCategory } = await import("@/lib/providers/polymarket");
    const result = await polymarketCategory("crypto");

    expect(result.data?.label).toBe("Crypto");
  });

  it("reports an unknown category rather than returning nothing", async () => {
    /* Filtering on a category the provider does not have returns an empty
       list that reads as "nothing is happening", which is a different claim.
       "culture" is a real example — it looks obvious and does not exist. */
    fetchMock.mockResolvedValue(jsonResponse({}));

    const { polymarketCategory } = await import("@/lib/providers/polymarket");
    const result = await polymarketCategory("culture");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});

/* ---------------------------------------------------------------------------
   Positions — Data API v2 (v1 was retired on 2 November 2026)
--------------------------------------------------------------------------- */

/** A fresh response per call: positions asks two statuses at once, and one
    Response's body can only be read once. */
function serve(body: unknown, status = 200) {
  fetchMock.mockImplementation(async () => jsonResponse(body, status));
}

const POSITION = {
  proxy_wallet: ACCOUNT,
  token_id: "10007185038794667536165459137732078154750664230810424324462145820900729673259",
  condition_id: "0xe3d76373b86e6e95e12d7eb9c1d39644317085a40ee89709cfb9ce57e8c62c08",
  current_size: 969.8997,
  avg_price: 0.5122,
  entry_cost_usdc: 496.8214,
  current_value: 620.5,
  unrealized_pnl: 123.68,
  percent_pnl: 24.89,
  realized_pnl: 0,
  total_pnl: 123.68,
  current_price: 0.64,
  status: "OPEN",
  redeemable: false,
  title: "Will BTC be above $100k on Dec 31?",
  slug: "btc-100k",
  event_id: "254600",
  outcome: "Yes",
  outcome_index: 0,
  end_date: "2026-12-31",
  last_event_at: 1795556084,
};

const page = (rows: unknown[]) => ({ data: rows, pagination: { has_more: false, next_cursor: null } });

describe("positions", () => {
  it("normalises a live position", async () => {
    serve(page([POSITION]));

    const { polymarketPositions } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketPositions(ACCOUNT);

    const row = result.data?.[0];
    expect(result.data).toHaveLength(1);
    expect(row?.marketTitle).toBe("Will BTC be above $100k on Dec 31?");
    expect(row?.outcome).toBe("Yes");
    expect(row?.quantity).toBeCloseTo(969.8997, 4);
    /* Entry and current price ARE probabilities — 51.22% became 64%. */
    expect(row?.entryPrice).toBeCloseTo(0.5122, 4);
    expect(row?.currentPrice).toBeCloseTo(0.64, 4);
    expect(row?.currentValueUsd).toBeCloseTo(620.5, 2);
    expect(row?.costBasisUsd).toBeCloseTo(496.8214, 4);
    expect(row?.pnlUsd).toBeCloseTo(123.68, 2);
    expect(row?.status).toBe("open");
  });

  it("asks v2 for open AND resolved-unclaimed positions, never v1", async () => {
    /* v2's default status is OPEN, which leaves out a resolved market not
       yet claimed — the row that carries unclaimed winnings. */
    serve(page([]));

    const { polymarketPositions } = await import("@/lib/providers/polymarket-account");
    await polymarketPositions(ACCOUNT);

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.every((url) => url.startsWith("https://data-api.polymarket.com/v2/positions?"))).toBe(true);
    expect(urls.some((url) => url.includes("status=OPEN"))).toBe(true);
    expect(urls.some((url) => url.includes("status=REDEEMABLE"))).toBe(true);
    expect(urls.some((url) => url.includes("offset="))).toBe(false);
  });

  it("does not call a settled LOSS an unclaimed win", async () => {
    /* Verified live: Polymarket marks every position in a resolved market
       redeemable, winners and losers alike. A losing row comes back
       redeemable with current_value 0. Trusting the flag alone announced
       200 losses as unclaimed winnings. */
    serve(page([{ ...POSITION, status: "REDEEMABLE", redeemable: true, current_value: 0, current_price: 0, unrealized_pnl: -496.82 }]));

    const { polymarketPositions } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketPositions(ACCOUNT);

    expect(result.data?.[0].status).toBe("resolved");
    expect(result.data?.[0].redeemable).toBe(false);
  });

  it("excludes a settled loss from claimable value", async () => {
    serve(
      page([
        { ...POSITION, status: "REDEEMABLE", redeemable: true, current_value: 0, current_price: 0, unrealized_pnl: -496.82 },
        { ...POSITION, token_id: "t2", status: "REDEEMABLE", redeemable: true, current_value: 250, current_price: 1 },
      ]),
    );

    const { polymarketPositions } = await import("@/lib/providers/polymarket-account");
    const { exposureOf } = await import("@/lib/prediction/analytics");
    const result = await polymarketPositions(ACCOUNT);
    const exposure = exposureOf(result.data!);

    expect(exposure.claimableCount).toBe(1);
    expect(exposure.claimableValueUsd).toBeCloseTo(250, 2);
  });

  it("marks a settled winner as claimable, not merely open", async () => {
    /* Unclaimed winnings are the most actionable thing in a prediction
       portfolio, and rendering them as an ordinary position hides money the
       user could take today. */
    serve(page([{ ...POSITION, status: "REDEEMABLE", redeemable: true, current_value: 620.5, current_price: 1 }]));

    const { polymarketPositions } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketPositions(ACCOUNT);

    expect(result.data?.[0].status).toBe("claimable");
    expect(result.data?.[0].redeemable).toBe(true);
  });

  it("distinguishes a settled loser from a long shot still trading", async () => {
    const settled = { ...POSITION, current_price: 0, end_date: "2026-01-01", redeemable: false };
    const longShot = { ...POSITION, token_id: "t2", current_price: 0.02, end_date: "2026-12-31" };
    serve(page([settled, longShot]));

    const { polymarketPositions } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketPositions(ACCOUNT);

    expect(result.data?.[0].status).toBe("resolved");
    expect(result.data?.[1].status).toBe("open");
  });

  it("hides dust under the share threshold", async () => {
    serve(page([POSITION, { ...POSITION, token_id: "dust", current_size: 0.4, current_value: 0.2 }]));

    const { polymarketPositions } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketPositions(ACCOUNT);

    expect(result.data?.map((row) => row.id)).toEqual([POSITION.token_id]);
  });

  it("returns a failure, never an empty portfolio, when the API is down", async () => {
    /* The single most important rule here: "we could not read your positions"
       and "you have none" are opposite claims about someone's money. */
    serve("upstream", 503);

    const { polymarketPositions } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketPositions(ACCOUNT);

    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
  });

  it("returns a failure when v1's retirement notice comes back", async () => {
    serve({ error: "Data API v1 has been retired", migration: "https://data-api.polymarket.com/v2/" });

    const { polymarketPositions } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketPositions(ACCOUNT);

    expect(result.ok).toBe(false);
  });

  it("does not retry an authentication failure", async () => {
    serve("nope", 403);

    const { polymarketPositions } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketPositions(ACCOUNT);

    expect(result.error?.code).toBe("AUTH");
    /* One call per status, and neither is retried. */
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("survives a malformed body without throwing", async () => {
    fetchMock.mockImplementation(async () => new Response("<html>nope</html>", { status: 200 }));

    const { polymarketPositions } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketPositions(ACCOUNT);

    expect(result.ok).toBe(false);
  });

  it("rejects a non-address without calling out", async () => {
    const { polymarketPositions } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketPositions("nope");

    expect(result.error?.code).toBe("INVALID_REQUEST");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("account value", () => {
  it("reads v2's object envelope", async () => {
    serve({ data: { proxy_wallet: ACCOUNT, value: 104547.5875 } });

    const { polymarketAccountValue } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketAccountValue(ACCOUNT);

    expect(result.data).toBeCloseTo(104547.5875, 4);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://data-api.polymarket.com/v2/value?user=${ACCOUNT.toLowerCase()}`);
  });
});

describe("closed positions", () => {
  it("reads exited and resolved positions with their final result", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      jsonResponse(
        page(
          String(url).includes("status=CLOSED")
            ? [{ ...POSITION, status: "CLOSED", current_size: 0, current_value: 0, realized_pnl: 71.5, total_pnl: 71.5, last_event_at: 1794780142 }]
            : [{ ...POSITION, token_id: "t2", status: "REDEEMABLE", redeemable: true, current_value: 0, total_pnl: -40, last_event_at: 1794000000 }],
        ),
      ),
    );

    const { polymarketClosedPositions } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketClosedPositions(ACCOUNT, 1790000000);

    expect(result.data?.map((row) => row.pnlUsd)).toEqual([71.5, -40]);
    expect(result.data?.[0].at).toBe(new Date(1794780142 * 1000).toISOString());
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.every((url) => url.includes("start=1790000000"))).toBe(true);
  });
});

describe("deposits and withdrawals", () => {
  it("asks for them explicitly and signs them", async () => {
    serve(
      page([
        { timestamp: 1793809903, type: "DEPOSIT", usdc_size: 130000, transaction_hash: "0xa" },
        { timestamp: 1793900000, type: "WITHDRAWAL", usdc_size: 5000, transaction_hash: "0xb" },
        { timestamp: 1793900100, type: "TRADE", usdc_size: 30 },
      ]),
    );

    const { polymarketFlows } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketFlows(ACCOUNT, 1790000000);

    expect(result.data?.map((flow) => flow.usd)).toEqual([130000, -5000]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("exclude_deposits_withdrawals=false");
    expect(url).toContain("type=DEPOSIT%2CWITHDRAWAL");
  });
});

/* ---------------------------------------------------------------------------
   Activity
--------------------------------------------------------------------------- */

describe("activity", () => {
  it("maps provider verbs onto the ledger's vocabulary", async () => {
    serve(
      page([
        { timestamp: 1789525482, type: "REDEEM", size: 466, usdc_size: 466, title: "A", condition_id: "0x1" },
        { timestamp: 1789525400, type: "TRADE", side: "BUY", size: 10, usdc_size: 4, price: 0.4, title: "B", condition_id: "0x2" },
        { timestamp: 1789525300, type: "TRADE", side: "SELL", size: 10, usdc_size: 6, price: 0.6, title: "C", condition_id: "0x3" },
      ]),
    );

    const { polymarketActivity } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketActivity(ACCOUNT, 10);

    expect(result.data?.map((r) => r.kind)).toEqual([
      "prediction_redeem",
      "prediction_buy",
      "prediction_sell",
    ]);
    expect(result.data?.[0].usdValue).toBe(466);
  });

  it("does not guess a direction for an unrecognised type", async () => {
    /* A mislabelled direction in a ledger is worse than an unlabelled row. */
    serve(page([{ timestamp: 1789525482, type: "SOMETHING_NEW", condition_id: "0x1" }]));

    const { polymarketActivity } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketActivity(ACCOUNT, 10);

    expect(result.data?.[0].kind).toBe("prediction_other");
  });

  it("reads second-precision timestamps", async () => {
    serve(page([{ timestamp: 1789525482, type: "REDEEM", condition_id: "0x1" }]));

    const { polymarketActivity } = await import("@/lib/providers/polymarket-account");
    const result = await polymarketActivity(ACCOUNT, 10);

    expect(new Date(result.data![0].at).getUTCFullYear()).toBeGreaterThan(2020);
  });
});

/* ---------------------------------------------------------------------------
   Search
--------------------------------------------------------------------------- */

describe("polymarketSearch", () => {
  it("queries /public-search rather than the ignored /markets?search=", async () => {
    /* Gamma accepts `search=` on /markets, answers 200, and SILENTLY IGNORES
       it — verified live: "bitcoin" and "election" both returned the same
       top-volume Fed markets. Every text query therefore resolved to whatever
       traded most, and the order book downstream was read, analysed and
       captioned with the market the user actually named.

       The URL is asserted because the failure is invisible in the response:
       no error, no empty list, nothing to notice. */
    fetchMock.mockResolvedValue(jsonResponse({ events: [] }));

    const { polymarketSearch } = await import("@/lib/providers/polymarket");
    await polymarketSearch("bitcoin", 3);

    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/public-search");
    expect(url).toContain("q=bitcoin");
    expect(url).not.toContain("/markets?");
  });

  it("preserves the venue's relevance order across events", async () => {
    /* Event order is relevance; volume ranks only WITHIN an event. Re-sorting
       the flattened list by volume would hand back whatever trades most
       anywhere, which is the bug this replaced. */
    fetchMock.mockResolvedValue(
      jsonResponse({
        events: [
          {
            id: "1",
            title: "Bitcoin above X?",
            markets: [
              {
                id: "10",
                question: "Bitcoin above 76k?",
                outcomes: '["Yes","No"]',
                outcomePrices: '["0.4","0.6"]',
                volume24hr: "1000",
              },
              {
                id: "11",
                question: "Bitcoin above 80k?",
                outcomes: '["Yes","No"]',
                outcomePrices: '["0.2","0.8"]',
                volume24hr: "5000",
              },
            ],
          },
          {
            id: "2",
            title: "Fed decision",
            markets: [
              {
                id: "20",
                question: "No change in Fed rates?",
                outcomes: '["Yes","No"]',
                outcomePrices: '["0.1","0.9"]',
                /* Far busier, and from a LESS relevant event. */
                volume24hr: "9000000",
              },
            ],
          },
        ],
      }),
    );

    const { polymarketSearch } = await import("@/lib/providers/polymarket");
    const result = await polymarketSearch("bitcoin", 5);

    /* Busiest market of the most relevant event leads. */
    expect(result.data?.[0].question).toBe("Bitcoin above 80k?");
    expect(result.data?.[1].question).toBe("Bitcoin above 76k?");
    /* The nine-million-dollar Fed market comes last, not first. */
    expect(result.data?.[2].question).toBe("No change in Fed rates?");
  });

  it("drops closed markets from results", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        events: [
          {
            id: "1",
            title: "Event",
            markets: [
              {
                id: "10",
                question: "Settled already?",
                outcomes: '["Yes","No"]',
                outcomePrices: '["1","0"]',
                closed: true,
              },
              {
                id: "11",
                question: "Still open?",
                outcomes: '["Yes","No"]',
                outcomePrices: '["0.5","0.5"]',
              },
            ],
          },
        ],
      }),
    );

    const { polymarketSearch } = await import("@/lib/providers/polymarket");
    const result = await polymarketSearch("anything", 5);

    expect(result.data).toHaveLength(1);
    expect(result.data?.[0].question).toBe("Still open?");
  });
});
