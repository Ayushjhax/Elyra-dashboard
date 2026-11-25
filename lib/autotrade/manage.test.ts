import { describe, expect, it } from "vitest";
import { handoffFor, handoffHref, readHandoff } from "@/lib/autotrade/handoff";
import { afterPartial, slippageBps, validateExits, validateFraction } from "@/lib/autotrade/manage";
import { LIMITS, netPnl } from "@/lib/autotrade/rules";

describe("validateFraction", () => {
  it("takes the four parts and defaults to all", () => {
    expect(validateFraction("0.25")).toEqual({ fraction: 0.25 });
    expect(validateFraction(0.5)).toEqual({ fraction: 0.5 });
    expect(validateFraction("0.75")).toEqual({ fraction: 0.75 });
    expect(validateFraction(undefined)).toEqual({ fraction: 1 });
    expect(validateFraction("")).toEqual({ fraction: 1 });
  });

  it("refuses any other part", () => {
    for (const value of ["0.3", 0, -1, 2, "half", Number.NaN]) expect(validateFraction(value)).toHaveProperty("error");
  });
});

describe("afterPartial", () => {
  const long = { side: "long" as const, size: 1, entryPrice: 100, exitPrice: 110, realisedSoFar: 0 };

  it("closes the part asked and keeps the rest, net of fees", () => {
    const outcome = afterPartial({ ...long, fraction: 0.5 });
    expect(outcome.full).toBe(false);
    expect(outcome.closed).toBeCloseTo(0.5);
    expect(outcome.remaining).toBeCloseTo(0.5);
    expect(outcome.pnlUsd).toBeCloseTo(netPnl("long", 0.5, 100, 110));
    expect(outcome.realised).toBeCloseTo(outcome.pnlUsd);
  });

  it("adds to what earlier parts realised", () => {
    const first = afterPartial({ ...long, fraction: 0.5 });
    const second = afterPartial({ ...long, size: first.remaining, fraction: 0.5, realisedSoFar: first.realised });
    expect(second.realised).toBeCloseTo(first.realised + second.pnlUsd);
  });

  it("uses the size the exchange filled, never more than is open", () => {
    expect(afterPartial({ ...long, fraction: 0.5, filledSize: 0.4 }).closed).toBeCloseTo(0.4);
    expect(afterPartial({ ...long, fraction: 0.5, filledSize: 0.4 }).remaining).toBeCloseTo(0.6);
    expect(afterPartial({ ...long, fraction: 0.5, filledSize: 5 }).closed).toBe(1);
  });

  it("is full when all of it closes", () => {
    expect(afterPartial({ ...long, fraction: 1 })).toMatchObject({ full: true, remaining: 0 });
    expect(afterPartial({ ...long, fraction: 0.5, filledSize: 1 })).toMatchObject({ full: true, remaining: 0 });
  });

  it("keeps a small remainder the exchange still holds on the books", () => {
    /* $3 left is below the smallest order, but it is still open: closeTrade
       decides dust before sending, so a remainder after the fill is real. */
    const outcome = afterPartial({ side: "long", size: 0.12, entryPrice: 100, exitPrice: 100, fraction: 0.75, realisedSoFar: 0 });
    expect(outcome.full).toBe(false);
    expect(outcome.remaining * 100).toBeLessThan(LIMITS.minSizeUsd);
  });

  it("counts a short's gain when the price falls", () => {
    expect(afterPartial({ side: "short", size: 2, entryPrice: 100, exitPrice: 90, fraction: 0.5, realisedSoFar: 0 }).pnlUsd).toBeGreaterThan(9);
  });
});

describe("validateExits", () => {
  const long = { side: "long" as const, entryPrice: 100 };
  const short = { side: "short" as const, entryPrice: 100 };

  it("takes a long's exits on either side of the price", () => {
    expect(validateExits({ takeProfit: 110, stopLoss: 95 }, long, 102)).toEqual({ exits: { takeProfit: 110, stopLoss: 95 } });
  });

  it("allows a stop moved into profit", () => {
    expect(validateExits({ takeProfit: 120, stopLoss: 104 }, long, 108)).toHaveProperty("exits");
    expect(validateExits({ takeProfit: 80, stopLoss: 96 }, short, 92)).toHaveProperty("exits");
  });

  it("refuses an exit already passed — that is a close", () => {
    expect(validateExits({ takeProfit: 101, stopLoss: 95 }, long, 102)).toHaveProperty("error");
    expect(validateExits({ takeProfit: 110, stopLoss: 103 }, long, 102)).toHaveProperty("error");
    expect(validateExits({ takeProfit: 99, stopLoss: 105 }, short, 98)).toHaveProperty("error");
    expect(validateExits({ takeProfit: 90, stopLoss: 97 }, short, 98)).toHaveProperty("error");
  });

  it("holds both to the limits every entry is held to, from the entry", () => {
    const tooFar = 100 * (1 + (LIMITS.maxTakeProfitPct + 1) / 100);
    expect(validateExits({ takeProfit: tooFar, stopLoss: 95 }, long, 100.5)).toHaveProperty("error");
    const tooLoose = 100 * (1 - (LIMITS.maxStopLossPct + 1) / 100);
    expect(validateExits({ takeProfit: 110, stopLoss: tooLoose }, long, 100.5)).toHaveProperty("error");
    const shortTooLoose = 100 * (1 + (LIMITS.maxStopLossPct + 1) / 100);
    expect(validateExits({ takeProfit: 90, stopLoss: shortTooLoose }, short, 99.5)).toHaveProperty("error");
  });

  it("refuses a missing or non-positive price", () => {
    expect(validateExits({ takeProfit: 110 }, long, 100)).toHaveProperty("error");
    expect(validateExits({ takeProfit: 0, stopLoss: 95 }, long, 100)).toHaveProperty("error");
    expect(validateExits({ takeProfit: "x", stopLoss: 95 }, long, 100)).toHaveProperty("error");
  });
});

describe("slippageBps", () => {
  it("is positive when the fill was worse", () => {
    expect(slippageBps("long", 100, 100.1)).toBe(10);
    expect(slippageBps("short", 100, 99.9)).toBe(10);
  });

  it("is negative when it was better", () => {
    expect(slippageBps("long", 100, 99.95)).toBe(-5);
  });

  it("is null without an expected price", () => {
    expect(slippageBps("long", null, 100)).toBeNull();
    expect(slippageBps("long", 0, 100)).toBeNull();
  });
});

describe("backtest handoff", () => {
  it("offers a rule for a perp market on a rule timeframe", () => {
    const handoff = handoffFor({ strategyId: "RSI_12_MEAN_REVERSION_V1", symbol: "sol", timeframe: "1h", params: { period: 12 } });
    expect(handoff).toEqual({ strategyId: "RSI_12_MEAN_REVERSION_V1", coin: "SOL", interval: "1h", params: { period: 12 } });
  });

  it("offers nothing a rule cannot run", () => {
    expect(handoffFor({ strategyId: "RSI_12_MEAN_REVERSION_V1", symbol: "NOT_A_MARKET", timeframe: "1h" })).toBeNull();
    expect(handoffFor({ strategyId: "RSI_12_MEAN_REVERSION_V1", symbol: "SOL", timeframe: "5m" })).toBeNull();
    expect(handoffFor({ strategyId: "rsi; drop", symbol: "SOL", timeframe: "1h" })).toBeNull();
  });

  it("round-trips through the link", () => {
    const handoff = handoffFor({ strategyId: "MACD_CROSS_V1", symbol: "BTC", timeframe: "4h", params: { fast: 12, slow: 26 } });
    expect(handoff).not.toBeNull();
    const query = Object.fromEntries(new URL(handoffHref(handoff!), "https://example.test").searchParams);
    expect(readHandoff(query)).toEqual(handoff);
  });

  it("drops parameters that are not numbers or not plain names", () => {
    const read = readHandoff({ strategy: "MACD_CROSS_V1", coin: "BTC", interval: "4h", "p.fast": "12", "p.slow": "x", "p.__proto__": "1" });
    expect(read?.params).toEqual({ fast: 12 });
  });

  it("reads nothing from a query without one", () => {
    expect(readHandoff({})).toBeNull();
    expect(readHandoff({ strategy: "MACD_CROSS_V1", coin: ["BTC", "ETH"], interval: "4h" })).toBeNull();
  });
});
