import { describe, expect, it } from "vitest";
import {
  HISTORY_MIN_USD,
  formatAmountUsd,
  hackItem,
  hackKey,
  historyItems,
  onThisDay,
  pageFeed,
  postableHacks,
  type RawHack,
} from "@/lib/events/feed";
import { MILESTONES } from "@/lib/events/history";
import type { EventItem } from "@/lib/events/types";

/* ---------------------------------------------------------------------------
   The events feed: DefiLlama's records and the reviewed milestones become one
   newest-first timeline, filtered and paged without repeats; an AI post about
   an item replaces it; and "on this day" and "new hack" pick what they should.
--------------------------------------------------------------------------- */

const at = (iso: string) => Date.parse(iso) / 1000;

function hack(overrides: Partial<RawHack> = {}): RawHack {
  return {
    date: at("2025-02-21T00:00:00Z"),
    name: "Bybit",
    amount: 1_400_000_000,
    chain: ["Ethereum"],
    classification: "Infrastructure",
    technique: "Signer Phishing",
    description: "Attackers tricked signers into approving a malicious transaction.",
    source: "https://example.com/bybit",
    returnedFunds: null,
    defillamaId: "5001",
    ...overrides,
  };
}

describe("formatAmountUsd", () => {
  it.each([
    [6_360_000_000, "$6.36 billion"],
    [1_400_000_000, "$1.4 billion"],
    [470_000_000, "$470 million"],
    [8_750_000, "$8.8 million"],
    [820_000, "$820,000"],
  ])("formats %d as %s", (value, text) => {
    expect(formatAmountUsd(value)).toBe(text);
  });
});

describe("hackItem", () => {
  it("states what was taken, how and where, with DefiLlama's own description and source", () => {
    expect(hackItem(hack())).toMatchObject({
      key: "hack:5001",
      source: "defillama",
      category: "hack",
      at: "2025-02-21T00:00:00.000Z",
      title: "Bybit: $1.4 billion taken",
      body: "Attackers tricked signers into approving a malicious transaction.",
      amountUsd: 1_400_000_000,
      chains: ["Ethereum"],
      detail: "Signer Phishing",
      link: { label: "example.com", url: "https://example.com/bybit" },
    });
  });

  it("falls back to DefiLlama's page for a missing or unsafe source, and keys by name and date without an id", () => {
    const unsafe = hackItem(hack({ source: "javascript:alert(1)", defillamaId: null, description: null }));
    expect(unsafe.link).toEqual({ label: "DefiLlama", url: "https://defillama.com/hacks" });
    expect(unsafe.key).toBe("hack:bybit-2025-02-21");
    expect(unsafe.body).toBe("Infrastructure: Signer Phishing.");
    expect(hackItem(hack({ amount: null })).title).toBe("Bybit is exploited");
    expect(hackKey(hack({ defillamaId: 42 }))).toBe("hack:42");
  });
});

describe("the milestones", () => {
  it("have unique slugs, real dates, https sources and no emoji", () => {
    expect(new Set(MILESTONES.map((milestone) => milestone.slug)).size).toBe(MILESTONES.length);
    for (const milestone of MILESTONES) {
      expect(new Date(`${milestone.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(milestone.date);
      expect(milestone.link.url.startsWith("https://")).toBe(true);
      expect(/\p{Extended_Pictographic}/u.test(`${milestone.title} ${milestone.body}`)).toBe(false);
      expect(milestone.body).not.toContain("!");
    }
  });
});

describe("historyItems", () => {
  it(`keeps every milestone and hacks of ${formatAmountUsd(HISTORY_MIN_USD)} or more`, () => {
    const items = historyItems([hack(), hack({ defillamaId: "small", amount: 4_999_999 }), hack({ defillamaId: "unknown", amount: null })]);
    expect(items.filter((item) => item.source === "defillama").map((item) => item.key)).toEqual(["hack:5001"]);
    expect(items.filter((item) => item.source === "history")).toHaveLength(MILESTONES.length);
  });
});

describe("pageFeed", () => {
  const item = (key: string, iso: string, category: EventItem["category"] = "hack", extra: Partial<EventItem> = {}): EventItem => ({
    ...hackItem(hack()),
    key,
    at: iso,
    category,
    ...extra,
  });
  const items = [
    item("hack:a", "2024-01-01T00:00:00.000Z"),
    item("milestone:b", "2024-01-01T00:00:00.000Z", "upgrade"),
    item("hack:c", "2023-06-01T00:00:00.000Z"),
    item("milestone:d", "2022-11-11T00:00:00.000Z", "collapse"),
    item("post:e", "2026-11-11T09:00:00.000Z", "hack", { source: "ai", refersTo: "hack:c" }),
  ];

  it("is newest first, and an AI post replaces the item it is about", () => {
    expect(pageFeed(items, { filter: "all", before: null }).items.map((entry) => entry.key)).toEqual(["post:e", "milestone:b", "hack:a", "milestone:d"]);
  });

  it("pages by cursor without repeating or skipping items that share a date", () => {
    const first = pageFeed(items, { filter: "all", before: null, limit: 2 });
    expect(first.items.map((entry) => entry.key)).toEqual(["post:e", "milestone:b"]);
    const second = pageFeed(items, { filter: "all", before: first.next, limit: 2 });
    expect(second.items.map((entry) => entry.key)).toEqual(["hack:a", "milestone:d"]);
    expect(second.next).toBeNull();
  });

  it("filters by category, and to the viewer's saved items", () => {
    expect(pageFeed(items, { filter: "upgrades", before: null }).items.map((entry) => entry.key)).toEqual(["milestone:b"]);
    expect(pageFeed(items, { filter: "collapses", before: null }).items.map((entry) => entry.key)).toEqual(["milestone:d"]);
    expect(pageFeed(items, { filter: "saved", before: null, savedKeys: new Set(["hack:a"]) }).items.map((entry) => entry.key)).toEqual(["hack:a"]);
  });
});

describe("onThisDay", () => {
  it("picks earlier years' events on the same date, hacks only when large", () => {
    const items = historyItems([
      hack({ date: at("2021-11-11T00:00:00Z"), defillamaId: "big", amount: 150_000_000 }),
      hack({ date: at("2020-11-11T00:00:00Z"), defillamaId: "small", amount: 6_000_000 }),
      hack({ date: at("2026-11-11T00:00:00Z"), defillamaId: "today", amount: 900_000_000 }),
    ]);
    expect(onThisDay(items, "2026-11-11").map((entry) => entry.key)).toEqual(["milestone:ftx-bankruptcy", "hack:big"]);
  });
});

describe("postableHacks", () => {
  it("takes hacks of $1 million or more from the last three days, largest first", () => {
    const now = Date.parse("2026-11-11T12:00:00Z");
    const recent = [
      hack({ defillamaId: "1", date: at("2026-11-10T00:00:00Z"), amount: 2_000_000 }),
      hack({ defillamaId: "2", date: at("2026-11-11T00:00:00Z"), amount: 9_000_000 }),
      hack({ defillamaId: "3", date: at("2026-11-11T00:00:00Z"), amount: 999_999 }),
      hack({ defillamaId: "4", date: at("2026-11-01T00:00:00Z"), amount: 50_000_000 }),
      hack({ defillamaId: "5", date: at("2026-11-12T00:00:00Z"), amount: 50_000_000 }),
    ];
    expect(postableHacks(recent, now).map((entry) => entry.defillamaId)).toEqual(["2", "1"]);
  });
});
