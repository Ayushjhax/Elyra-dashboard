import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { flowKey, listingKey, validateRule, wants, type DetectedSignal } from "@/lib/scout/autobuy";
import { cleanAsset, parseClaims, quoteFound } from "@/lib/scout/claims";
import { isPublicAddress } from "@/lib/scout/fetch";
import { aggregateFlows, coinForTicker, flowSignals, readOf, type WalletFill } from "@/lib/scout/flows";
import { attentionCues, gradeOf, isHedged, sourceStanding } from "@/lib/scout/grade";
import { extractArticle, parseXEmbed, stripBlocks } from "@/lib/scout/html";
import { parseLink, snowflakeTime, splitLinks } from "@/lib/scout/link";
import { confirmingListing, exchangeNamed, kindOfTitle, parseBybit, parseOkx, parseUpbit, tickersInTitle } from "@/lib/scout/listings";

/* ---------------------------------------------------------------------------
   Scout's pure halves: links, grades, the quote guard, page and embed text,
   smart-money flows, the exchanges' listing feeds and auto-buy rules.
--------------------------------------------------------------------------- */

describe("links", () => {
  it("reduces every YouTube spelling to one video", () => {
    for (const raw of [
      "https://www.youtube.com/watch?v=3TbKeiAOY4g&t=42s",
      "youtu.be/3TbKeiAOY4g?si=abc",
      "https://m.youtube.com/shorts/3TbKeiAOY4g",
      "https://www.youtube.com/live/3TbKeiAOY4g",
    ]) {
      const parsed = parseLink(raw);
      expect(parsed.ok && parsed.link).toMatchObject({ kind: "youtube", key: "yt:3TbKeiAOY4g", url: "https://www.youtube.com/watch?v=3TbKeiAOY4g" });
    }
  });

  it("reads a post on X or Twitter by its status id", () => {
    const parsed = parseLink("https://twitter.com/binance/status/1857080434424058332?s=20");
    expect(parsed.ok && parsed.link).toMatchObject({ kind: "x", key: "x:1857080434424058332", url: "https://x.com/binance/status/1857080434424058332" });
  });

  it("drops tracking from an article's key and keeps the rest", () => {
    const parsed = parseLink("http://www.coindesk.com/markets/2026/11/24/story/?utm_source=x&id=7#top");
    expect(parsed.ok && parsed.link).toMatchObject({ kind: "article", host: "coindesk.com", url: "https://www.coindesk.com/markets/2026/11/24/story/?id=7" });
  });

  it("refuses anything that could point inside a network", () => {
    for (const raw of ["http://127.0.0.1/", "http://169.254.169.254/latest", "https://[::1]/", "http://localhost:3000", "https://intranet.corp/x", "ftp://example.com/x", "https://user:pw@example.com/", "https://example.com:8443/", "http://2130706433/"]) {
      expect(parseLink(raw).ok, raw).toBe(false);
    }
    expect(parseLink("https://www.youtube.com/feed/trending").ok).toBe(false);
  });

  it("knows which resolved addresses are public", () => {
    expect(isPublicAddress("104.16.1.1")).toBe(true);
    expect(isPublicAddress("2606:4700::1")).toBe(true);
    for (const address of ["10.0.0.1", "172.20.1.1", "192.168.1.1", "169.254.169.254", "127.0.0.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "0.0.0.0"]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it("dates a post on X from its id, to the millisecond", () => {
    /* (id >> 22) + 1288834974657 ms: X's own epoch. */
    expect(snowflakeTime("1857080434424058332")).toBe("2024-11-14T15:17:33.109Z");
    expect(snowflakeTime("20")).toBeNull();
    expect(snowflakeTime("not-an-id")).toBeNull();
  });

    it("splits a box of links, at most three", () => {
    expect(splitLinks("a.com\nb.com c.com, d.com a.com", 3)).toEqual(["a.com", "b.com", "c.com"]);
  });
});

describe("grades", () => {
  it("knows the party from the address or X's own author, never from the text", () => {
    expect(sourceStanding({ kind: "article", host: "announcements.bybit.com", handle: null })).toEqual({ tier: "primary", party: "Bybit" });
    expect(sourceStanding({ kind: "article", host: "www.coindesk.com", handle: null })).toEqual({ tier: "newsroom", party: "CoinDesk" });
    expect(sourceStanding({ kind: "x", host: null, handle: "Binance" })).toEqual({ tier: "primary", party: "Binance" });
    expect(sourceStanding({ kind: "x", host: null, handle: "binance_news_247" }).tier).toBe("unverified");
    /* A channel named after an exchange is still a channel. */
    expect(sourceStanding({ kind: "youtube", host: null, handle: null }).tier).toBe("unverified");
    expect(sourceStanding({ kind: "text", host: null, handle: null }).tier).toBe("unverified");
  });

  it("grades by who said it and how", () => {
    expect(gradeOf("announcement", "primary", false)).toBe("confirmed");
    expect(gradeOf("announcement", "newsroom", false)).toBe("reported");
    expect(gradeOf("announcement", "unverified", false)).toBe("unverified");
    expect(gradeOf("report", "unverified", false)).toBe("unverified");
    expect(gradeOf("announcement", "primary", true)).toBe("speculation");
    expect(gradeOf("speculation", "primary", false)).toBe("speculation");
    expect(gradeOf("opinion", "primary", false, true)).toBe("opinion");
    /* An official feed settles a listing claim whoever made it. */
    expect(gradeOf("speculation", "unverified", true, true)).toBe("confirmed");
  });

  it("hears hedging, but not a month", () => {
    expect(isHedged("Binance could list ABC soon")).toBe(true);
    expect(isHedged("ABC is reportedly in talks with Coinbase")).toBe(true);
    expect(isHedged("It may happen this week")).toBe(true);
    expect(isHedged("Trading opens on May 5 at 10:00 UTC")).toBe(false);
    expect(isHedged("Binance Will List ABC (ABC) with Seed Tag Applied")).toBe(false);
  });

  it("counts the attention words", () => {
    expect(attentionCues("🚨 BREAKING: HUGE news!! ABC to the moon")).toEqual(["🚨", "BREAKING", "huge", "moon", "!!"]);
    expect(attentionCues("Binance will list ABC on 26 November.")).toEqual([]);
  });
});

describe("the quote guard", () => {
  const source =
    "🚨 BREAKING: The community is once again speculating that Binance could list ABC soon. Insiders say it may happen this week. HUGE if true!!";

  it("finds a faithful quote through punctuation, case and emoji", () => {
    expect(quoteFound("the community is once again speculating that Binance could list ABC soon", source)).toBe(true);
    expect(quoteFound("Binance could list ABC soon... it may happen this week", source)).toBe(true);
    expect(quoteFound("Binance has confirmed it will list ABC", source)).toBe(false);
    expect(quoteFound("ABC", source)).toBe(false);
  });

  it("drops a claim whose quote is not in the source and keeps the fields to their sets", () => {
    const reply = JSON.stringify({
      summary: "People speculate Binance could list ABC.",
      claims: [
        { asset: "$abc", statement: "Binance may list ABC this week.", quote: "Binance could list ABC soon. Insiders say it may happen this week.", kind: "announcement", direction: "bullish", event: "listing" },
        { asset: "ABC", statement: "Binance confirmed ABC.", quote: "Binance has officially confirmed the ABC listing", kind: "announcement", direction: "bullish", event: "listing" },
        { asset: "ETF", statement: "Odd", quote: "Insiders say it may happen this week. HUGE if true!!", kind: "weird", direction: "up", event: "nope" },
      ],
    });
    const parsed = parseClaims(`Here you go:\n\`\`\`json\n${reply}\n\`\`\``, source);
    expect(parsed.dropped).toBe(1);
    expect(parsed.claims).toHaveLength(2);
    expect(parsed.claims[0]).toMatchObject({ asset: "ABC", kind: "announcement", hedged: true, event: "listing" });
    expect(parsed.claims[1]).toMatchObject({ asset: null, kind: "opinion", direction: "neutral", event: "other" });
  });

  it("cleans tickers", () => {
    expect(cleanAsset("$sol")).toBe("SOL");
    expect(cleanAsset("USDT")).toBeNull();
    expect(cleanAsset("2026")).toBeNull();
    expect(cleanAsset("not a ticker")).toBeNull();
  });
});

describe("page and embed text", () => {
  it("reads an article's metadata and paragraphs, not its chrome", () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="Exchange lists ABC &amp; DEF">
      <meta property="og:site_name" content="CoinDesk">
      <meta name="author" content="Jane Writer">
      <meta property="article:published_time" content="2026-11-24T09:30:00Z">
      <script>var tracking = "Ignore me, I am not a paragraph of the article at all";</script>
      </head><body><nav><p>Home · Markets · Policy · This menu is long enough to count</p></nav>
      <article><h2>The listing</h2><p>The exchange said on Monday that ABC will begin trading on November 26, according to its own notice.</p>
      <p>Short.</p><p>Analysts said the move could bring new liquidity to the token, though volumes remain thin.</p></article>
      <footer><p>Copyright notice that is long enough to be a paragraph if it were read.</p></footer></body></html>`;
    const article = extractArticle(html);
    expect(article).toMatchObject({ title: "Exchange lists ABC & DEF", site: "CoinDesk", author: "Jane Writer", publishedAt: "2026-11-24T09:30:00.000Z" });
    expect(article.text).toContain("ABC will begin trading on November 26");
    expect(article.text).toContain("new liquidity");
    expect(article.text).not.toContain("tracking");
    expect(article.text).not.toContain("menu");
    expect(article.text).not.toContain("Copyright");
  });

  it("reads a hostile page in linear time: thousands of unclosed paragraphs and noise tags", () => {
    const sentence = "<p>This sentence is long enough to count as prose in an article body. ";
    const html = `<html><body>${"<form><button>".repeat(5_000)}${sentence.repeat(20_000)}</body></html>`;
    const started = performance.now();
    const article = extractArticle(html);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(article.text).toContain("long enough to count as prose");
  });

  it("strips a noise element without eating a longer tag of the same prefix", () => {
    expect(stripBlocks("<head><title>T</title></head><header>menu</header><p>kept</p>", ["header"])).toBe("<head><title>T</title></head> <p>kept</p>");
  });

    it("prefers a page's JSON-LD body when it is the fuller text", () => {
    const body = "Full body. ".repeat(80);
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","headline":"H","datePublished":"2026-11-20T00:00:00Z","author":[{"name":"A"},{"name":"B"}],"articleBody":"${body}"}]}</script><p>Too short to matter.</p>`;
    const article = extractArticle(html);
    expect(article).toMatchObject({ title: "H", author: "A, B" });
    expect(article.text.length).toBeGreaterThan(500);
  });

  it("reads a post's text, real author and date from X's embed", () => {
    const post = parseXEmbed({
      author_name: "Binance",
      author_url: "https://x.com/binance",
      html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Binance Will List ABC (ABC)<br>Trading opens soon &amp; deposits are open <a href="https://t.co/x">https://t.co/x</a></p>&mdash; Binance (@binance) <a href="https://x.com/binance/status/1?ref_src=twsrc%5Etfw">November 24, 2026</a></blockquote>',
    });
    expect(post).toEqual({ handle: "binance", author: "Binance", text: "Binance Will List ABC (ABC)\nTrading opens soon & deposits are open https://t.co/x", publishedAt: "2026-11-24T00:00:00.000Z" });
    expect(parseXEmbed(null)).toBeNull();
  });
});

describe("smart-money flows", () => {
  const fill = (coin: string, dir: string, side: "A" | "B", time = 2_000, px = 100, sz = 10): WalletFill => ({ coin, dir, side, time, px, sz });
  const wallets = [
    { wallet: "w1", fills: [fill("SOL", "Open Long", "B"), fill("SOL", "Open Long", "B"), fill("@107", "Buy", "B")] },
    { wallet: "w2", fills: [fill("SOL", "Short > Long", "B")] },
    { wallet: "w3", fills: [fill("SOL", "Open Long", "B"), fill("ETH", "Close Long", "A")] },
    { wallet: "w4", fills: [fill("SOL", "Open Short", "A"), fill("SOL", "Open Long", "B", 500)] },
  ];

  it("counts wallets that opened each side, inside the window, perps only", () => {
    const flows = aggregateFlows(wallets, 1_000);
    const sol = flows.find((flow) => flow.coin === "SOL");
    expect(sol).toMatchObject({ openedLong: 3, openedShort: 1, closedShort: 1, boughtUsd: 4_000, soldUsd: 1_000 });
    expect(flows.find((flow) => flow.coin === "@107")).toBeUndefined();
    expect(flows.find((flow) => flow.coin === "ETH")).toMatchObject({ openedLong: 0, closedLong: 1 });
  });

  it("calls a signal when enough open one side and few the other", () => {
    const flows = aggregateFlows(wallets, 1_000);
    expect(flowSignals(flows)).toEqual([{ coin: "SOL", side: "long", wallets: 3, against: 1, usd: 4_000, lastAt: 2_000 }]);
    expect(flowSignals(flows, 4)).toEqual([]);
    expect(readOf(flows.find((flow) => flow.coin === "SOL"))).toBe("buying");
    expect(readOf(undefined)).toBe("quiet");
  });

  it("maps a ticker to its Hyperliquid coin", () => {
    expect(coinForTicker("PEPE", ["BTC", "kPEPE"])).toBe("kPEPE");
    expect(coinForTicker("BTC", new Set(["BTC"]))).toBe("BTC");
    expect(coinForTicker("ABC", ["BTC"])).toBeNull();
  });
});

describe("official listing feeds", () => {
  it("finds tickers in every title shape", () => {
    expect(tickersInTitle("Binance Will List Rocket Pool (RPL) and Acurast (ACU)")).toEqual(["RPL", "ACU"]);
    expect(tickersInTitle("New listing: SOLUSDT Perpetual")).toEqual(["SOL"]);
    expect(tickersInTitle("OKX to list perpetual futures for ABC, DEF and GHI")).toEqual(["ABC", "DEF", "GHI"]);
    expect(tickersInTitle("로켓풀(RPL), 디브릿지(DBR) 신규 거래지원 안내")).toEqual(["RPL", "DBR"]);
  });

  it("keeps stock perps and tokenised shares out", () => {
    expect(kindOfTitle("Bybit", "New listing: Listing of SMTCUSDT on Bybit TradFi Perpetual")).toBe("other");
    expect(kindOfTitle("OKX", "OKX to list Exchange OS trading pairs for ptSPY")).toBe("other");
    expect(kindOfTitle("OKX", "OKX to list WIF for spot trading")).toBe("listing");
    expect(kindOfTitle("Bybit", "Delisting of ABCUSDT")).toBe("delisting");
    expect(kindOfTitle("Upbit", "디브릿지(DBR) 거래지원 종료 안내")).toBe("delisting");
    /* An investment warning is not a delisting. */
    expect(kindOfTitle("Upbit", "사이버(CYBER) 거래 유의 종목 지정 안내")).toBe("other");
  });

  it("parses each feed and refuses links off the exchange's own site", () => {
    const bybit = parseBybit({ result: { list: [{ title: "New listing: WIFUSDT Perpetual", url: "https://announcements.bybit.com/en-US/article/x/", publishTime: 1_795_426_435_000 }, { title: "New listing: ABCUSDT", url: "https://evil.example/x", publishTime: 1 }] } });
    expect(bybit).toHaveLength(1);
    expect(bybit[0]).toMatchObject({ exchange: "Bybit", kind: "listing", tickers: ["WIF"] });
    const okx = parseOkx({ data: [{ details: [{ title: "OKX to list WIF for spot trading", url: "https://www.okx.com/help/x", pTime: "1795499123118" }] }] });
    expect(okx[0]).toMatchObject({ exchange: "OKX", tickers: ["WIF"], at: 1_795_499_123_118 });
    const upbit = parseUpbit({ data: { notices: [{ id: 6822, title: "로켓풀(RPL) 신규 거래지원 안내", first_listed_at: "2026-11-24T11:39:17+09:00" }] } });
    expect(upbit[0]).toMatchObject({ exchange: "Upbit", url: "https://upbit.com/service_center/notice?id=6822", tickers: ["RPL"], kind: "listing" });
  });

  it("confirms a listing claim only from a recent listing of that ticker", () => {
    const now = Date.parse("2026-11-25T00:00:00Z");
    const feeds = [
      { exchange: "OKX" as const, id: "1", title: "OKX to list WIF", url: "u", at: now - 3_600_000, kind: "listing" as const, tickers: ["WIF"] },
      { exchange: "Bybit" as const, id: "2", title: "Delisting of ABC", url: "u", at: now - 3_600_000, kind: "delisting" as const, tickers: ["ABC"] },
      { exchange: "Upbit" as const, id: "3", title: "old", url: "u", at: now - 40 * 86_400_000, kind: "listing" as const, tickers: ["OLD"] },
    ];
    expect(confirmingListing("WIF", feeds, now)?.exchange).toBe("OKX");
    expect(confirmingListing("WIF", feeds, now, "OKX")?.exchange).toBe("OKX");
    /* A claim about Upbit is not settled by OKX. */
    expect(confirmingListing("WIF", feeds, now, "Upbit")).toBeNull();
    expect(exchangeNamed("Binance could list WIF soon")).toBe("Binance");
    expect(exchangeNamed("WIF to be listed on OKX and Bybit")).toBeNull();
    expect(exchangeNamed("WIF will be listed")).toBeNull();
    expect(confirmingListing("ABC", feeds, now)).toBeNull();
    expect(confirmingListing("OLD", feeds, now)).toBeNull();
  });
});

describe("auto-buy rules", () => {
  const base = { name: "Follow", trigger: "smart_money", side: "long", coins: [], minWallets: 4, sizeUsd: 100, leverage: 2, takeProfitPct: 6, stopLossPct: 3, maxPerDay: 2, mode: "paper" };

  it("holds a rule to the trading limits", () => {
    expect("rule" in validateRule(base)).toBe(true);
    expect(validateRule({ ...base, sizeUsd: 5 })).toMatchObject({ error: expect.stringContaining("Size") });
    expect(validateRule({ ...base, leverage: 9 })).toMatchObject({ error: expect.stringContaining("Leverage") });
    expect(validateRule({ ...base, minWallets: 2 })).toMatchObject({ error: expect.stringContaining("Wallets") });
    expect(validateRule({ ...base, coins: ["xyz:NVDA"] })).toMatchObject({ error: expect.stringContaining("markets") });
    expect(validateRule({ ...base, trigger: "listing", side: "short" })).toMatchObject({ error: "A listing rule only buys." });
    expect(validateRule({ ...base, leverage: 5, stopLossPct: 20 })).toMatchObject({ error: expect.stringContaining("liquidated") });
    expect(validateRule({ ...base, mode: "anything" })).toMatchObject({ rule: { mode: "paper" } });
  });

  it("wants only its own trigger, markets, side and wallet count", () => {
    const checked = validateRule({ ...base, coins: ["SOL"] });
    if (!("rule" in checked)) throw new Error("rule refused");
    const signal: DetectedSignal = { key: flowKey("SOL", Date.parse("2026-11-25T10:00:00Z")), trigger: "smart_money", coin: "SOL", side: "long", wallets: 5, reason: "", at: 0 };
    expect(signal.key).toBe("sm:SOL:2026-11-25");
    expect(listingKey("SOL", Date.parse("2026-11-25T23:59:00Z"))).toBe("listing:SOL:2026-11-25");
    expect(wants(checked.rule, signal)).toBe(true);
    expect(wants(checked.rule, { ...signal, wallets: 3 })).toBe(false);
    expect(wants(checked.rule, { ...signal, side: "short" })).toBe(false);
    expect(wants(checked.rule, { ...signal, coin: "ETH" })).toBe(false);
    expect(wants(checked.rule, { ...signal, trigger: "listing", key: listingKey("SOL", 0) })).toBe(false);
  });
});
