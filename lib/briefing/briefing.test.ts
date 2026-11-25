import { describe, expect, it } from "vitest";
import {
  governanceCandidates,
  headlineTokens,
  isNoise,
  newsCandidates,
  sameStory,
  securityCandidate,
  shortlist,
  type Candidate,
  type SnapshotProposal,
} from "@/lib/briefing/candidates";
import { briefingText, headlineLine, keycap } from "@/lib/briefing/format";
import { chineseForms, chineseStaysOnFacts, englishStaysOnFacts, factsName } from "@/lib/briefing/guard";
import { parseRss, plainText } from "@/lib/briefing/rss";
import type { Briefing, BriefingItem } from "@/lib/briefing/types";
import { jsonArray, sourceWords } from "@/lib/briefing/write";

const NOW = Date.parse("2026-11-21T00:05:00Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toUTCString();

const rss = (items: Array<{ title: string; link: string; description?: string; at: string }>) =>
  `<?xml version="1.0"?><rss><channel><title>Feed</title>${items
    .map(
      (item) =>
        `<item><title><![CDATA[${item.title}]]></title><link>${item.link}</link><description><![CDATA[<p>${item.description ?? ""}</p>]]></description><pubDate>${item.at}</pubDate><category><![CDATA[DeFi]]></category></item>`,
    )
    .join("")}</channel></rss>`;

describe("parseRss", () => {
  it("reads title, link, plain description, date and categories", () => {
    const [item] = parseRss(rss([{ title: "Hashi launches on Sui mainnet", link: "https://example.com/a", description: "BTC &amp; DeFi <b>lending</b>", at: hoursAgo(2) }]));
    expect(item).toEqual({
      title: "Hashi launches on Sui mainnet",
      link: "https://example.com/a",
      description: "BTC & DeFi lending",
      publishedAt: new Date(NOW - 2 * 3_600_000).toISOString(),
      categories: ["DeFi"],
    });
  });

  it("drops an item without an https link", () => {
    expect(parseRss(rss([{ title: "x", link: "javascript:alert(1)", at: hoursAgo(1) }]))).toEqual([]);
  });

  it("decodes escaped HTML in a description", () => {
    expect(plainText("&lt;p&gt;Tether &amp;#8217;s stake&lt;/p&gt;")).toBe("Tether ’s stake");
  });
});

describe("news candidates", () => {
  it("treats price calls, opinion and promotion as noise", () => {
    expect(isNoise({ title: "Bitcoin price prediction: BTC eyes $100K", link: "https://x.com/news/a" })).toBe(true);
    expect(isNoise({ title: "Aave adds tokenized stocks", link: "https://x.com/sponsored/a" })).toBe(true);
    expect(isNoise({ title: "HSBC launches tokenized money market fund", link: "https://x.com/news/a" })).toBe(false);
  });

  it("recognises the same story from two outlets", () => {
    expect(sameStory(headlineTokens("Hashi launches on Sui mainnet, bringing bitcoin lending"), headlineTokens("Sui's Hashi mainnet launch brings bitcoin lending to DeFi"))).toBe(true);
    expect(sameStory(headlineTokens("Hashi launches on Sui mainnet"), headlineTokens("Tether invests in SCRYPT"))).toBe(false);
  });

  it("merges a story across outlets, weights it by coverage and keeps the window", () => {
    const feeds = [
      { outlet: "The Block", items: parseRss(rss([{ title: "Hashi launches on Sui mainnet bringing bitcoin lending", link: "https://theblock.co/a", description: "Short.", at: hoursAgo(3) }])) },
      {
        outlet: "Decrypt",
        items: parseRss(
          rss([
            { title: "Hashi mainnet launch on Sui brings bitcoin lending", link: "https://decrypt.co/b", description: "A longer standfirst with 20 partners.", at: hoursAgo(2) },
            { title: "Tether makes strategic investment in SCRYPT", link: "https://decrypt.co/c", at: hoursAgo(5) },
            { title: "Old news from two days ago", link: "https://decrypt.co/d", at: hoursAgo(48) },
          ]),
        ),
      },
    ];
    const candidates = newsCandidates(feeds, NOW);
    expect(candidates).toHaveLength(2);
    const hashi = candidates.find((candidate) => candidate.title.startsWith("Hashi")) as Candidate;
    expect(hashi.sources.map((source) => source.name)).toEqual(["The Block", "Decrypt"]);
    expect(hashi.summary).toBe("A longer standfirst with 20 partners.");
    expect(hashi.weight).toBeGreaterThan(candidates.find((candidate) => candidate !== hashi)!.weight);
  });
});

const proposal = (over: Partial<SnapshotProposal>): SnapshotProposal => ({
  id: "0xabc",
  title: "Accept six tokenized stocks as collateral",
  space: { id: "aavedao.eth", name: "Aave DAO" },
  state: "closed",
  created: (NOW - 6 * 86_400_000) / 1000,
  end: (NOW - 3_600_000) / 1000,
  votes: 120,
  choices: ["For", "Against"],
  scores: [995.1, 4.9],
  scores_total: 1000,
  link: "https://snapshot.box/#/s:aavedao.eth/proposal/0xabc",
  ...over,
});

describe("governance candidates", () => {
  it("reports a vote that closed in the window with its result, carrying the DAO's token", () => {
    const [candidate] = governanceCandidates([proposal({})], NOW);
    expect(candidate.token).toBe("AAVE");
    expect(candidate.facts).toContain('Result: "For" received 99.51% of the voting power');
  });

  it("skips unknown DAOs, thin closed votes and votes outside the window", () => {
    expect(governanceCandidates([proposal({ space: { id: "random.eth", name: "Random" } })], NOW)).toEqual([]);
    expect(governanceCandidates([proposal({ votes: 3 })], NOW)).toEqual([]);
    expect(governanceCandidates([proposal({ end: (NOW - 5 * 86_400_000) / 1000 })], NOW)).toEqual([]);
  });
});

describe("security candidate", () => {
  const hack = (name: string, amount: number, hours: number) => ({
    date: (NOW - hours * 3_600_000) / 1000,
    name,
    amount,
    chain: ["Ethereum"],
    classification: null,
    technique: null,
    description: null,
    source: null,
    returnedFunds: null,
    defillamaId: name,
  });

  it("gathers the window's hacks into one item, largest first", () => {
    const candidate = securityCandidate([hack("RNT Lend", 955_000, 10), hack("K3 Capital sBOLD", 3_420_000, 20), hack("Tiny", 10_000, 5), hack("Old", 9_000_000, 100)], NOW);
    expect(candidate?.facts.slice(1).map((line) => line.split(":")[0])).toEqual(["K3 Capital sBOLD", "RNT Lend"]);
  });

  it("is absent when nothing was recorded", () => {
    expect(securityCandidate([], NOW)).toBeNull();
  });
});

describe("shortlist", () => {
  it("caps governance so news leads", () => {
    const make = (kind: Candidate["kind"], index: number): Candidate => ({ id: `${kind}${index}`, kind, title: "", summary: "", at: new Date(NOW).toISOString(), sources: [], facts: [], token: null, weight: kind === "governance" ? 9 : 1 });
    const list = shortlist([...Array.from({ length: 10 }, (_, i) => make("governance", i)), ...Array.from({ length: 40 }, (_, i) => make("news", i))], 20);
    expect(list.filter((candidate) => candidate.kind === "governance")).toHaveLength(6);
    expect(list).toHaveLength(20);
  });
});

describe("guard", () => {
  const facts = ["Summary: Sky's PSM holds approximately $2.7 billion in USDC; K3 lost $3.42 million and RNT Lend $955,000. It activates on November 24."];

  it("derives the exact 万 and 亿 forms and month numbers", () => {
    const forms = chineseForms(facts[0]);
    expect(forms.has("27")).toBe(true);
    expect(forms.has("342")).toBe(true);
    expect(forms.has("95.5")).toBe(true);
    expect(forms.has("11")).toBe(true);
  });

  it("passes a faithful translation and fails an invented figure", () => {
    expect(chineseStaysOnFacts("Sky 的 PSM 持有约 27亿美元 USDC，11月24日激活。", facts)).toBe(true);
    expect(chineseStaysOnFacts("Sky 的 PSM 持有约 30亿美元 USDC。", facts)).toBe(false);
    expect(chineseStaysOnFacts("损失约三百万美元", facts)).toBe(false);
    expect(chineseStaysOnFacts("详见 example.com", facts)).toBe(false);
  });

  it("holds the English to the facts' numbers", () => {
    expect(englishStaysOnFacts("Sky's PSM holds about $2.7 billion in USDC.", facts)).toBe(true);
    expect(englishStaysOnFacts("Sky's PSM holds about $5 billion in USDC.", facts)).toBe(false);
  });

  it("takes a ticker only when the facts name it", () => {
    expect(factsName("SUI", ["Hashi has launched on the Sui mainnet"])).toBe(true);
    expect(factsName("INJ", ["$INJ: Veyra upgrade passes"])).toBe(true);
    expect(factsName("MOVE", ["Prices move higher"])).toBe(false);
    expect(factsName("MOVE", ["Movement's MOVE token"])).toBe(true);
    expect(factsName("ETH", ["Bitcoin lending"])).toBe(false);
  });
});

describe("writer helpers", () => {
  it("reads the first JSON array of a reply", () => {
    expect(jsonArray('Here: [{"candidate": 1}] done')).toEqual([{ candidate: 1 }]);
    expect(jsonArray("no json")).toBeNull();
  });

  it("falls back to the source's headline and standfirst", () => {
    const words = sourceWords({ id: "x", kind: "news", title: "Tether invests in SCRYPT", summary: "Tether has invested in SCRYPT. It expands channels.", at: "", sources: [], facts: [], token: null, weight: 1 });
    expect(words).toEqual({ headline: "Tether invests in SCRYPT", body: "Tether has invested in SCRYPT. It expands channels." });
  });
});

describe("briefingText", () => {
  const item = (over: Partial<BriefingItem>): BriefingItem => ({
    kind: "news",
    ticker: null,
    assetId: null,
    headline: "Headline",
    body: "Body.",
    headlineZh: null,
    bodyZh: null,
    sources: [],
    facts: [],
    writtenBy: "model",
    ...over,
  });
  const briefing: Briefing = {
    day: "2026-11-21",
    publishedAt: "2026-11-21T00:05:00Z",
    items: [
      item({ ticker: "SUI", headline: "Hashi launches on mainnet", body: "Hashi has launched.", headlineZh: "Hashi 上线主网", bodyZh: "Hashi 已上线。" }),
      item({ headline: "HSBC launches tokenized fund", body: "Clients can subscribe." }),
    ],
    extras: { gainers: [], losers: [], yields: [], signals: [] },
  };

  it("writes the posted-digest format", () => {
    expect(briefingText(briefing, "en", "https://getelyra.xyz/briefing?day=2026-11-21")).toBe(
      [
        "Elyra Daily Briefing · 21 November 2026",
        "",
        "1️⃣ $SUI: Hashi launches on mainnet",
        "",
        "Hashi has launched.",
        "",
        "2️⃣ HSBC launches tokenized fund",
        "",
        "Clients can subscribe.",
        "",
        "And more: trending token moves, on-chain opportunities, market signals......",
        "",
        "Read it on Elyra: https://getelyra.xyz/briefing?day=2026-11-21",
      ].join("\n"),
    );
  });

  it("writes Chinese where it passed, and English where it did not", () => {
    const text = briefingText(briefing, "zh-CN");
    expect(text.startsWith("Elyra 每日简报 · 2026年11月21日")).toBe(true);
    expect(text).toContain("1️⃣ $SUI：Hashi 上线主网");
    expect(text).toContain("2️⃣ HSBC launches tokenized fund");
  });

  it("numbers ten with 🔟", () => {
    expect(keycap(9)).toBe("\u{1F51F}");
    expect(headlineLine(item({}), "en")).toBe("Headline");
  });
});

describe("merged", () => {
  it("joins other reports' outlets and facts under the lead", async () => {
    const { merged } = await import("@/lib/briefing/write");
    const make = (name: string, summary: string): Candidate => ({ id: name, kind: "news", title: `${name} headline`, summary, at: "", sources: [{ name, url: `https://${name}.example/a` }], facts: [`Headline (${name}): x`], token: null, weight: 3 });
    const story = merged(make("Decrypt", "Short."), [make("The Block", "A longer standfirst."), make("Decrypt", "Again.")]);
    expect(story.title).toBe("Decrypt headline");
    expect(story.sources.map((source) => source.name)).toEqual(["Decrypt", "The Block"]);
    expect(story.facts).toHaveLength(3);
    expect(story.summary).toBe("A longer standfirst.");
  });
});

describe("guard, abbreviations and coin names", () => {
  it("lets a Chinese date stand for an abbreviated month", () => {
    const facts = ["Bitcoin fell 33.1% below its Oct. 21 high; the bill is read on Dec. 2 and Sept. 9."];
    expect(chineseStaysOnFacts("比特币较10月21日高点下跌33.1%，法案将于12月2日和9月9日审议。", facts)).toBe(true);
    expect(chineseStaysOnFacts("法案将于11月2日审议。", facts)).toBe(false);
    expect(chineseForms("Markets moved").has("3")).toBe(false);
  });

  it("takes BTC and ETH when the facts say Bitcoin and Ether", () => {
    expect(factsName("BTC", ["Bitcoin fell to a two-year low"])).toBe(true);
    expect(factsName("ETH", ["Ether slides near $1,550"])).toBe(true);
    expect(factsName("SOL", ["Ether slides near $1,550"])).toBe(false);
  });
});
