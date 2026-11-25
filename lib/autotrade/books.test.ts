import { describe, expect, it } from "vitest";
import { bookLine, findBook, groupBooks, nameScore, toReviewTrade, type Book } from "@/lib/autotrade/books";
import type { TradingPositionRow } from "@/lib/supabase/types";

const row = (overrides: Partial<TradingPositionRow>): TradingPositionRow => ({
  id: "p",
  user_id: "u1",
  rule_id: null,
  rule_name: "Market long",
  mode: "paper",
  network: null,
  coin: "BTC",
  side: "long",
  size: 0.1,
  entry_price: 100,
  take_profit: 104,
  stop_loss: 98,
  signal_at: "2026-10-01T00:00:00.000Z",
  entry_reason: null,
  entry_cloid: null,
  tp_cloid: null,
  sl_cloid: null,
  status: "closed",
  exit_price: 98,
  exit_reason: "stop_loss",
  realised_pnl_usd: -0.2,
  error: null,
  opened_at: "2026-10-01T00:00:00.000Z",
  closed_at: "2026-10-01T03:00:00.000Z",
  leverage: 2,
  origin: "rule",
  fund_id: null,
  ...overrides,
});

const strategies = [
  { id: "SESSION_VWAP_RECLAIM_V1", name: "Session VWAP — reclaim" },
  { id: "RSI_12_MEAN_REVERSION_V1", name: "RSI (12) — mean reversion" },
];
const rules = [
  { id: "r1", name: "Volume Anchor Trend", strategy_id: "SESSION_VWAP_RECLAIM_V1", leverage: 2 },
  { id: "r2", name: "ETH VWAP", strategy_id: "SESSION_VWAP_RECLAIM_V1", leverage: 3 },
  { id: "r3", name: "BTC RSI dip", strategy_id: "RSI_12_MEAN_REVERSION_V1", leverage: 2 },
];
const positions = [
  row({ id: "a", rule_id: "r1", rule_name: "Volume Anchor Trend" }),
  row({ id: "b", rule_id: "r1", rule_name: "Volume Anchor Trend" }),
  row({ id: "c", rule_id: "r2", rule_name: "ETH VWAP", coin: "ETH" }),
  row({ id: "d", rule_id: "r3", rule_name: "BTC RSI dip" }),
  row({ id: "e", rule_name: "Market short", side: "short" }),
  row({ id: "f", rule_name: "Limit long · BTC", origin: "order" }),
  row({ id: "g", rule_name: "Night fund", origin: "fund", fund_id: "f1" }),
  row({ id: "h", rule_name: "Agent: Scout" }),
  row({ id: "i", rule_name: "Old breakout rule" }),
];
const books = groupBooks(positions, rules, [{ id: "f1", name: "Night fund" }], strategies);
const alias = (query: string) => (/vwap/i.test(query) ? "SESSION_VWAP_RECLAIM_V1" : /rsi/i.test(query) ? "RSI_12_MEAN_REVERSION_V1" : null);
const ids = (book: Book) => book.positions.map((entry) => entry.id).sort();

describe("groupBooks", () => {
  it("puts every position in exactly one book", () => {
    expect(books.flatMap(ids).sort()).toEqual(positions.map((entry) => entry.id).sort());
    expect(books.map((book) => book.kind).sort()).toEqual(["agent", "fund", "limit_orders", "market_orders", "other", "rule", "rule", "rule"]);
  });

  it("names a rule's book by the rule, with its strategy", () => {
    const book = books.find((entry) => entry.key === "rule:r1")!;
    expect(book.name).toBe("Volume Anchor Trend");
    expect(book.strategy?.name).toBe("Session VWAP — reclaim");
    expect(ids(book)).toEqual(["a", "b"]);
  });
});

describe("nameScore", () => {
  it("ranks exact over contained over every word present", () => {
    expect(nameScore("Volume Anchor Trend", "volume anchor trend")).toBe(3);
    expect(nameScore("Volume Anchor Trend", "anchor trend")).toBe(2);
    expect(nameScore("Volume Anchor Trend", "trend volume")).toBe(1);
    expect(nameScore("Volume Anchor Trend", "momentum")).toBe(0);
  });
});

describe("findBook", () => {
  it("finds a rule by the name the person gave it", () => {
    const match = findBook(books, "Volume Anchor Trend", strategies, alias);
    expect("book" in match && ids(match.book)).toEqual(["a", "b"]);
  });

  it("gathers every rule that runs a strategy, named by the strategy", () => {
    const match = findBook(books, "Session VWAP", strategies, alias);
    expect("book" in match && match.book.kind).toBe("strategy");
    expect("book" in match && ids(match.book)).toEqual(["a", "b", "c"]);
  });

  it("reads a strategy's informal name, below a rule's own name", () => {
    const match = findBook(books, "rsi", strategies, alias);
    expect("book" in match && ids(match.book)).toEqual(["d"]);
  });

  it("finds the hand-placed, limit, fund and agent books", () => {
    expect(ids((findBook(books, "market orders", strategies, alias) as { book: Book }).book)).toEqual(["e"]);
    expect(ids((findBook(books, "limit orders", strategies, alias) as { book: Book }).book)).toEqual(["f"]);
    expect(ids((findBook(books, "night fund", strategies, alias) as { book: Book }).book)).toEqual(["g"]);
    expect(ids((findBook(books, "all my trades", strategies, alias) as { book: Book }).book)).toHaveLength(positions.length);
  });

  it("returns the choices for no name, an unknown one or a tie — never a guess", () => {
    expect("choices" in findBook(books, null, strategies, alias)).toBe(true);
    expect("choices" in findBook(books, "momentum scalper", strategies, alias)).toBe(true);
    const tie = findBook(groupBooks([row({ id: "x", rule_id: "r1" }), row({ id: "y", rule_id: "r9", rule_name: "Volume Anchor Trend" })], [rules[0], { ...rules[0], id: "r9" }], [], strategies), "Volume Anchor Trend", strategies, alias);
    expect("choices" in tie && tie.choices).toHaveLength(2);
  });
});

describe("toReviewTrade", () => {
  it("reads numbers stored as text, and the partial closes in order", () => {
    const trade = toReviewTrade(
      row({
        size: "0.05",
        entry_price: "100",
        original_size: null,
        partial_closes: [
          { at: "2026-10-01T02:00:00.000Z", size: 0.03, price: 103, pnlUsd: 0.08, reason: "closed_by_hand" },
          { at: "2026-10-01T01:00:00.000Z", size: 0.02, price: 102, pnlUsd: 0.04, reason: "closed_by_hand" },
        ],
      }),
      null,
    );
    expect(trade.originalSize).toBeCloseTo(0.1);
    expect(trade.partials.map((partial) => partial.size)).toEqual([0.02, 0.03]);
    expect(trade.closedAt).toBe(Date.parse("2026-10-01T03:00:00.000Z"));
  });

  it("takes the rule's leverage for rows from before leverage was stored, else 1x", () => {
    expect(toReviewTrade(row({ leverage: null }), 3).leverage).toBe(3);
    expect(toReviewTrade(row({ leverage: null }), null).leverage).toBe(1);
  });

  it("leaves an open trade without a close", () => {
    expect(toReviewTrade(row({ status: "open", closed_at: null }), null).closedAt).toBeNull();
  });
});

describe("bookLine", () => {
  it("says what is in a book", () => {
    expect(bookLine(books.find((entry) => entry.key === "rule:r1")!)).toEqual({ name: "Volume Anchor Trend", kind: "rule", strategy: "Session VWAP — reclaim", closed: 2, open: 0, coins: ["BTC"] });
  });
});
