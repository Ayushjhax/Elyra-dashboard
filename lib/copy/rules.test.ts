import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LIMITS, PAPER_COSTS, marketFor, netPnl, paperFill } from "@/lib/autotrade/rules";
import type { Candle } from "@/lib/backtest/intervals";
import { getStrategy } from "@/lib/backtest/strategies";
import { HOUSE_DID, HOUSE_SETS, HOUSE_USER_ID } from "@/lib/copy/house";
import { COPY_LIMITS, COPY_PRESETS, copyOrderFor, driftPct, recordOf, returnOnMargin, simulateRule, validateFollow, validateSet, type LeaderEntry } from "@/lib/copy/rules";
import { zhCN } from "@/lib/i18n/messages/zh-CN";

const TERMS = { sizeUsd: 100, maxLeverage: 3, mode: "paper" as const, maxDriftPct: 1 };
const LONG: LeaderEntry = { coin: "BTC", side: "long", entryPrice: 100, takeProfit: 106, stopLoss: 97, leverage: 2 };
const SHORT: LeaderEntry = { coin: "ETH", side: "short", entryPrice: 100, takeProfit: 95, stopLoss: 103, leverage: 5 };

describe("validateFollow", () => {
  it("accepts terms inside the limits, paper unless asked", () => {
    expect(validateFollow({ sizeUsd: 100, maxLeverage: 2 })).toEqual({ terms: { sizeUsd: 100, maxLeverage: 2, mode: "paper", maxDriftPct: COPY_LIMITS.defaultDriftPct } });
    expect(validateFollow({ sizeUsd: 50, maxLeverage: 1, mode: "live", maxDriftPct: 0.5 })).toMatchObject({ terms: { mode: "live", maxDriftPct: 0.5 } });
  });

  it("refuses what the limits do not allow, saying which", () => {
    expect(validateFollow({ sizeUsd: 5, maxLeverage: 2 })).toMatchObject({ error: expect.stringMatching(/Size per trade/) });
    expect(validateFollow({ sizeUsd: 100, maxLeverage: 9 })).toMatchObject({ error: expect.stringMatching(/Leverage/) });
    expect(validateFollow({ sizeUsd: 100, maxLeverage: 1.5 })).toMatchObject({ error: expect.stringMatching(/whole number/) });
    expect(validateFollow({ sizeUsd: 100, maxLeverage: 2, mode: "yolo" })).toMatchObject({ error: expect.stringMatching(/paper or live/) });
    expect(validateFollow({ sizeUsd: 100, maxLeverage: 2, maxDriftPct: 10 })).toMatchObject({ error: expect.stringMatching(/allowance/) });
  });

  it("fills what a change leaves out from the copy as it was", () => {
    const base = { sizeUsd: 250, maxLeverage: 3, mode: "live" as const, maxDriftPct: 1.5 };
    expect(validateFollow({ sizeUsd: 40 }, base)).toEqual({ terms: { ...base, sizeUsd: 40 } });
  });

  it("offers presets that pass its own checks", () => {
    for (const preset of COPY_PRESETS) expect(validateFollow(preset)).toHaveProperty("terms");
  });
});

describe("validateSet", () => {
  const ID = "11111111-1111-4111-8111-111111111111";

  it("tidies the name and keeps a private set private", () => {
    expect(validateSet({ name: "  Majors   4h ", ruleIds: [ID] })).toEqual({ set: { name: "Majors 4h", description: "", ruleIds: [ID], published: false } });
  });

  it("refuses a bad name, a foreign id, a repeat, and sharing an empty set", () => {
    expect(validateSet({ name: "x" })).toMatchObject({ error: expect.stringMatching(/name/) });
    expect(validateSet({ name: "Fine", ruleIds: ["not-a-uuid"] })).toMatchObject({ error: expect.stringMatching(/your own/) });
    expect(validateSet({ name: "Fine", ruleIds: [ID, ID] })).toMatchObject({ error: expect.stringMatching(/twice/) });
    expect(validateSet({ name: "Fine", ruleIds: [], published: true })).toMatchObject({ error: expect.stringMatching(/at least one rule/) });
    expect(validateSet({ name: "Fine", description: "d".repeat(COPY_LIMITS.descriptionMax + 1) })).toMatchObject({ error: expect.stringMatching(/description/) });
  });
});

describe("copyOrderFor", () => {
  it("keeps the leader's exits as prices, measured from the mid now", () => {
    const result = copyOrderFor(LONG, TERMS, 100.5);
    expect(result).toMatchObject({ order: { coin: "BTC", side: "long", sizeUsd: 100, leverage: 2, mode: "paper" } });
    if (!("order" in result)) throw new Error("expected an order");
    /* 106 is 5.47% above 100.5; 97 is 3.48% below it. */
    expect(result.order.takeProfitPct).toBe(5.47);
    expect(result.order.stopLossPct).toBe(3.48);
    expect(result.driftPct).toBeCloseTo(0.5, 6);
  });

  it("does the same the other way round for a short, and caps leverage at the follower's", () => {
    const result = copyOrderFor(SHORT, TERMS, 99.5);
    expect(result).toMatchObject({ order: { side: "short", leverage: 3 } });
    if (!("order" in result)) throw new Error("expected an order");
    expect(result.order.takeProfitPct).toBe(4.52);
    expect(result.order.stopLossPct).toBe(3.52);
    /* A short sold lower than the leader sold at got a worse price: a positive drift. */
    expect(result.driftPct).toBeCloseTo(0.5, 6);
  });

  it("skips once the price has run past the allowance, or past either exit", () => {
    expect(copyOrderFor(LONG, TERMS, 101.5)).toMatchObject({ skip: expect.stringMatching(/moved 1.50%/) });
    expect(copyOrderFor(LONG, { ...TERMS, maxDriftPct: 3 }, 97)).toMatchObject({ skip: expect.stringMatching(/stop-loss/) });
    expect(copyOrderFor({ ...LONG, takeProfit: 101 }, { ...TERMS, maxDriftPct: 3 }, 101.2)).toMatchObject({ skip: expect.stringMatching(/take-profit/) });
    expect(copyOrderFor({ ...LONG, takeProfit: 100.6 }, TERMS, 100.5)).toMatchObject({ skip: expect.stringMatching(/Too close/) });
  });

  it("copies a better price however far it is from the leader's", () => {
    expect(copyOrderFor(LONG, TERMS, 98)).toHaveProperty("order");
  });

  it("lifts a stop closer than the smallest allowed to that minimum, and refuses one liquidation would beat", () => {
    const tight = copyOrderFor({ ...LONG, stopLoss: 99.9 }, TERMS, 100);
    if (!("order" in tight)) throw new Error("expected an order");
    expect(tight.order.stopLossPct).toBe(LIMITS.minStopLossPct);
    expect(copyOrderFor({ ...LONG, stopLoss: 70, leverage: 5 }, { ...TERMS, maxLeverage: 5 }, 100)).toMatchObject({ skip: expect.stringMatching(/liquidated/) });
  });

  it("measures drift against the follower: up is worse for a long, down for a short", () => {
    expect(driftPct(LONG, 102)).toBeCloseTo(2, 6);
    expect(driftPct(SHORT, 98)).toBeCloseTo(2, 6);
  });
});

describe("records", () => {
  it("is in returns on margin, summed without compounding, oldest first", () => {
    const record = recordOf([
      { realisedPnlUsd: -5, marginUsd: 50, closedAt: 3 },
      { realisedPnlUsd: 10, marginUsd: 50, closedAt: 1 },
      { realisedPnlUsd: 4, marginUsd: 100, closedAt: 2 },
    ]);
    expect(record).toEqual({
      trades: 3,
      wins: 2,
      totalReturnPct: 14,
      avgReturnPct: 4.67,
      bestReturnPct: 20,
      worstReturnPct: -10,
      curve: [20, 24, 14],
      lastClosedAt: 3,
    });
  });

  it("is empty, not zero, with no trades, and leaves out a trade with no margin", () => {
    expect(recordOf([])).toMatchObject({ trades: 0, avgReturnPct: null, bestReturnPct: null, curve: [], lastClosedAt: null });
    expect(returnOnMargin({ realisedPnlUsd: 5, marginUsd: 0 })).toBeNull();
    expect(recordOf([{ realisedPnlUsd: 5, marginUsd: 0, closedAt: 1 }]).trades).toBe(0);
  });
});

describe("simulateRule", () => {
  const HOUR = 3_600_000;
  const bars = (prices: [number, number, number][]): Candle[] =>
    prices.map(([low, high, close], index) => ({ instrumentId: "BTC", venue: "hyperliquid", interval: "1h", openTime: index * HOUR, closeTime: (index + 1) * HOUR - 1, open: close, high, low, close, volume: 1, complete: true, source: "hyperliquid" }));
  const RULE = { side: "long" as const, sizeUsd: 100, leverage: 2, takeProfitPct: 5, stopLossPct: 2 };
  const quiet = { enterLong: false, exitLong: false };
  const enter = { enterLong: true, exitLong: false };
  const exit = { enterLong: false, exitLong: true };

  it("enters at a bar's close and exits at the target on a later bar, paying the costs a paper trade pays", () => {
    const trades = simulateRule(bars([[99, 101, 100], [99.5, 106, 105], [104, 106, 105]]), [enter, quiet, quiet], RULE);
    expect(trades).toHaveLength(1);
    const entry = paperFill("long", "entry", 100);
    const target = entry * 1.05;
    expect(trades[0]).toMatchObject({ reason: "take_profit", entryPrice: entry, marginUsd: 50 });
    expect(trades[0].exitPrice).toBeCloseTo(paperFill("long", "exit", target), 9);
    expect(trades[0].realisedPnlUsd).toBeCloseTo(netPnl("long", 100 / entry, entry, paperFill("long", "exit", target)), 9);
    expect(PAPER_COSTS.takerFeePct).toBeGreaterThan(0);
  });

  it("takes the stop first when one bar touches both", () => {
    const trades = simulateRule(bars([[99, 101, 100], [90, 110, 100]]), [enter, quiet], RULE);
    expect(trades[0].reason).toBe("stop_loss");
  });

  it("exits at the close on the strategy's exit signal, and drops a trade still open at the end", () => {
    expect(simulateRule(bars([[99, 101, 100], [100, 102, 101.5]]), [enter, exit], RULE)[0]).toMatchObject({ reason: "exit_rule" });
    expect(simulateRule(bars([[99, 101, 100], [99.5, 101, 100.5]]), [enter, quiet], RULE)).toEqual([]);
  });

  it("trades nothing when the signals do not line up with the bars", () => {
    expect(simulateRule(bars([[99, 101, 100]]), [], RULE)).toEqual([]);
  });
});

describe("Elyra's own sets", () => {
  const rules = HOUSE_SETS.flatMap((set) => set.rules);

  it("run only strategies and markets Automation has, inside its limits", () => {
    for (const rule of rules) {
      expect(getStrategy(rule.strategyId), rule.name).not.toBeNull();
      expect(marketFor(rule.coin)?.coin, rule.name).toBe(rule.coin);
      expect(rule.sizeUsd).toBeGreaterThanOrEqual(LIMITS.minSizeUsd);
      expect(rule.leverage).toBeLessThanOrEqual(LIMITS.maxLeverage);
      expect(rule.takeProfitPct).toBeGreaterThanOrEqual(LIMITS.minTakeProfitPct);
      expect(rule.stopLossPct).toBeGreaterThanOrEqual(LIMITS.minStopLossPct);
      expect(rule.stopLossPct * rule.leverage).toBeLessThan(80);
    }
  });

  it("can all hold a position at once under the five-position limit, and have fixed, distinct ids", () => {
    expect(rules.length).toBeLessThanOrEqual(LIMITS.maxOpenPositions);
    const ids = [HOUSE_USER_ID, ...HOUSE_SETS.map((set) => set.id), ...rules.map((rule) => rule.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("are owned by an account no Privy session can resolve to", () => {
    expect(HOUSE_DID.startsWith("did:privy:")).toBe(false);
  });

  it("have Chinese for every name and description the page shows", () => {
    for (const set of HOUSE_SETS) {
      expect(zhCN[set.name], set.name).toBeDefined();
      expect(zhCN[set.description], set.description).toBeDefined();
    }
    for (const preset of COPY_PRESETS) expect(zhCN[preset.label], preset.label).toBeDefined();
  });

  it("fit the database's own checks on a set", () => {
    const migration = readFileSync(resolve(__dirname, "../../supabase/migrations/0029_copy_trading.sql"), "utf8");
    expect(migration).toMatch(/char_length\(name\) between 2 and 40/);
    for (const set of HOUSE_SETS) {
      expect(set.name.length).toBeLessThanOrEqual(COPY_LIMITS.nameMax);
      expect(set.description.length).toBeLessThanOrEqual(COPY_LIMITS.descriptionMax);
    }
  });
});
