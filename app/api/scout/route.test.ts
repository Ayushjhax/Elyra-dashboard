import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   Scout's routes against the fake database and scripted upstreams.

   The two posts: an exchange's own announcement and a rumour about it, read
   side by side — the first confirmed, the second speculation, each by code,
   whatever the model said. A model's claim without its quote in the source
   is dropped. A link read once is answered from the cache without a model
   run. Auto-buys fire once per signal, never past their day's cap, and only
   from code-detected signals. Everything belongs to the session's user.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  user: null as null | { userId: string; profileStore: string },
  gemini: 0,
  trades: [] as Array<{ userId: string; order: Record<string, unknown>; placedBy: Record<string, unknown> }>,
  notices: [] as Array<{ title: string }>,
  okxListing: null as null | { title: string; at: number },
  fills: new Map<string, Array<Record<string, unknown>>>(),
  booksAsked: 0,
  resolved: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => state.user,
  hasProfile: (user: { userId: string | null; profileStore: string }) => user.userId !== null && user.profileStore === "ready",
  databaseUnavailableMessage: (feature: string) => `${feature} needs the database.`,
}));
vi.mock("@/lib/smartmoney/hyperliquid", () => ({
  CONSENSUS_DISCLAIMER: "Consensus disclaimer.",
  smartMoneyCohort: async () => ["w1", "w2", "w3", "w4"].map((address) => ({ address, accountValue: 1e6, monthPnl: 1e5, monthRoi: 0.1 })),
  hyperliquidConsensus: async () => ({
    signals: [{ symbol: "SOL", side: "LONG", walletCount: 4, status: "4 of 5 wallets", weightedScore: 90 }],
    generatedAt: new Date().toISOString(),
    walletsRead: 4,
    walletsWithPositions: 4,
  }),
}));
vi.mock("@/lib/autotrade/hyperliquid", () => ({
  hyperliquidCandles: async () => [{ openTime: 0, closeTime: 1, open: 100, high: 110, low: 90, close: 105 }],
}));
vi.mock("@/lib/autotrade/trade", () => ({
  openMarketTrade: async (userId: string, order: Record<string, unknown>, placedBy: Record<string, unknown>) => {
    state.trades.push({ userId, order, placedBy });
    return { ok: true, position: { id: `00000000-0000-4000-9000-${String(state.trades.length).padStart(12, "0")}` } };
  },
}));
vi.mock("@/lib/notifications/deliver", () => ({
  recipientFor: async (userId: string) => ({ userId, devices: [], chatId: null }),
  send: async (_recipient: unknown, _channels: unknown, message: { title: string }) => {
    state.notices.push({ title: message.title });
  },
}));
/* DNS: one name that resolves inside a network, everything else public. */
vi.mock("node:dns/promises", () => ({
  lookup: async (host: string) => [{ address: host === "sneaky.example.org" ? "10.0.0.5" : "104.16.1.1", family: 4 }],
}));
/* Polymarket's books: 1,000 shares at 40¢ to buy, 1,000 at 38¢ to sell, for every outcome. */
const book = (tokenId: string) => ({
  marketId: "m",
  tokenId,
  bids: [{ price: 0.38, size: 1000 }],
  asks: [{ price: 0.4, size: 1000 }],
  midpoint: 0.39,
  spread: 0.02,
  lastTradePrice: null,
  minOrderSize: null,
  tickSize: 0.01,
  at: new Date().toISOString(),
});
vi.mock("@/lib/providers/polymarket", () => ({
  polymarketOrderbook: async (tokenId: string) => ({ ok: true, data: book(tokenId) }),
  polymarketBooks: async (tokenIds: string[]) => {
    state.booksAsked += 1;
    return { ok: true, data: new Map(tokenIds.map((id) => [id, book(id)])) };
  },
}));
vi.mock("@/lib/autotrade/liveGate", () => ({
  liveRefusal: async () => "Live trading is switched off on this server. Keep the rule on paper.",
}));

const OFFICIAL = "https://x.com/binance/status/1000000000000000001";
const RUMOUR = "https://x.com/cryptowhale/status/1000000000000000002";
const OFFICIAL_TEXT = "Binance Will List ABC (ABC) with Seed Tag Applied. Trading opens at 2026-11-26 10:00 UTC.";
const RUMOUR_TEXT = "🚨 BREAKING: The community is once again speculating that Binance could list ABC soon. HUGE if true!!";

function embed(handle: string, text: string) {
  return {
    author_name: handle,
    author_url: `https://twitter.com/${handle}`,
    html: `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">${text}</p>&mdash; ${handle} <a href="https://x.com/${handle}/status/1">November 24, 2026</a></blockquote>`,
  };
}

/** What the "model" answers: it calls both posts announcements, and invents one claim. */
const ARTICLE_TEXT =
  "Utah has filed a motion to dismiss 14 criminal charges against Kalshi without prejudice, after the platform halted its operations in the state. A judge in New York separately declined to shut Kalshi down, and the company continues to operate there while lawmakers weigh a tax on prediction markets.";

function claimsFor(prompt: string) {
  if (prompt.includes("Utah has filed")) {
    return { summary: "Utah moved to drop its charges against Kalshi.", claims: [{ asset: null, statement: "Utah moved to dismiss 14 charges against Kalshi.", quote: "Utah has filed a motion to dismiss 14 criminal charges against Kalshi", kind: "report", direction: "neutral", event: "regulation" }] };
  }
  if (prompt.includes("OKX could list")) {
    return { summary: "People speculate OKX could list ABC.", claims: [{ asset: "ABC", statement: "OKX could list ABC soon.", quote: "speculating that OKX could list ABC soon", kind: "speculation", direction: "bullish", event: "listing" }] };
  }
  const official = prompt.includes("Seed Tag");
  return {
    summary: official ? "Binance says it will list ABC." : "People speculate Binance could list ABC.",
    claims: [
      {
        asset: "ABC",
        statement: official ? "Binance will list ABC." : "Binance will list ABC soon.",
        quote: official ? "Binance Will List ABC (ABC) with Seed Tag Applied." : "speculating that Binance could list ABC soon",
        kind: "announcement",
        direction: "bullish",
        event: "listing",
      },
      { asset: "ABC", statement: "ABC will rise 500%.", quote: "ABC will rise 500% after the listing", kind: "opinion", direction: "bullish", event: "price" },
    ],
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function upstream(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://publish.twitter.com/oembed")) {
    const target = decodeURIComponent(new URL(url).searchParams.get("url") ?? "");
    if (target.includes("binance")) return json(embed("binance", OFFICIAL_TEXT));
    if (target.includes("cryptowhale")) return json(embed("cryptowhale", RUMOUR_TEXT));
    return json({}, 404);
  }
  if (url.startsWith("https://generativelanguage.googleapis.com/")) {
    state.gemini += 1;
    const body = JSON.parse(String(init?.body)) as { contents: Array<{ parts: Array<{ text?: string }> }>; tools?: unknown[] };
    if (body.tools !== undefined) {
      return json({
        candidates: [
          {
            content: { parts: [{ text: `Utah moves to drop criminal charges against Kalshi\n\n${ARTICLE_TEXT}` }] },
            finishReason: "STOP",
            urlContextMetadata: { urlMetadata: [{ retrievedUrl: "https://www.theblock.co/news/kalshi", urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" }] },
          },
        ],
      });
    }
    const prompt = body.contents[0].parts.map((part) => part.text ?? "").join("\n");
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(claimsFor(prompt)) }] }, finishReason: "STOP" }] });
  }
  if (url === "https://api.hyperliquid.xyz/info") {
    const body = JSON.parse(String(init?.body)) as { type: string; user?: string };
    if (body.type === "allMids") return json({ ABC: "1.5", SOL: "150", BTC: "100000", "@107": "1" });
    if (body.type === "userFillsByTime") return json(state.fills.get(body.user ?? "") ?? []);
    return json({}, 400);
  }
  if (url.startsWith("https://www.theblock.co/")) return new Response("Just a moment...", { status: 403, headers: { "content-type": "text/html" } });
  /* An open redirect on an official site, to a page that blocks readers. */
  if (url.startsWith("https://www.binance.com/redirect")) return new Response(null, { status: 302, headers: { location: "https://evil.example.net/fake-listing" } });
  if (url.startsWith("https://evil.example.net/")) return new Response("blocked", { status: 403, headers: { "content-type": "text/html" } });
  if (url.startsWith("https://www.binance.com/en/support/announcement/")) return new Response("blocked", { status: 403, headers: { "content-type": "text/html" } });
  if (url.startsWith("https://gamma-api.polymarket.com/markets?")) {
    const ids = new URL(url).searchParams.getAll("condition_ids");
    const closed = new URL(url).searchParams.get("closed") === "true";
    if (closed !== state.resolved) return json([]);
    return json(
      ids.map((id, index) => ({
        id: String(100 + index),
        conditionId: id,
        question: `Question ${id.slice(2, 6)}?`,
        slug: `q-${index}`,
        outcomes: '["Yes", "No"]',
        clobTokenIds: JSON.stringify([`${index + 1}1`, `${index + 1}2`]),
        outcomePrices: state.resolved ? '["1", "0"]' : '["0.4", "0.6"]',
        closed: state.resolved,
        events: [{ slug: "event" }],
      })),
    );
  }
  if (url.startsWith("https://api.bybit.com/")) return json({ result: { list: [] } });
  if (url.startsWith("https://www.okx.com/")) {
    const listing = state.okxListing;
    return json({ data: [{ details: listing === null ? [] : [{ title: listing.title, url: "https://www.okx.com/help/abc", pTime: String(listing.at) }] }] });
  }
  if (url.startsWith("https://api-manager.upbit.com/")) return json({ data: { notices: [] } });
  throw new Error(`unexpected fetch ${url}`);
}

const read = await import("@/app/api/scout/read/route");
const autobuys = await import("@/app/api/scout/autobuys/route");
const autobuy = await import("@/app/api/scout/autobuys/[id]/route");
const baskets = await import("@/app/api/poly/baskets/route");
const basket = await import("@/app/api/poly/baskets/[id]/route");
const { runScoutTick } = await import("@/lib/scout/engine");

const as = (userId: string | null) => {
  state.user = userId === null ? null : { userId, profileStore: "ready" };
};
const post = (body: unknown) => new Request("http://test/api/scout", { method: "POST", body: JSON.stringify(body) });
const body = async (response: Response) => (await response.json()) as Record<string, unknown>;

/* Every test runs ten minutes after the last, so the shared caches (feeds, fills, mids) start fresh. */
let clock = Date.parse("2026-11-25T12:00:00.000Z");

beforeEach(() => {
  clock += 10 * 60_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
  vi.stubGlobal("fetch", vi.fn(upstream));
  process.env.GEMINI_API_KEY = "test-key";
  state.db = new FakeSupabase();
  state.gemini = 0;
  state.trades = [];
  state.notices = [];
  state.okxListing = null;
  state.fills = new Map();
  state.booksAsked = 0;
  state.resolved = false;
  as("user-a");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reading the two posts", () => {
  it("confirms the exchange's own post and calls the rumour speculation, whatever the model said", async () => {
    const official = await body(await read.POST(post({ url: OFFICIAL })));
    const rumour = await body(await read.POST(post({ url: RUMOUR })));
    const a = official.read as Record<string, unknown> & { claims: Array<Record<string, unknown>> };
    const b = rumour.read as Record<string, unknown> & { claims: Array<Record<string, unknown>>; attention: string[] };

    expect(a).toMatchObject({ kind: "x", tier: "primary", party: "Binance", textOrigin: "post", cached: false });
    expect(a.claims).toHaveLength(1);
    expect(a.claims[0]).toMatchObject({ grade: "confirmed", asset: "ABC", coin: "ABC", hedged: false, notInFeeds: null });

    expect(b).toMatchObject({ tier: "unverified", party: null });
    /* It names Binance, whose feed Scout cannot read: said so, never settled by another exchange. */
    expect(b.claims[0]).toMatchObject({ grade: "speculation", hedged: true, confirmedBy: null, notInFeeds: null, unreadable: "Binance" });
    expect(b.attention).toEqual(expect.arrayContaining(["🚨", "BREAKING", "huge", "!!"]));

    /* The invented price claim had no quote in either post. */
    expect(a.dropped).toBe(1);
    expect(b.dropped).toBe(1);
    expect(state.gemini).toBe(2);
    expect(state.db.rows("usage_counters")[0]).toMatchObject({ user_id: "user-a", runs: 2 });
  });

  it("settles a rumour about an exchange only from that exchange's own feed", async () => {
    const paste = { text: "People are speculating that OKX could list ABC soon, reportedly this week. Nothing official yet." };
    const before = await body(await read.POST(post(paste)));
    expect((before.read as { claims: Array<Record<string, unknown>> }).claims[0]).toMatchObject({ grade: "speculation", notInFeeds: ["OKX"], confirmedBy: null, unreadable: null });

    vi.setSystemTime(clock + 5 * 60_000);
    state.okxListing = { title: "OKX to list ABC (ABC) for spot trading", at: clock - 3_600_000 };
    const after = await body(await read.POST(post(paste)));
    const claim = (after.read as { claims: Array<Record<string, unknown>>; tier: string }).claims[0];
    expect(claim).toMatchObject({ grade: "confirmed", notInFeeds: null, confirmedBy: { exchange: "OKX", url: "https://www.okx.com/help/abc" } });
    /* Pasted text is never official, and never shared. */
    expect((after.read as { tier: string }).tier).toBe("unverified");
    expect(state.db.rows("scout_sources")).toHaveLength(0);
  });

  it("answers a link read in the last day from the cache, without a model run", async () => {
    await read.POST(post({ url: OFFICIAL }));
    as("user-b");
    const again = await body(await read.POST(post({ url: "https://twitter.com/binance/status/1000000000000000001?s=20" })));
    expect((again.read as Record<string, unknown>).cached).toBe(true);
    expect(state.gemini).toBe(1);
    expect(state.db.rows("usage_counters").map((row) => row.user_id)).toEqual(["user-a"]);
  });

  it("checks smart money in the coins a read names", async () => {
    const minute = 60_000;
    for (const wallet of ["w1", "w2", "w3"]) state.fills.set(wallet, [{ coin: "ABC", px: "1.4", sz: "1000", time: clock - 30 * minute, dir: "Open Long", side: "B" }]);
    const official = await body(await read.POST(post({ url: OFFICIAL })));
    const [asset] = (official.read as { assets: Array<Record<string, unknown>> }).assets;
    expect(asset).toMatchObject({ coin: "ABC", price: 1.5, read: "buying", verdict: "agrees", lean: "bullish", changePct: -98.5 });
    expect(asset.flow).toMatchObject({ openedLong: 3, openedShort: 0, boughtUsd: 4_200 });
  });

  it("keeps reads to their owner and needs a session", async () => {
    await read.POST(post({ url: OFFICIAL }));
    expect(((await body(await read.GET(new Request("http://test/api/scout/read")))).reads as unknown[]).length).toBe(1);
    as("user-b");
    expect(((await body(await read.GET(new Request("http://test/api/scout/read")))).reads as unknown[]).length).toBe(0);
    as(null);
    expect((await read.POST(post({ url: OFFICIAL }))).status).toBe(401);
  });

  it("refuses a link inside a network before fetching anything", async () => {
    const response = await read.POST(post({ url: "http://169.254.169.254/latest/meta-data" }));
    expect(response.status).toBe(400);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("reads an article whose site blocks servers through Gemini's copy, graded by the site it came from", async () => {
    const response = await read.POST(post({ url: "https://www.theblock.co/news/kalshi?utm_source=x" }));
    expect(response.status).toBe(201);
    const view = (await body(response)).read as Record<string, unknown> & { claims: Array<Record<string, unknown>> };
    expect(view).toMatchObject({ kind: "article", tier: "newsroom", party: "The Block", textOrigin: "page_copy", title: "Utah moves to drop criminal charges against Kalshi" });
    expect(view.claims[0]).toMatchObject({ grade: "reported", kind: "report" });
    /* One run for the read, however many model calls it took. */
    expect(state.gemini).toBe(2);
    expect(state.db.rows("usage_counters")[0]).toMatchObject({ runs: 1 });
  });

  it("credits a copied page to the host that refused, never to an official address that redirected", async () => {
    const redirected = await body(await read.POST(post({ url: "https://www.binance.com/redirect?to=evil" })));
    expect(redirected.read).toMatchObject({ textOrigin: "page_copy", tier: "unverified" });

    const official = await body(await read.POST(post({ url: "https://www.binance.com/en/support/announcement/abc" })));
    expect(official.read).toMatchObject({ textOrigin: "page_copy", tier: "primary", party: "Binance" });
  });

  it("refuses a name that resolves inside a network, without fetching it", async () => {
    const response = await read.POST(post({ url: "https://sneaky.example.org/article" }));
    expect(response.status).toBe(400);
    expect(vi.mocked(fetch).mock.calls.map(([target]) => String(target)).filter((target) => target.includes("sneaky"))).toEqual([]);
    expect(state.gemini).toBe(0);
  });

  it("stops at the daily model cap", async () => {
    state.db.claimAllowed = false;
    const response = await read.POST(post({ url: OFFICIAL }));
    expect(response.status).toBe(429);
    expect(state.gemini).toBe(0);
  });
});

describe("auto-buys", () => {
  const rule = { name: "Follow SOL", trigger: "smart_money", side: "long", coins: ["SOL"], minWallets: 3, sizeUsd: 100, leverage: 2, takeProfitPct: 6, stopLossPct: 3, maxPerDay: 1, mode: "paper" };
  const crowdIntoSol = () => {
    for (const wallet of ["w1", "w2", "w3", "w4"]) state.fills.set(wallet, [{ coin: "SOL", px: "150", sz: "10", time: clock - 10 * 60_000, dir: "Open Long", side: "B" }]);
  };

  it("checks a rule and refuses live when the server is not live", async () => {
    expect((await autobuys.POST(post({ ...rule, leverage: 9 }))).status).toBe(400);
    const live = await autobuys.POST(post({ ...rule, mode: "live" }));
    expect(live.status).toBe(400);
    expect((await body(live)).error).toContain("Live trading is switched off");
    expect((await autobuys.POST(post(rule))).status).toBe(201);
  });

  it("fires once per signal through the ticket's own path, and notifies", async () => {
    await autobuys.POST(post(rule));
    crowdIntoSol();
    const first = await runScoutTick(clock);
    expect(first).toMatchObject({ rules: 1, opened: 1, refused: 0 });
    expect(state.trades[0]).toMatchObject({
      userId: "user-a",
      order: { coin: "SOL", side: "long", sizeUsd: 100, leverage: 2, takeProfitPct: 6, stopLossPct: 3, mode: "paper" },
      placedBy: { ruleName: "Auto-buy · Follow SOL" },
    });
    expect(state.notices[0].title).toBe("Auto-buy · SOL long (paper)");

    /* The same signal on the next tick is already acted on. */
    vi.setSystemTime(clock + 5 * 60_000);
    expect(await runScoutTick(clock + 5 * 60_000)).toMatchObject({ opened: 0 });
    expect(state.trades).toHaveLength(1);

    const listed = await body(await autobuys.GET(new Request("http://test/api/scout/autobuys")));
    expect((listed.rules as Array<Record<string, unknown>>)[0]).toMatchObject({ firedToday: 1 });
    expect((listed.fires as Array<Record<string, unknown>>)[0]).toMatchObject({ coin: "SOL", outcome: "opened", ruleName: "Follow SOL" });
  });

  it("does nothing, and reads nothing, without an active rule", async () => {
    crowdIntoSol();
    expect(await runScoutTick(clock)).toMatchObject({ rules: 0, signals: 0 });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    const created = await body(await autobuys.POST(post(rule)));
    await autobuy.PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify({ status: "paused" }) }), { params: Promise.resolve({ id: String(created.id) }) });
    expect(await runScoutTick(clock)).toMatchObject({ rules: 0, opened: 0 });
  });

  it("buys a coin an exchange officially lists, and not one it lists two days late", async () => {
    await autobuys.POST(post({ ...rule, name: "Listings", trigger: "listing", coins: [] }));
    state.okxListing = { title: "OKX to list WIF (WIF) for spot trading", at: clock - 30 * 60_000 };
    expect(await runScoutTick(clock)).toMatchObject({ opened: 1 });
    expect(state.trades[0].order).toMatchObject({ coin: "WIF", side: "long" });

    vi.setSystemTime(clock + 6 * 60_000);
    state.okxListing = { title: "OKX to list POPCAT (POPCAT) for spot trading", at: clock - 2 * 86_400_000 };
    expect(await runScoutTick(clock + 6 * 60_000)).toMatchObject({ opened: 0 });
  });

  it("buys a coin once a day however many exchanges list it, and never flips side the same day", async () => {
    await autobuys.POST(post({ ...rule, name: "Listings", trigger: "listing", coins: [], maxPerDay: 5 }));
    state.okxListing = { title: "OKX to list WIF (WIF) for spot trading", at: clock - 30 * 60_000 };
    expect(await runScoutTick(clock)).toMatchObject({ opened: 1 });
    vi.setSystemTime(clock + 6 * 60_000);
    state.okxListing = { title: "OKX lists dogwifhat (WIF) perpetual futures — OKX to list WIF (WIF)", at: clock - 10 * 60_000 };
    expect(await runScoutTick(clock + 6 * 60_000)).toMatchObject({ opened: 0 });

    await autobuys.POST(post({ ...rule, name: "Both ways", side: "both", coins: [], maxPerDay: 5 }));
    crowdIntoSol();
    expect(await runScoutTick(clock + 7 * 60_000)).toMatchObject({ opened: 1 });
    vi.setSystemTime(clock + 12 * 60_000);
    for (const wallet of ["w1", "w2", "w3", "w4"]) state.fills.set(wallet, [{ coin: "SOL", px: "150", sz: "10", time: clock + 11 * 60_000, dir: "Long > Short", side: "A" }]);
    expect(await runScoutTick(clock + 12 * 60_000)).toMatchObject({ opened: 0 });
    expect(state.trades.map((trade) => [trade.order.coin, trade.order.side])).toEqual([
      ["WIF", "long"],
      ["SOL", "long"],
    ]);
  });

  it("lets only the owner pause or delete a rule", async () => {
    const created = await body(await autobuys.POST(post(rule)));
    as("user-b");
    const params = { params: Promise.resolve({ id: String(created.id) }) };
    expect((await autobuy.DELETE(new Request("http://test", { method: "DELETE" }), params)).status).toBe(404);
    as("user-a");
    expect((await autobuy.DELETE(new Request("http://test", { method: "DELETE" }), params)).status).toBe(200);
  });
});

describe("paper baskets", () => {
  const C1 = `0x${"1".repeat(64)}`;
  const C2 = `0x${"2".repeat(64)}`;
  const legs = [
    { conditionId: C1, tokenId: "11", outcome: "Yes", question: "One?" },
    { conditionId: C2, tokenId: "21", outcome: "Yes", question: "Two?" },
  ];

  it("buys each leg at the walked ask, values it at the bids in one batch, and settles it when the market resolves", async () => {
    const created = await baskets.POST(post({ name: "Pair", stakeUsd: 100, legs }));
    expect(created.status).toBe(201);
    const rows = state.db.rows("poly_basket_legs");
    expect(rows.map((row) => [row.token_id, row.entry_price, row.cost_usd, row.shares, row.outcome_index])).toEqual([
      ["11", 0.4, 50, 125, 0],
      ["21", 0.4, 50, 125, 0],
    ]);

    const open = (await body(await baskets.GET(new Request("http://test/api/poly/baskets")))).baskets as Array<Record<string, unknown>>;
    expect(open[0]).toMatchObject({ name: "Pair", costUsd: 100, valueUsd: 95, pnlUsd: -5, settledLegs: 0 });
    expect(state.booksAsked).toBe(1);

    state.resolved = true;
    const settled = (await body(await baskets.GET(new Request("http://test/api/poly/baskets")))).baskets as Array<Record<string, unknown>>;
    expect(settled[0]).toMatchObject({ valueUsd: 250, pnlUsd: 150, settledLegs: 2 });
    expect(state.db.rows("poly_basket_legs").every((row) => row.settled === 1)).toBe(true);
  });

  it("refuses an outcome that is not that market's, and keeps baskets to their owner", async () => {
    expect((await baskets.POST(post({ name: "Bad", stakeUsd: 100, legs: [legs[0], { ...legs[1], tokenId: "99" }] }))).status).toBe(400);
    const created = await body(await baskets.POST(post({ name: "Pair", stakeUsd: 100, legs })));
    as("user-b");
    expect(((await body(await baskets.GET(new Request("http://test/api/poly/baskets")))).baskets as unknown[]).length).toBe(0);
    expect((await basket.DELETE(new Request("http://test", { method: "DELETE" }), { params: Promise.resolve({ id: String(created.id) }) })).status).toBe(404);
    as("user-a");
    expect((await basket.DELETE(new Request("http://test", { method: "DELETE" }), { params: Promise.resolve({ id: String(created.id) }) })).status).toBe(200);
    expect(state.db.rows("poly_basket_legs")).toHaveLength(0);
  });
});
