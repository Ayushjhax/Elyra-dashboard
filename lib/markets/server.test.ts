import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   The markets page's server half with Pyth, Yahoo and the model stubbed: the
   world catalogue keeps live local listings and counts the ones coming soon;
   quotes carry Pyth's price and Yahoo's previous-close change, or nulls; a
   market whose own feeds are not live is shown through its New York
   listings; and the brief falls back to the code's text when the model
   strays from the facts.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  raw: [] as Array<Record<string, unknown>>,
  prices: new Map<string, number>(),
  changes: new Map<string, number | null>(),
  yahooAsked: [] as string[],
  reply: async (): Promise<{ text: string; model: string; refused?: boolean }> => ({ text: "", model: "test-model" }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/market/cache", () => ({ cached: async (_key: string, _ttl: number, compute: () => Promise<unknown>) => ({ value: await compute(), fetchedAt: "", hit: false }) }));
vi.mock("@/lib/market/pyth/catalog", () => ({ pythBaseUrl: () => "https://pyth.test", pythApiKey: () => "key" }));
vi.mock("@/lib/market/pyth/client", () => ({
  pricesForLabelledIds: async (labels: Map<number, string>) =>
    [...labels.entries()].flatMap(([id, symbol]) =>
      state.prices.has(symbol) ? [{ id, symbol, price: state.prices.get(symbol), publishedAt: "2026-11-11T15:00:00.000Z" }] : [],
    ),
}));
vi.mock("@/lib/market/pyth/yahoo", () => ({
  changeFor: async (symbol: string) => {
    state.yahooAsked.push(symbol);
    return state.changes.has(symbol) ? state.changes.get(symbol) : null;
  },
}));
vi.mock("@/lib/agent/providers/router", () => ({ route: async () => state.reply() }));

const { buildWorldCatalogue, exchangeListings, marketsBrief, marketsOverview, MarketsError, resetWorldCatalogue } = await import("@/lib/markets/server");

const NY = "America/New_York;0930-1600,0930-1600,0930-1600,0930-1600,0930-1600,C,C;1126/C";
const TOKYO = "Asia/Tokyo;0900-1130&1230-1525,0900-1130&1230-1525,0900-1130&1230-1525,0900-1130&1230-1525,0900-1130&1230-1525,C,C;1123/C";
const LONDON = "Europe/London;0800-1630,0800-1630,0800-1630,0800-1630,0800-1630,C,C;1225/C";

let nextId = 1;
const feed = (symbol: string, state_: string, description: string, schedule?: string) => ({
  pyth_lazer_id: nextId++,
  symbol,
  description,
  asset_type: symbol.startsWith("FX.") ? "fx" : "equity",
  state: state_,
  quote_currency: symbol.slice(symbol.lastIndexOf("/") + 1),
  market_session_schedule: schedule === undefined ? null : { regular: schedule },
});

beforeEach(() => {
  nextId = 1;
  state.raw = [
    feed("Equity.US.AAPL/USD", "stable", "APPLE INC / US DOLLAR", NY),
    feed("Equity.US.MSFT/USD", "stable", "MICROSOFT CORP / US DOLLAR"),
    feed("Equity.US.ZZZZ/USD", "stable", "SOMETHING NOBODY NAMED / US DOLLAR"),
    feed("Equity.Index.US500/USD", "stable", "PYTH PRICE IN USD FOR US500 24/7"),
    feed("Equity.Index.JP225/JPY", "stable", "PYTH PRICE IN JPY FOR JP225 24/7"),
    feed("Equity.JP.1321/JPY", "stable", "NOMURA NEXT FUNDS NIKKEI 225 ETF / JAPANESE YEN", TOKYO),
    feed("Equity.JP.7203/JPY", "stable", "TOYOTA MOTOR CORPORATION / JAPANESE YEN"),
    feed("Equity.JP.6758/JPY", "stable", "SONY GROUP CORPORATION / JAPANESE YEN"),
    feed("Equity.JP.9999/JPY", "coming_soon", "NOT YET / JAPANESE YEN"),
    feed("Equity.GB.ISF/GBP", "coming_soon", "ISHARES CORE FTSE 100 UCITS ETF DIST / BRITISH POUND", LONDON),
    feed("Equity.GB.AAL/GBP", "coming_soon", "ANGLO AMERICAN / BRITISH POUND"),
    feed("Equity.US.AZN/USD", "stable", "ASTRAZENECA PLC / US DOLLAR"),
    feed("Equity.US.RIO/USD", "stable", "RIO TINTO GROUP / US DOLLAR"),
    feed("FX.USD/JPY", "stable", "US DOLLAR / JAPANESE YEN"),
  ];
  state.prices = new Map([
    ["Equity.US.AAPL/USD", 353.4],
    ["Equity.Index.US500/USD", 7580.9],
    ["Equity.Index.JP225/JPY", 62150],
    ["Equity.JP.1321/JPY", 638.3],
    ["Equity.JP.7203/JPY", 3435],
    ["Equity.JP.6758/JPY", 3800],
    ["Equity.US.AZN/USD", 80.1],
    ["Equity.US.RIO/USD", 70.2],
    ["FX.USD/JPY", 159.8],
  ]);
  state.changes = new Map<string, number | null>([
    ["AAPL", 1.48],
    ["^GSPC", 0.8],
    ["^N225", 1.31],
    ["7203.T", -2.83],
    ["6758.T", 1.1],
    ["AZN", 0.4],
    ["RIO", -0.9],
    ["USDJPY=X", 0.66],
  ]);
  state.yahooAsked = [];
  state.reply = async () => ({ text: "", model: "test-model" });
  resetWorldCatalogue();
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(state.raw), { status: 200 }));
});

describe("buildWorldCatalogue", () => {
  it("keeps live local listings and named feeds, counts what is coming, and drops unnamed US feeds", () => {
    const catalogue = buildWorldCatalogue(state.raw as never);
    /* The Nikkei fund is a benchmark, so it is not listed twice. */
    expect(catalogue.liveByRegion.JP).toEqual(["Equity.JP.6758/JPY", "Equity.JP.7203/JPY"]);
    expect(catalogue.comingSoonByRegion).toEqual({ JP: 1, GB: 2 });
    expect(catalogue.bySymbol["Equity.US.ZZZZ/USD"]).toBeUndefined();
    expect(catalogue.bySymbol["Equity.JP.7203/JPY"]).toMatchObject({ ticker: "7203", name: "Toyota Motor Corporation", currency: "JPY", live: true });
    /* A coming-soon feed is kept for its schedule, but marked not live. */
    expect(catalogue.bySymbol["Equity.GB.ISF/GBP"]).toMatchObject({ live: false, regular: LONDON });
    expect(catalogue.bySymbol["FX.USD/JPY"]).toMatchObject({ ticker: "USD/JPY", name: "USD/JPY" });
  });
});

describe("marketsOverview", () => {
  it("puts each exchange on its own clock, with live benchmarks and FX", async () => {
    /* Wednesday 11 November 2026, 15:00 UTC: New York and London open, Tokyo closed. */
    const overview = await marketsOverview(Date.parse("2026-11-11T15:00:00Z"));
    const by = Object.fromEntries(overview.exchanges.map((exchange) => [exchange.id, exchange]));
    expect(by.us.session).toMatchObject({ kind: "open", localTime: "10:00" });
    expect(by.gb.session).toMatchObject({ kind: "open", localTime: "15:00" });
    expect(by.jp.session).toMatchObject({ kind: "closed", localTime: "00:00" });
    expect(by.us.benchmarks[0]).toMatchObject({ label: "S&P 500", price: 7580.9, changePct: 0.8, chartable: true });
    expect(by.jp.benchmarks.map((benchmark) => [benchmark.label, benchmark.currency, benchmark.chartable])).toEqual([
      ["Nikkei 225", "JPY", false],
      ["Nikkei 225 (Nomura fund, Tokyo)", "JPY", false],
    ]);
    expect(by.jp.liveListings).toBe(2);
    expect(by.gb).toMatchObject({ liveListings: 0, comingSoon: 2, benchmarks: [] });
    expect(overview.fx).toEqual([expect.objectContaining({ ticker: "USD/JPY", price: 159.8, changePct: 0.66 })]);
    expect(overview.regions.map((region) => [region.region, region.openCount])).toEqual([
      ["asia", 0],
      ["europe", 1],
      ["americas", 1],
    ]);
    expect(overview.error).toBeNull();
  });

  it("shows a market with no schedule as unknown, never as a guess", async () => {
    state.raw = state.raw.filter((entry) => entry.symbol !== "Equity.JP.1321/JPY");
    const overview = await marketsOverview(Date.parse("2026-11-11T15:00:00Z"));
    expect(overview.exchanges.find((exchange) => exchange.id === "jp")?.session).toBeNull();
  });

  it("reports no prices plainly when Pyth answers for none", async () => {
    state.prices = new Map();
    const overview = await marketsOverview(Date.parse("2026-11-11T15:00:00Z"));
    expect(overview.exchanges[0].benchmarks.every((benchmark) => benchmark.price === null)).toBe(true);
  });
});

describe("exchangeListings", () => {
  it("lists a market's live listings with movers and breadth", async () => {
    const tokyo = await exchangeListings("jp", Date.parse("2026-11-11T15:00:00Z"));
    expect(tokyo.listings.map((quote) => [quote.ticker, quote.price, quote.changePct])).toEqual([
      ["6758", 3800, 1.1],
      ["7203", 3435, -2.83],
    ]);
    expect(tokyo.gainers.map((quote) => quote.ticker)).toEqual(["6758"]);
    expect(tokyo.losers.map((quote) => quote.ticker)).toEqual(["7203"]);
    expect(tokyo.breadth).toEqual({ up: 1, down: 1, flat: 0, unknown: 0 });
    expect(tokyo.comingSoon).toBe(1);
    expect(state.yahooAsked).toEqual(expect.arrayContaining(["6758.T", "7203.T"]));
  });

  it("shows London through its New York listings while its own feeds are not live", async () => {
    const london = await exchangeListings("gb", Date.parse("2026-11-11T15:00:00Z"));
    expect(london.listings).toEqual([]);
    expect(london.viaNewYork.map((quote) => [quote.ticker, quote.currency, quote.chartable])).toEqual([
      ["AZN", "USD", true],
      ["RIO", "USD", true],
    ]);
    expect(london.comingSoon).toBe(2);
  });

  it("leaves the change as a dash when Yahoo has none, and refuses an unknown market", async () => {
    state.changes.delete("7203.T");
    const tokyo = await exchangeListings("jp", Date.parse("2026-11-11T15:00:00Z"));
    expect(tokyo.listings.find((quote) => quote.ticker === "7203")?.changePct).toBeNull();
    expect(tokyo.breadth.unknown).toBe(1);
    await expect(exchangeListings("atlantis", Date.now())).rejects.toBeInstanceOf(MarketsError);
  });
});

describe("marketsBrief", () => {
  it("keeps a reply that uses only the facts' numbers", async () => {
    state.reply = async () => ({ text: "New York and London are open. The S&P 500 is up +0.80% and USD/JPY +0.66%.", model: "test-model" });
    const brief = await marketsBrief(Date.parse("2026-11-11T15:00:00Z"));
    expect(brief.model).toBe("test-model");
    expect(brief.facts).toEqual(expect.arrayContaining(["New York (NYSE · Nasdaq): open, closes in 6h 00m; S&P 500 +0.80%", "USD/JPY: +0.66%"]));
  });

  it("falls back to the code's own text when the model invents a number", async () => {
    state.reply = async () => ({ text: "Stocks rallied 4% on the day.", model: "test-model" });
    const brief = await marketsBrief(Date.parse("2026-11-11T15:00:00Z"));
    expect(brief.model).toBe("fallback");
    expect(brief.text).toContain("Open now: New York");
    expect(brief.text).toContain("Nikkei 225, +1.31% on the previous close");
  });
});
