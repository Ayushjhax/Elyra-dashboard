import { describe, expect, it } from "vitest";
import { analyseHistory, closedPaperTrades, filterChoices, filterTrades, heldMinutes, NO_FILTERS, outcomeOf, paperCosts } from "@/lib/autotrade/history";
import type { TradeView } from "@/lib/autotrade/types";

const trade = (overrides: Partial<TradeView>): TradeView => ({
  id: "t",
  ruleId: null,
  ruleName: "Market order",
  mode: "paper",
  network: null,
  side: "long",
  coin: "SOL",
  size: 0.7,
  entryPrice: 142,
  takeProfit: 147.68,
  stopLoss: 139.16,
  status: "closed",
  entryReason: null,
  exitPrice: 141.9,
  exitReason: "closed_by_hand",
  realisedPnlUsd: -0.19,
  error: null,
  openedAt: "2026-11-27T09:15:00Z",
  closedAt: "2026-11-27T09:40:00Z",
  leverage: 2,
  ...overrides,
});

/* The account's own three SOL paper trades, as the drawer first showed them. */
const sol = [
  trade({ id: "a", realisedPnlUsd: -0.19 }),
  trade({ id: "b", realisedPnlUsd: -2.14, exitReason: "stop_loss", openedAt: "2026-11-27T17:05:00Z", closedAt: "2026-11-27T18:10:00Z" }),
  trade({ id: "c", side: "short", realisedPnlUsd: -0.17, openedAt: "2026-11-27T18:40:00Z", closedAt: "2026-11-27T19:02:00Z" }),
];

describe("the analysis reads the history's own trades", () => {
  it("adds the three SOL losses to -$2.50 at a 0% win rate", () => {
    const analysis = analyseHistory(sol, []);
    expect(analysis).not.toBeNull();
    const { overall } = analysis!;
    expect(overall.trades).toBe(3);
    expect(overall.winRate).toBe(0);
    expect(overall.netPnlUsd).toBeCloseTo(-2.5, 10);
    expect(overall.profitFactor).toBe(0);
    expect(overall.avgWinUsd).toBeNull();
    expect(overall.avgLossUsd).toBeCloseTo(-2.5 / 3, 10);
    expect(analysis!.smallSample).toBe(true);
  });

  it("splits them by leverage, side, UTC entry window, exit and market", () => {
    const analysis = analyseHistory(sol, [])!;
    const pick = (groups: { key: string; trades: number; netPnlUsd: number }[]) =>
      Object.fromEntries(groups.map((group) => [group.key, [group.trades, Math.round(group.netPnlUsd * 100) / 100]]));
    expect(pick(analysis.byLeverage)).toEqual({ "2x": [3, -2.5] });
    expect(pick(analysis.bySide)).toEqual({ long: [2, -2.33], short: [1, -0.17] });
    expect(pick(analysis.byWindow)).toEqual({ "08": [1, -0.19], "16": [2, -2.31] });
    expect(pick(analysis.byExit)).toEqual({ closed_by_hand: [2, -0.36], stop_loss: [1, -2.14] });
    expect(pick(analysis.byCoin)).toEqual({ SOL: [3, -2.5] });
  });

  it("follows the history's filters, so the two never disagree", () => {
    const filtered = filterTrades(sol, { ...NO_FILTERS, outcome: "stop_loss" });
    expect(filtered.map((entry) => entry.id)).toEqual(["b"]);
    expect(analyseHistory(filtered, [])!.overall.netPnlUsd).toBeCloseTo(-2.14, 10);
  });

  it("counts closed paper trades only, and takes a rule's leverage where the trade has none", () => {
    const mixed = [
      ...sol,
      trade({ id: "live", mode: "live", realisedPnlUsd: 50 }),
      trade({ id: "open", status: "open", exitPrice: null, exitReason: null, realisedPnlUsd: null, closedAt: null }),
      trade({ id: "old", ruleId: "r1", leverage: null, realisedPnlUsd: 1 }),
    ];
    const closed = closedPaperTrades(mixed, [{ id: "r1", leverage: 4 }]);
    expect(closed).toHaveLength(4);
    expect(closed.at(-1)?.leverage).toBe(4);
    expect(analyseHistory(mixed.filter((entry) => entry.mode === "live"), [])).toBeNull();
  });

  it("offers only filter values that match something", () => {
    const choices = filterChoices([...sol, trade({ id: "o", coin: "BTC", status: "open", exitReason: null, exitPrice: null, realisedPnlUsd: null, closedAt: null })]);
    expect(choices.coins).toEqual(["BTC", "SOL"]);
    expect(choices.outcomes).toEqual(["closed_by_hand", "stop_loss", "open"]);
    expect(choices.modes).toEqual(["paper"]);
    expect(outcomeOf(trade({ status: "failed" }))).toBe("failed");
  });
});

describe("modeled paper costs", () => {
  it("restates the taker fee on each fill and the slippage each fill paid", () => {
    /* A long sent at a $100 mid fills at $100.05; it exits at a $100 mid, filled at $99.95. */
    const costs = paperCosts(trade({ size: 1, originalSize: 1, entryPrice: 100.05, expectedPrice: 100, exitPrice: 99.95 }));
    expect(costs!.feesUsd).toBeCloseTo((100.05 + 99.95) * 0.00045, 10);
    expect(costs!.slippageUsd).toBeCloseTo(0.1, 10);
    expect(costs!.totalUsd).toBeCloseTo(0.09 + 0.1, 10);
  });

  it("counts partial closes and an open trade's entry, and models nothing for live", () => {
    const open = trade({
      status: "open",
      size: 0.5,
      originalSize: 1,
      entryPrice: 100,
      expectedPrice: 100,
      exitPrice: null,
      closedAt: null,
      partialCloses: [{ at: "2026-11-27T10:00:00Z", size: 0.5, price: 110, pnlUsd: 4.9, reason: "closed_by_hand" }],
    });
    expect(paperCosts(open)!.feesUsd).toBeCloseTo((100 + 0.5 * 110) * 0.00045, 10);
    expect(paperCosts(trade({ mode: "live" }))).toBeNull();
  });

  it("measures how long a trade was held", () => {
    expect(heldMinutes(sol[1], null)).toBe(65);
    expect(heldMinutes({ openedAt: "2026-11-27T09:00:00Z", closedAt: null }, Date.parse("2026-11-27T10:30:00Z"))).toBe(90);
  });
});
