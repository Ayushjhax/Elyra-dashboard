import { describe, expect, it } from "vitest";
import { bookStats, estimateFill, parseHyperliquidBook, type Book } from "@/lib/market/book";

const book: Book = {
  coin: "BTC",
  bids: [
    { price: 99.9, size: 10 },
    { price: 99.6, size: 10 },
    { price: 98, size: 100 },
  ],
  asks: [
    { price: 100.1, size: 10 },
    { price: 100.4, size: 10 },
    { price: 102, size: 100 },
  ],
  at: "2026-11-21T00:00:00.000Z",
};

describe("bookStats", () => {
  it("reads the mid, the spread and the depth in each band", () => {
    const stats = bookStats(book)!;
    expect(stats.mid).toBeCloseTo(100);
    expect(stats.spreadBps).toBeCloseTo(20);
    const half = stats.depth.find((band) => band.pct === 0.5)!;
    expect(half.bidUsd).toBeCloseTo(99.9 * 10 + 99.6 * 10);
    expect(half.askUsd).toBeCloseTo(100.1 * 10 + 100.4 * 10);
    const two = stats.depth.find((band) => band.pct === 2)!;
    expect(two.bidUsd).toBeCloseTo(99.9 * 10 + 99.6 * 10 + 98 * 100);
  });

  it("is null for an empty or crossed book", () => {
    expect(bookStats({ ...book, bids: [] })).toBeNull();
    expect(bookStats({ ...book, bids: [{ price: 101, size: 1 }] })).toBeNull();
  });
});

describe("estimateFill", () => {
  it("fills a small buy at the best ask", () => {
    const fill = estimateFill(book, "buy", 500)!;
    expect(fill.avgPrice).toBeCloseTo(100.1);
    expect(fill.slippageBps).toBeCloseTo(10);
    expect(fill.levels).toBe(1);
    expect(fill.complete).toBe(true);
  });

  it("walks the book for a larger order and averages the levels", () => {
    const fill = estimateFill(book, "buy", 1500)!;
    expect(fill.levels).toBe(2);
    expect(fill.worstPrice).toBe(100.4);
    expect(fill.avgPrice).toBeGreaterThan(100.1);
    expect(fill.avgPrice).toBeLessThan(100.4);
  });

  it("walks the bids for a sell, with slippage positive when worse", () => {
    const fill = estimateFill(book, "sell", 500)!;
    expect(fill.avgPrice).toBeCloseTo(99.9);
    expect(fill.slippageBps).toBeCloseTo(10);
  });

  it("says when the visible book cannot hold the size", () => {
    const fill = estimateFill(book, "buy", 1_000_000)!;
    expect(fill.complete).toBe(false);
    expect(fill.filledUsd).toBeLessThan(1_000_000);
  });

  it("is null for nothing to fill", () => {
    expect(estimateFill(book, "buy", 0)).toBeNull();
    expect(estimateFill({ ...book, asks: [] }, "buy", 100)).toBeNull();
  });
});

describe("parseHyperliquidBook", () => {
  it("reads l2Book's levels and drops malformed ones", () => {
    const parsed = parseHyperliquidBook("ETH", {
      coin: "ETH",
      time: 1_763_683_200_000,
      levels: [
        [
          { px: "3000.5", sz: "1.2", n: 3 },
          { px: "x", sz: "1", n: 1 },
        ],
        [{ px: "3001", sz: "0.8", n: 2 }],
      ],
    })!;
    expect(parsed.bids).toEqual([{ price: 3000.5, size: 1.2 }]);
    expect(parsed.asks).toEqual([{ price: 3001, size: 0.8 }]);
    expect(parsed.at).toBe(new Date(1_763_683_200_000).toISOString());
  });

  it("is null for anything else", () => {
    expect(parseHyperliquidBook("ETH", null)).toBeNull();
    expect(parseHyperliquidBook("ETH", { levels: [[]] })).toBeNull();
  });
});
