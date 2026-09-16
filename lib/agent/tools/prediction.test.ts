import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   The prediction tool layer, and the Telegram surface above it.

   One rule dominates this file:

     NOT CONNECTED IS NOT ZERO.

   Polymarket holds positions in a proxy wallet whose address is not the
   user's EOA, so an unlinked account cannot be read at all. "$0 in prediction
   markets" is then a false statement about someone's money — and the one they
   are least likely to question, because zero looks like an answer.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  positions: null as unknown,
  activity: null as unknown,
  trending: null as unknown,
  events: null as unknown,
  category: null as unknown,
}));

vi.mock("@/lib/providers/polymarket-account", () => ({
  polymarketPositions: async () => state.positions,
  polymarketActivity: async () => state.activity,
  ORDERS_REQUIRE_AUTH:
    "Open orders are not public on Polymarket — reading them needs an authenticated CLOB session.",
}));

/* Partial mock: the router imports the adapter descriptor from this module,
   so replacing the whole thing would break an import chain that has nothing
   to do with these tests. */
vi.mock("@/lib/providers/polymarket", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/providers/polymarket")>()),
  polymarketTrending: async () => state.trending,
  polymarketSearchEvents: async () => state.events,
  polymarketEvents: async () => state.events,
  polymarketCategory: async () => state.category,
  polymarketMarket: async () => ({ ok: false, provider: "polymarket", asOf: "" }),
  polymarketEvent: async () => ({ ok: false, provider: "polymarket", asOf: "" }),
  polymarketOrderbook: async () => ({ ok: false, provider: "polymarket", asOf: "" }),
  polymarketPriceHistory: async () => ({ ok: false, provider: "polymarket", asOf: "" }),
}));

const ASOF = "2026-09-16T00:00:00.000Z";

const CONNECTED = {
  userId: "user-a",
  sessionWallet: "0xaaa",
  solanaAddress: null,
  polymarketAddress: "0xf28e42d20e4826f2b10a24bc952001697947cab2",
};

const UNLINKED = { ...CONNECTED, polymarketAddress: null };

function position(over: Record<string, unknown> = {}) {
  return {
    id: "tok-1",
    provider: "polymarket",
    accountId: CONNECTED.polymarketAddress,
    marketId: "0xcond",
    eventId: "ev-1",
    marketTitle: "Will BTC be above $100k on Dec 31?",
    slug: null,
    outcome: "Yes",
    outcomeIndex: 0,
    quantity: 100,
    entryPrice: 0.4,
    currentPrice: 0.6,
    costBasisUsd: 40,
    currentValueUsd: 60,
    pnlUsd: 20,
    pnlPct: 50,
    endsAt: "2026-12-31T00:00:00.000Z",
    status: "open",
    ...over,
  };
}

beforeEach(() => {
  state.positions = { ok: true, provider: "polymarket", asOf: ASOF, data: [position()] };
  state.activity = { ok: true, provider: "polymarket", asOf: ASOF, data: [] };
  state.trending = { ok: true, provider: "polymarket", asOf: ASOF, data: [] };
  state.events = { ok: true, provider: "polymarket", asOf: ASOF, data: [] };
  state.category = { ok: true, provider: "polymarket", asOf: ASOF, data: { slug: "crypto", label: "Crypto" } };
});

/* ------------------------------------------------------------------------- */

describe("tool definitions", () => {
  it("never accepts an account address as an argument", async () => {
    const { PREDICTION_TOOLS } = await import("@/lib/agent/tools/prediction");

    for (const tool of PREDICTION_TOOLS) {
      for (const name of Object.keys(tool.def.parameters.properties ?? {})) {
        /* If a model can name whose positions to read, a prompt injection
           can too. Identity comes from the verified session. */
        expect(name.toLowerCase()).not.toMatch(
          /^(user|userid|address|wallet|account|accountid|proxywallet)$/,
        );
      }
    }
  });

  it("exposes no provider endpoint or host in any description", async () => {
    const { PREDICTION_TOOLS } = await import("@/lib/agent/tools/prediction");
    const text = PREDICTION_TOOLS.map((t) => `${t.def.name} ${t.def.description}`).join(" ");

    /* The model asks Elyra questions; the adapter deals with Polymarket. */
    expect(text).not.toMatch(/gamma-api|clob\.polymarket|data-api|https?:\/\//i);
    expect(text).not.toMatch(/\/positions|\/activity|\/book|condition_?id/i);
  });

  it("tells the model that probabilities are prices, not forecasts", async () => {
    const { predictionSearchMarkets, predictionGetTrending } = await import(
      "@/lib/agent/tools/prediction"
    );
    for (const tool of [predictionSearchMarkets, predictionGetTrending]) {
      expect(tool.def.description).toMatch(/not.*(elyra'?s )?forecast/i);
    }
  });
});

describe("not connected is not zero", () => {
  it("reports an unlinked account rather than zero positions", async () => {
    const { predictionGetPositions } = await import("@/lib/agent/tools/prediction");
    const result = (await predictionGetPositions.execute({}, UNLINKED)) as Record<string, unknown>;

    expect(result.connected).toBe(false);
    expect(result.positions).toBeUndefined();
    expect(String(result.note)).toMatch(/do not report zero/i);
  });

  it("reports an unlinked account in the portfolio summary too", async () => {
    const { predictionGetPortfolioSummary } = await import("@/lib/agent/tools/prediction");
    const result = (await predictionGetPortfolioSummary.execute({}, UNLINKED)) as Record<
      string,
      unknown
    >;

    expect(result.connected).toBe(false);
    expect(result.currentValueUsd).toBeUndefined();
  });

  it("distinguishes a provider failure from an empty account", async () => {
    state.positions = {
      ok: false,
      provider: "polymarket",
      asOf: ASOF,
      error: { code: "UPSTREAM_UNAVAILABLE", message: "Polymarket timed out.", retryable: true },
    };

    const { predictionGetPositions } = await import("@/lib/agent/tools/prediction");
    const result = (await predictionGetPositions.execute({}, CONNECTED)) as Record<string, unknown>;

    expect(result.error).toMatch(/timed out/i);
    expect(result.positions).toBeUndefined();
  });

  it("reports a real empty account as connected with no positions", async () => {
    state.positions = { ok: true, provider: "polymarket", asOf: ASOF, data: [] };

    const { predictionGetPositions } = await import("@/lib/agent/tools/prediction");
    const result = (await predictionGetPositions.execute({}, CONNECTED)) as Record<string, unknown>;

    /* The one case where zero IS the answer — because we asked and looked. */
    expect(result.connected).toBe(true);
    expect(result.positions).toEqual([]);
  });
});

describe("portfolio summary", () => {
  it("computes bounded risk and payout rather than asking the model to", async () => {
    const { predictionGetPortfolioSummary } = await import("@/lib/agent/tools/prediction");
    const result = (await predictionGetPortfolioSummary.execute({}, CONNECTED)) as Record<
      string,
      unknown
    >;

    /* 100 shares worth $60: can lose exactly $60, can pay exactly $100. */
    expect(result.currentValueUsd).toBeCloseTo(60, 2);
    expect(result.capitalAtRiskUsd).toBeCloseTo(60, 2);
    expect(result.maxPayoutUsd).toBeCloseTo(100, 2);
    expect(result.maxProfitUsd).toBeCloseTo(40, 2);
  });

  it("surfaces unclaimed winnings", async () => {
    state.positions = {
      ok: true,
      provider: "polymarket",
      asOf: ASOF,
      data: [position({ status: "claimable", currentValueUsd: 250 })],
    };

    const { predictionGetPortfolioSummary } = await import("@/lib/agent/tools/prediction");
    const result = (await predictionGetPortfolioSummary.execute({}, CONNECTED)) as {
      claimable: { count: number; valueUsd: number };
    };

    expect(result.claimable.count).toBe(1);
    expect(result.claimable.valueUsd).toBeCloseTo(250, 2);
  });
});

describe("exposure", () => {
  it("returns a null portfolio share when equity was not supplied", async () => {
    /* A percentage of an unknown denominator is not a number. */
    const { predictionGetExposure } = await import("@/lib/agent/tools/prediction");
    const result = (await predictionGetExposure.execute({}, CONNECTED)) as Record<string, unknown>;

    expect(result.sharePctOfPortfolio).toBeNull();
    expect(String(result.note)).toMatch(/total equity was not supplied/i);
  });

  it("computes the share when equity is known", async () => {
    const { predictionGetExposure } = await import("@/lib/agent/tools/prediction");
    const result = (await predictionGetExposure.execute(
      { totalEquityUsd: 600 },
      CONNECTED,
    )) as Record<string, unknown>;

    expect(result.sharePctOfPortfolio).toBeCloseTo(10, 1);
  });
});

describe("open orders", () => {
  it("is always unavailable, and says why", async () => {
    /* Positions are on-chain and public; resting orders are not. Returning
       an empty array would read as "no open orders". */
    const { predictionGetOpenOrders } = await import("@/lib/agent/tools/prediction");
    const result = (await predictionGetOpenOrders.execute({}, CONNECTED)) as Record<
      string,
      unknown
    >;

    expect(result.available).toBe(false);
    expect(String(result.error)).toMatch(/authenticated/i);
    expect(String(result.note)).toMatch(/do not report zero/i);
  });
});

describe("discovery", () => {
  it("names an unknown category instead of returning an empty list", async () => {
    /* An empty list reads as "nothing is happening in that category", which
       is a different claim from "that category does not exist". */
    state.category = {
      ok: false,
      provider: "polymarket",
      asOf: ASOF,
      error: { code: "NOT_FOUND", message: "no such tag", retryable: false },
    };

    const { predictionSearchEvents } = await import("@/lib/agent/tools/prediction");
    const result = (await predictionSearchEvents.execute(
      { category: "culture" },
      CONNECTED,
    )) as Record<string, unknown>;

    expect(String(result.error)).toMatch(/not a category/i);
    expect(result.events).toBeUndefined();
  });

  it("requires a search term", async () => {
    const { predictionSearchMarkets } = await import("@/lib/agent/tools/prediction");
    await expect(predictionSearchMarkets.execute({ query: "  " }, CONNECTED)).rejects.toThrow();
  });
});

/* ---------------------------------------------------------------------------
   Telegram
--------------------------------------------------------------------------- */

describe("telegram prediction surface", () => {
  it("offers to connect rather than showing $0 when unlinked", async () => {
    const { predictionHome } = await import("@/lib/telegram/prediction");
    const view = await predictionHome(UNLINKED);

    expect(view.html).not.toMatch(/\$0\.00/);
    expect(view.html).toMatch(/not linked|not connected/i);
    /* Browsing still works with nothing connected, so the card must say so. */
    expect(view.html).toMatch(/market data is available/i);
    expect(JSON.stringify(view.buttons)).toMatch(/Connect account/);
  });

  it("renders real figures when connected", async () => {
    const { predictionHome } = await import("@/lib/telegram/prediction");
    const view = await predictionHome(CONNECTED);

    expect(view.html).toMatch(/\$60\.00/);
    expect(view.html).toMatch(/Max payout\s+\$100\.00/);
    expect(view.html).toMatch(/not Elyra forecasts/i);
  });

  it("says a real empty account is genuinely empty", async () => {
    state.positions = { ok: true, provider: "polymarket", asOf: ASOF, data: [] };

    const { predictionPositions } = await import("@/lib/telegram/prediction");
    const view = await predictionPositions(CONNECTED);

    expect(view.html).toMatch(/no open positions/i);
    /* The distinction spelled out, so the reader knows which zero this is. */
    expect(view.html).toMatch(/real zero/i);
  });

  it("escapes a market title, which is untrusted provider text", async () => {
    state.positions = {
      ok: true,
      provider: "polymarket",
      asOf: ASOF,
      data: [position({ marketTitle: "<script>alert(1)</script>" })],
    };

    const { predictionPositions } = await import("@/lib/telegram/prediction");
    const view = await predictionPositions(CONNECTED);

    expect(view.html).not.toContain("<script>");
    expect(view.html).toContain("&lt;script&gt;");
  });

  it("routes its own callbacks and nothing else", async () => {
    const { isPredictionCallback } = await import("@/lib/telegram/prediction");

    expect(isPredictionCallback("pm:positions")).toBe(true);
    expect(isPredictionCallback("pm:cat:crypto")).toBe(true);
    /* Must not swallow a prepared-action callback. */
    expect(isPredictionCallback("action:abcdefghijklmnop")).toBe(false);
  });

  it("falls back to home for an unrecognised pm: payload", async () => {
    const { handlePredictionCallback } = await import("@/lib/telegram/prediction");
    const view = await handlePredictionCallback(CONNECTED, "pm:nonsense");

    expect(view.html).toMatch(/Prediction Markets/);
  });

  it("keeps every callback inside Telegram's 64-byte limit", async () => {
    const { predictionDiscover } = await import("@/lib/telegram/prediction");
    const view = predictionDiscover();

    for (const row of view.buttons) {
      for (const button of row) {
        if (button.callbackData === undefined) continue;
        /* Over 64 bytes Telegram drops the whole keyboard silently. */
        expect(Buffer.byteLength(button.callbackData, "utf8")).toBeLessThanOrEqual(64);
      }
    }
  });
});
