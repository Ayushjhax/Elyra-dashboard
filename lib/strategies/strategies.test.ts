import { describe, expect, it, vi } from "vitest";
import type { Candle } from "@/lib/backtest/intervals";

/* ---------------------------------------------------------------------------
   Designed strategies: the vocabulary and its limits, the interpreter's
   no-lookahead signals, the engine's stops, targets and time limits, the
   library, and what code does to an AI's proposals before anyone sees them.
--------------------------------------------------------------------------- */

vi.mock("server-only", () => ({}));

const { runBacktest } = await import("@/lib/backtest/engine");
const { designId, designStrategy } = await import("@/lib/strategies/interpret");
const { LIBRARY } = await import("@/lib/strategies/library");
const { describeDesign, validateDesign } = await import("@/lib/strategies/spec");
const { proposalsIn, vetProposal } = await import("@/lib/strategies/generate");

const HOUR = 3_600_000;
function candles(rows: Array<[open: number, high: number, low: number, close: number]>): Candle[] {
  return rows.map(([open, high, low, close], index) => ({
    instrumentId: "TEST",
    venue: "test",
    interval: "1h",
    openTime: index * HOUR,
    closeTime: (index + 1) * HOUR - 1,
    open,
    high,
    low,
    close,
    volume: 100,
    complete: true,
    source: "test",
  }));
}
const flat = (price: number, count: number): Array<[number, number, number, number]> => Array.from({ length: count }, () => [price, price, price, price]);

const base = {
  version: 1,
  name: "Test",
  summary: "",
  timeframe: "1h",
  entry: { match: "all", conditions: [{ left: { kind: "price", field: "close" }, op: "crosses_above", right: { kind: "number", value: 100 } }] },
  exit: null,
  risk: { stopLossPct: 5, takeProfitPct: null, maxBarsHeld: null },
};

const config = (risk: Record<string, number | null>) => ({
  instrumentId: "TEST",
  venue: "test",
  timeframe: "1h",
  startAt: "1970-01-01T00:00:00.000Z",
  endAt: "1970-01-02T00:00:00.000Z",
  initialCapitalUsd: 10_000,
  strategyId: "DESIGN",
  params: {},
  direction: "long_only" as const,
  positionFraction: 1,
  execution: { signalTiming: "bar_close" as const, entryExecution: "next_bar_open" as const, exitExecution: "next_bar_open" as const, feeBps: 0, slippageBps: 0 },
  risk,
});

describe("the vocabulary", () => {
  it("accepts a well-formed design and normalises it", () => {
    const checked = validateDesign({ ...base, name: "  Breakout  ", risk: { stopLossPct: 5, takeProfitPct: "", maxBarsHeld: undefined } });
    expect("design" in checked && checked.design).toMatchObject({ name: "Breakout", exit: null, risk: { stopLossPct: 5, takeProfitPct: null, maxBarsHeld: null } });
  });

  it("refuses what is outside it, in words", () => {
    const bad = (over: Record<string, unknown>) => validateDesign({ ...base, ...over });
    expect(bad({ name: "" })).toEqual({ error: "Name the strategy." });
    expect(bad({ timeframe: "3m" })).toHaveProperty("error");
    expect(bad({ entry: { match: "all", conditions: [{ left: { kind: "ichimoku" }, op: "above", right: { kind: "number", value: 1 } }] } })).toMatchObject({ error: expect.stringMatching(/not an operand Elyra knows/) });
    expect(bad({ entry: { match: "all", conditions: [{ left: { kind: "sma", period: 1 }, op: "above", right: { kind: "number", value: 1 } }] } })).toMatchObject({ error: expect.stringMatching(/period/) });
    expect(bad({ entry: { match: "all", conditions: [{ left: { kind: "macd", fast: 26, slow: 12, signal: 9, line: "macd" }, op: "above", right: { kind: "number", value: 0 } }] } })).toMatchObject({ error: expect.stringMatching(/fast period/) });
    expect(bad({ entry: { match: "all", conditions: [{ left: { kind: "number", value: 1 }, op: "above", right: { kind: "number", value: 2 } }] } })).toHaveProperty("error");
    expect(bad({ entry: { match: "all", conditions: Array.from({ length: 7 }, () => base.entry.conditions[0]) } })).toMatchObject({ error: expect.stringMatching(/at most 6/) });
    expect(bad({ risk: { stopLossPct: null, takeProfitPct: null, maxBarsHeld: null } })).toMatchObject({ error: expect.stringMatching(/a way out/) });
    expect(bad({ risk: { stopLossPct: 80 } })).toHaveProperty("error");
  });

  it("describes the rules from the design itself", () => {
    const golden = LIBRARY.find((entry) => entry.id === "golden-cross")!.design;
    expect(describeDesign(golden)).toEqual({
      entry: "Buy at the next bar's open when SMA(50) crosses above SMA(200).",
      exit: "Sell at the first of: SMA(50) crosses below SMA(200); a stop-loss 15% below the entry.",
    });
  });
});

describe("the library", () => {
  it("is all valid designs, each with a stop", () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(8);
    expect(new Set(LIBRARY.map((entry) => entry.id)).size).toBe(LIBRARY.length);
    for (const entry of LIBRARY) {
      const checked = validateDesign(entry.design);
      expect("design" in checked, entry.id).toBe(true);
      expect(entry.design.risk.stopLossPct, entry.id).not.toBeNull();
    }
  });
});

describe("the interpreter", () => {
  it("signals a cross on the bar it happens, never before", () => {
    const strategy = designStrategy((validateDesign({ ...base, exit: { match: "all", conditions: [{ left: { kind: "price", field: "close" }, op: "crosses_below", right: { kind: "number", value: 95 } }] } }) as { design: never }).design);
    const bars = candles([...flat(90, 3), [99, 102, 98, 101], [101, 103, 100, 102], [100, 100, 93, 94]]);
    const signals = strategy.evaluate(bars, {});
    expect(signals.map((signal) => (signal.enterLong ? "in" : signal.exitLong ? "out" : "-"))).toEqual(["-", "-", "-", "in", "-", "out"]);
    expect(signals[3].reason).toBe("Entry: Close crosses above 100");
  });

  it("reads a Donchian channel from the previous bars only", () => {
    const design = validateDesign({ ...base, entry: { match: "all", conditions: [{ left: { kind: "price", field: "close" }, op: "above", right: { kind: "donchian", period: 3, band: "upper" } }] } });
    const strategy = designStrategy((design as { design: never }).design);
    /* The bar whose own high makes the channel cannot be above it, unless the channel is the previous bars'. */
    const bars = candles([[10, 11, 9, 10], [10, 12, 9, 11], [11, 12, 10, 11], [11, 15, 11, 14]]);
    expect(strategy.evaluate(bars, {})[3].enterLong).toBe(true);
  });

  it("names a design by its rules, not its words", () => {
    const one = validateDesign(base);
    const two = validateDesign({ ...base, name: "Another name", summary: "Different words" });
    expect(designId((one as { design: never }).design)).toBe(designId((two as { design: never }).design));
  });
});

describe("the engine's protective exits", () => {
  const strategy = designStrategy((validateDesign(base) as { design: never }).design);
  const run = (rows: Array<[number, number, number, number]>, risk: Record<string, number | null>) =>
    runBacktest({ candles: candles(rows), config: config(risk), warmupBars: 1, strategy });

  it("stops out inside the bar that touches the stop", () => {
    /* Signal on bar 1's close, fill at bar 2's open (102); bar 3 trades down to 95, below the 5% stop at 96.9. */
    const result = run([[90, 90, 90, 90], [99, 101, 98, 101], [102, 103, 101, 102], [101, 101, 95, 96], [96, 97, 95, 96]], { stopLossPct: 5 });
    expect(result.trades[0]).toMatchObject({ entryPrice: 102, exitReason: "Stop-loss: 5% below the entry" });
    expect(result.trades[0].exitPrice).toBeCloseTo(96.9, 6);
  });

  it("fills a gap through the stop at the open, and assumes the stop when a bar spans both", () => {
    const gap = run([[90, 90, 90, 90], [99, 101, 98, 101], [102, 103, 101, 102], [90, 91, 89, 90], [90, 90, 90, 90]], { stopLossPct: 5 });
    expect(gap.trades[0].exitPrice).toBe(90);
    const both = run([[90, 90, 90, 90], [99, 101, 98, 101], [102, 103, 101, 102], [102, 120, 90, 110], [110, 110, 110, 110]], { stopLossPct: 5, takeProfitPct: 10 });
    expect(both.trades[0].exitReason).toMatch(/Stop-loss/);
  });

  it("takes profit at the target, and leaves on time", () => {
    const target = run([[90, 90, 90, 90], [99, 101, 98, 101], [102, 103, 101, 102], [103, 115, 103, 114], [114, 114, 114, 114]], { stopLossPct: 5, takeProfitPct: 10 });
    expect(target.trades[0]).toMatchObject({ exitReason: "Take-profit: 10% above the entry" });
    expect(target.trades[0].exitPrice).toBeCloseTo(112.2, 6);
    const timed = run([[90, 90, 90, 90], [99, 101, 98, 101], ...flat(102, 4)], { stopLossPct: 50, maxBarsHeld: 2 });
    expect(timed.trades[0]).toMatchObject({ exitReason: "Time limit: held 2 bars", barsHeld: 2 });
  });

  it("leaves a catalogue strategy's run untouched without risk limits", () => {
    const plain = runBacktest({ candles: candles([[90, 90, 90, 90], [99, 101, 98, 101], [102, 103, 101, 102], [101, 101, 95, 96]]), config: { ...config({}), risk: undefined }, warmupBars: 1, strategy });
    expect(plain.trades[0].exitReason).toBe("Position closed at the end of the test period");
  });
});

describe("the AI's proposals", () => {
  const proposal = {
    name: "Trend pullback",
    summary: "Buy pullbacks to the 20-bar EMA while above the 200-bar EMA, with a 6% stop.",
    entry: { match: "all", conditions: [{ left: { kind: "price", field: "close" }, op: "crosses_above", right: { kind: "ema", period: 20 } }, { left: { kind: "price", field: "close" }, op: "above", right: { kind: "ema", period: 200 } }] },
    exit: { match: "all", conditions: [{ left: { kind: "price", field: "close" }, op: "crosses_below", right: { kind: "ema", period: 20 } }] },
    risk: { stopLossPct: 6 },
  };

  it("keeps a valid proposal on the person's timeframe, with its summary when it stays on its own figures", () => {
    const vetted = vetProposal({ ...proposal, timeframe: "1d" }, "4h");
    expect(vetted?.design.timeframe).toBe("4h");
    expect(vetted?.aiSummary).toBe(proposal.summary);
  });

  it("drops a summary that claims a result, and a proposal that breaks the rules", () => {
    const boasting = vetProposal({ ...proposal, summary: "Returned 340% last year with a 71% win rate." }, "4h");
    expect(boasting?.aiSummary).toBeNull();
    expect(boasting?.design.summary).toBe("");
    expect(vetProposal({ ...proposal, summary: "See https://example.com for more." }, "4h")?.aiSummary).toBeNull();
    expect(vetProposal({ ...proposal, entry: { match: "all", conditions: [{ left: { kind: "future_price" }, op: "above", right: { kind: "number", value: 1 } }] } }, "4h")).toBeNull();
    expect(vetProposal({ ...proposal, exit: undefined, risk: {} }, "4h")).toBeNull();
    expect(vetProposal("not a strategy", "4h")).toBeNull();
  });

  it("reads proposals from the tool call, or from JSON in the text", () => {
    expect(proposalsIn({ toolCalls: [{ name: "propose_strategies", arguments: { strategies: [proposal] } }], text: null })).toHaveLength(1);
    expect(proposalsIn({ toolCalls: [], text: `Here: ${JSON.stringify({ strategies: [proposal, proposal] })}` })).toHaveLength(2);
    expect(proposalsIn({ toolCalls: [], text: "No strategies today." })).toEqual([]);
    /* As a model sometimes sends it: the array as a JSON string, bare or wrapped. */
    expect(proposalsIn({ toolCalls: [{ name: "propose_strategies", arguments: { strategies: JSON.stringify({ strategies: [proposal] }) } }], text: null })).toHaveLength(1);
    expect(proposalsIn({ toolCalls: [{ name: "propose_strategies", arguments: { strategies: JSON.stringify([proposal, proposal]) } }], text: null })).toHaveLength(2);
    expect(proposalsIn({ toolCalls: [{ name: "propose_strategies", arguments: { strategies: "not json" } }], text: null })).toEqual([]);
  });
});

describe("ruleWords — the rules as the engine runs them", () => {
  it("says the pictured 4h crossover the way the engine executes it", async () => {
    const { ruleWords, starterDesign } = await import("@/lib/strategies/spec");
    expect(ruleWords(starterDesign("My strategy"))).toEqual({
      buy: "At the next bar's open when EMA(20) crosses above EMA(50).",
      sell: "At the first of: the next bar's open after EMA(20) crosses below EMA(50); a stop 5% below the fill, inside the bar that reaches it.",
    });
  });

  it("names a template's stop and time limit as parts of its exit", async () => {
    const { ruleWords } = await import("@/lib/strategies/spec");
    const rsi2 = LIBRARY.find((entry) => entry.id === "rsi2-pullback")!.design;
    const words = ruleWords(rsi2);
    expect(words.buy).toBe("At the next bar's open when all of Close is above SMA(200), RSI(2) is below 10.");
    expect(words.sell).toContain(`a stop ${rsi2.risk.stopLossPct}% below the fill`);
    expect(words.sell).toContain(`the open after ${rsi2.risk.maxBarsHeld} bars held`);
  });

  it("drops what the design leaves out, and says the engine's order when a bar reaches both levels", async () => {
    const { ruleWords, starterDesign } = await import("@/lib/strategies/spec");
    const base = starterDesign("x");
    expect(ruleWords({ ...base, exit: null }).sell).toBe("At a stop 5% below the fill, inside the bar that reaches it.");
    const both = ruleWords({ ...base, exit: null, risk: { stopLossPct: 2, takeProfitPct: 6, maxBarsHeld: null } }).sell;
    expect(both).toMatch(/^At the first of: a stop 2% below the fill.*; a target 6% above the fill.*\. A bar that reaches both counts as the stop\.$/);
  });
});
