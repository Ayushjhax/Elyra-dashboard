import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/backtest/intervals";
import { DEFAULT_SETTINGS, PAPER_COSTS, closedBars, decide, exitPrices, mirrorCandles, netPnl, paperExit, paperFill, validateRule, type AccountState } from "@/lib/autotrade/rules";

const STRATEGIES = [{ id: "rsi", parameters: [{ key: "period", min: 2, max: 50, default: 14 }] }];
const GOOD = { name: "BTC dip", coin: "btc", interval: "1h", strategyId: "rsi", params: {}, sizeUsd: 100, leverage: 2, takeProfitPct: 3, stopLossPct: 1.5 };

function bar(openTime: number, low: number, high: number): Candle {
  return { instrumentId: "BTC", venue: "binance", interval: "1h", openTime, closeTime: openTime + 3_599_999, open: low, high, low, close: high } as Candle;
}

const ACCOUNT: AccountState = { ...DEFAULT_SETTINGS, realisedTodayUsd: 0, openPositions: 0 };
const ENTER = { enterLong: true, exitLong: false, reason: "RSI crossed 30" };
const QUIET = { enterLong: false, exitLong: false, reason: null };

describe("validateRule", () => {
  it("accepts a rule inside every limit, defaults its parameters, and starts in paper mode", () => {
    const result = validateRule(GOOD, STRATEGIES);
    expect(result).toMatchObject({ rule: { side: "long", coin: "BTC", params: { period: 14 }, mode: "paper", enabled: true } });
    expect(validateRule({ ...GOOD, side: "short" }, STRATEGIES)).toMatchObject({ rule: { side: "short" } });
    expect(validateRule({ ...GOOD, side: "sideways" }, STRATEGIES)).toMatchObject({ error: expect.stringMatching(/long or short/) });
  });

  it("refuses what the limits do not allow, saying which limit", () => {
    expect(validateRule({ ...GOOD, coin: "PEPE" }, STRATEGIES)).toMatchObject({ error: expect.stringMatching(/Choose one of/) });
    expect(validateRule({ ...GOOD, leverage: 20 }, STRATEGIES)).toMatchObject({ error: expect.stringMatching(/Leverage/) });
    expect(validateRule({ ...GOOD, sizeUsd: 5 }, STRATEGIES)).toMatchObject({ error: expect.stringMatching(/Size/) });
    expect(validateRule({ ...GOOD, stopLossPct: 0 }, STRATEGIES)).toMatchObject({ error: expect.stringMatching(/Stop-loss/) });
    expect(validateRule({ ...GOOD, strategyId: "nope" }, STRATEGIES)).toMatchObject({ error: expect.stringMatching(/strategy/) });
    expect(validateRule({ ...GOOD, params: { period: 500 } }, STRATEGIES)).toMatchObject({ error: expect.stringMatching(/period/) });
  });

  it("refuses a stop the position would be liquidated before reaching", () => {
    expect(validateRule({ ...GOOD, leverage: 5, stopLossPct: 20 }, STRATEGIES)).toMatchObject({ error: expect.stringMatching(/liquidated/) });
  });
});

describe("decide", () => {
  const bars = [bar(0, 100, 101), bar(3_600_000, 99, 100)];
  const rule = { enabled: true, lastSignalAt: null };

  it("enters on the last closed bar's entry signal, and names the bar", () => {
    const decision = decide({ rule, bars, signals: [QUIET, ENTER], open: null, account: ACCOUNT });
    expect(decision).toEqual({ kind: "enter", barCloseAt: new Date(7_199_999).toISOString(), reason: "RSI crossed 30" });
  });

  it("never acts on an older bar's signal, or on the same bar twice", () => {
    expect(decide({ rule, bars, signals: [ENTER, QUIET], open: null, account: ACCOUNT }).kind).toBe("hold");
    const once = { enabled: true, lastSignalAt: new Date(7_199_999).toISOString() };
    expect(decide({ rule: once, bars, signals: [QUIET, ENTER], open: null, account: ACCOUNT }).kind).toBe("hold");
  });

  it("holds every new entry while paused, past the day's loss limit, or at the position cap", () => {
    const signals = [QUIET, ENTER];
    expect(decide({ rule, bars, signals, open: null, account: { ...ACCOUNT, paused: true } }).reason).toMatch(/paused/);
    expect(decide({ rule, bars, signals, open: null, account: { ...ACCOUNT, realisedTodayUsd: -100 } }).reason).toMatch(/loss limit/);
    expect(decide({ rule, bars, signals, open: null, account: { ...ACCOUNT, openPositions: 3 } }).reason).toMatch(/most allowed/);
  });

  it("exits an open position on the strategy's exit, and otherwise leaves it to TP and SL", () => {
    const open = { side: "long" as const, entryPrice: 100, takeProfit: 103, stopLoss: 98.5, openedAt: 0 };
    expect(decide({ rule, bars, signals: [QUIET, { enterLong: false, exitLong: true, reason: "RSI above 70" }], open, account: ACCOUNT }).kind).toBe("exit");
    expect(decide({ rule, bars, signals: [QUIET, ENTER], open, account: ACCOUNT }).kind).toBe("hold");
  });

  it("does nothing for a rule that is off", () => {
    expect(decide({ rule: { enabled: false, lastSignalAt: null }, bars, signals: [QUIET, ENTER], open: null, account: ACCOUNT }).kind).toBe("hold");
  });
});

describe("prices and paper fills", () => {
  it("sets take-profit above and stop-loss below a long, and the reverse for a short", () => {
    const long = exitPrices("long", 100, 3, 1.5);
    expect(long.takeProfit).toBeCloseTo(103);
    expect(long.stopLoss).toBeCloseTo(98.5);
    const short = exitPrices("short", 100, 3, 1.5);
    expect(short.takeProfit).toBeCloseTo(97);
    expect(short.stopLoss).toBeCloseTo(101.5);
  });

  it("mirrors the chart for a short: the latest close holds, rises become falls, high and low swap", () => {
    const [first, last] = mirrorCandles([{ ...bar(0, 90, 110), open: 100, close: 100 }, { ...bar(3_600_000, 95, 105), close: 100 }]);
    expect(last.close).toBeCloseTo(100);
    expect(first.high).toBeCloseTo(10_000 / 90);
    expect(first.low).toBeCloseTo(10_000 / 110);
    expect(first.high).toBeGreaterThan(first.low);
  });

  it("charges paper trades slippage against the trader and the taker fee on both legs", () => {
    expect(paperFill("long", "entry", 100)).toBeCloseTo(100 * (1 + PAPER_COSTS.slippagePct / 100));
    expect(paperFill("long", "exit", 100)).toBeCloseTo(100 * (1 - PAPER_COSTS.slippagePct / 100));
    expect(paperFill("short", "entry", 100)).toBeCloseTo(100 * (1 - PAPER_COSTS.slippagePct / 100));
    expect(paperFill("short", "exit", 100)).toBeCloseTo(100 * (1 + PAPER_COSTS.slippagePct / 100));
    const fees = (1 * (100 + 110) * PAPER_COSTS.takerFeePct) / 100;
    expect(netPnl("long", 1, 100, 110)).toBeCloseTo(10 - fees);
    expect(netPnl("short", 1, 110, 100)).toBeCloseTo(10 - fees);
  });

  it("drops the bar still forming", () => {
    expect(closedBars([bar(0, 1, 2), bar(3_600_000, 1, 2)], 3_700_000)).toHaveLength(1);
  });

  it("fills paper take-profits and stops from later bars, assuming the stop when one bar touches both", () => {
    const open = { side: "long" as const, entryPrice: 100, takeProfit: 103, stopLoss: 98.5, openedAt: 3_600_000 };
    expect(paperExit(open, [bar(3_600_000, 99, 103.5)])).toEqual({ price: 103, reason: "take_profit" });
    expect(paperExit(open, [bar(3_600_000, 98, 104)])).toEqual({ price: 98.5, reason: "stop_loss" });
    expect(paperExit(open, [bar(0, 90, 110), bar(3_600_000, 99, 102)])).toBeNull();
    const short = { side: "short" as const, entryPrice: 100, takeProfit: 97, stopLoss: 101.5, openedAt: 3_600_000 };
    expect(paperExit(short, [bar(3_600_000, 96.5, 100.5)])).toEqual({ price: 97, reason: "take_profit" });
    expect(paperExit(short, [bar(3_600_000, 96, 102)])).toEqual({ price: 101.5, reason: "stop_loss" });
  });
});
