import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";
import { netPnl } from "@/lib/autotrade/rules";

const H = 3_600_000;
const DAY = 24 * H;
const T0 = Date.parse("2026-10-01T00:00:00.000Z");
const NOW = T0 + 12 * DAY;

const state = {
  db: null as unknown as FakeSupabase,
  bars: [] as Array<{ openTime: number; closeTime: number; open: number; high: number; low: number; close: number }>,
  candleCalls: [] as string[],
};

vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/autotrade/hyperliquid", () => ({
  hyperliquidCandles: async (coin: string, interval: string) => {
    state.candleCalls.push(`${coin}:${interval}`);
    return state.bars.map((bar) => ({ instrumentId: coin, venue: "hyperliquid", interval, volume: 1, complete: true, source: "hyperliquid", ...bar }));
  },
  perpMeta: async () => ({ asset: 0, szDecimals: 5, maxLeverage: 40 }),
  midsFor: async () => new Map([["BTC", 103]]),
  fundingHistory: async () => ({ rates: [], complete: true }),
}));

import { exitChoice, tradingRecord, tradingWhatIf } from "@/lib/agent/tools/trading";

/* Flat at 103 for twelve days, with the moves the trades turn on. */
function seedBars() {
  const special: Record<number, [number, number]> = {
    1: [100.5, 99.5],
    2: [101, 99.5],
    3: [100, 97.9],
    4: [104.2, 99],
    246: [104.5, 103.5],
    247: [104, 101.5],
  };
  state.bars = Array.from({ length: 12 * 24 }, (_, i) => {
    const [high, low] = special[i] ?? [103.5, 102.5];
    return { openTime: T0 + i * H, closeTime: T0 + (i + 1) * H - 1, open: (high + low) / 2, high, low, close: (high + low) / 2 };
  });
}

const position = (id: string, openH: number, closeH: number | null, entry: number, tp: number, sl: number, exit: number | null, reason: string | null, userId = "u1") => ({
  id,
  user_id: userId,
  rule_id: "r1",
  rule_name: "Volume Anchor Trend",
  mode: "paper",
  network: null,
  coin: "BTC",
  side: "long",
  size: 0.4,
  original_size: 0.4,
  entry_price: entry,
  take_profit: tp,
  stop_loss: sl,
  signal_at: new Date(T0 + openH * H).toISOString(),
  status: closeH === null ? "open" : "closed",
  exit_price: exit,
  exit_reason: reason,
  realised_pnl_usd: exit === null ? null : Number(netPnl("long", 0.4, entry, exit).toFixed(4)),
  opened_at: new Date(T0 + openH * H + 10 * 60_000).toISOString(),
  closed_at: closeH === null ? null : new Date(T0 + closeH * H + 30 * 60_000).toISOString(),
  leverage: 2,
  origin: "rule",
  fund_id: null,
  partial_closes: [],
  realised_partial_usd: 0,
});

const context = { userId: "u1", sessionWallet: null };

/* The parts of the tools' JSON these tests read. */
interface RecordOut {
  book: { name: string };
  trades: unknown;
  capital: { returnPct: number };
  realisedUsd: number;
  needsChoice?: boolean;
  choices: Array<{ name: string }>;
}
interface WhatIfOut {
  scenario: unknown;
  summary: { trades: number; actualBookedUsd: number; whatIf: { bookedUsd: number; stillOpenMarkedUsd: number; totalMarkedToNowUsd: number }; outcomes: unknown };
  calibration: string;
  capitalNeeded: { actualUsd: number };
  candles: unknown;
  notes: string[];
  changed: Array<{ replayed: { outcome: string } }>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.db = new FakeSupabase();
  state.candleCalls = [];
  seedBars();
  state.db.seed("trading_rules", [
    { id: "r1", user_id: "u1", name: "Volume Anchor Trend", strategy_id: "SESSION_VWAP_RECLAIM_V1", leverage: 2 },
    { id: "r2", user_id: "u1", name: "Volume Anchor Fade", strategy_id: "RSI_12_MEAN_REVERSION_V1", leverage: 2 },
  ]);
  state.db.seed("trading_positions", [
    /* Stopped at 98, then the price ran to 104.2: without a stop it takes profit. */
    position("t1", 1, 3, 100, 104, 98, 98, "stop_loss"),
    /* Took profit on its own. */
    position("t2", 2, 4, 100, 104, 97, 104, "take_profit"),
    /* Opened on the 11th, stopped at 101.92, never reached 108.16: still open now, at 103. */
    position("t3", 246, 247, 104, 108.16, 101.92, 101.92, "stop_loss"),
    /* Someone else's trade, which must never be read. */
    position("x1", 1, 3, 100, 104, 98, 98, "stop_loss", "u2"),
  ]);
  state.db.seed("ai_funds", []);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("trading_record", () => {
  it("answers what the strategy needed in capital and what it returned", async () => {
    const result = (await tradingRecord.execute({ name: "Volume Anchor Trend" }, context)) as RecordOut;
    expect(result.book).toMatchObject({ name: "Volume Anchor Trend", strategy: "Session VWAP — reclaim", paperTrades: 3, liveTrades: 0 });
    expect(result.trades).toMatchObject({ closed: 3, open: 0, wins: 1, losses: 2, byExit: { stop_loss: 2, take_profit: 1 }, liquidated: 0 });
    /* Two trades of $20 margin open together on the first day; the third needed less than was there. */
    expect(result.capital).toMatchObject({ initialUsd: 40, initialDay: "2026-10-01", additions: [], totalUsd: 40 });
    const realised = netPnl("long", 0.4, 100, 98) + netPnl("long", 0.4, 100, 104) + netPnl("long", 0.4, 104, 101.92);
    expect(result.realisedUsd).toBeCloseTo(realised, 2);
    expect(result.capital.returnPct).toBeCloseTo((realised / 40) * 100, 1);
  });

  it("asks which book when the name fits more than one, or none", async () => {
    state.db.seed("trading_positions", [{ ...position("f1", 5, 6, 100, 104, 98, 98, "stop_loss"), rule_id: "r2", rule_name: "Volume Anchor Fade" }]);
    const both = (await tradingRecord.execute({ name: "volume anchor" }, context)) as RecordOut;
    expect(both.needsChoice).toBe(true);
    expect(both.choices.map((choice) => choice.name).sort()).toEqual(["Volume Anchor Fade", "Volume Anchor Trend"]);
    const none = (await tradingRecord.execute({ name: "grid bot" }, context)) as RecordOut;
    expect(none.needsChoice).toBe(true);
    expect(none.choices).toHaveLength(2);
    /* The full name settles it. */
    const one = (await tradingRecord.execute({ name: "Volume Anchor Trend" }, context)) as RecordOut;
    expect(one.book.name).toBe("Volume Anchor Trend");
  });

  it("says when there is nothing recorded", async () => {
    state.db = new FakeSupabase();
    state.db.seed("trading_rules", []);
    state.db.seed("trading_positions", []);
    state.db.seed("ai_funds", []);
    expect(await tradingRecord.execute({ name: "anything" }, context)).toMatchObject({ found: false });
  });
});

describe("trading_what_if", () => {
  it("answers what would have happened without the stop-loss", async () => {
    const result = (await tradingWhatIf.execute({ name: "Volume Anchor Trend", stopLoss: "none" }, context)) as WhatIfOut;
    expect(state.candleCalls).toEqual(["BTC:15m"]);
    expect(result.scenario).toEqual({ stopLoss: "no stop-loss", takeProfit: "take-profit as each trade had it" });

    const actual = netPnl("long", 0.4, 100, 98) + netPnl("long", 0.4, 100, 104) + netPnl("long", 0.4, 104, 101.92);
    const booked = 2 * netPnl("long", 0.4, 100, 104);
    const marked = netPnl("long", 0.4, 104, 103);
    expect(result.summary.actualBookedUsd).toBeCloseTo(actual, 1);
    expect(result.summary.whatIf.bookedUsd).toBeCloseTo(booked, 1);
    expect(result.summary.whatIf.stillOpenMarkedUsd).toBeCloseTo(marked, 1);
    expect(result.summary.whatIf.totalMarkedToNowUsd).toBeCloseTo(booked + marked, 1);
    expect(result.summary.outcomes).toEqual({ tookProfit: 2, stoppedOut: 0, liquidated: 0, unchanged: 0, stillOpen: 1 });
    expect(result.calibration).toContain("3 of 3");
    expect(result.capitalNeeded.actualUsd).toBe(40);
    expect(result.candles).toEqual({ source: "hyperliquid", interval: "15m" });
    expect(result.notes.join(" ")).toContain("Every later entry is assumed to happen as it did");
    /* The trade that changed most is listed with how it would have ended. */
    expect(result.changed[0].replayed.outcome).toBe("take_profit");
  });

  it("refuses a question with nothing changed, and an exit it cannot read", async () => {
    await expect(tradingWhatIf.execute({ name: "Volume Anchor Trend" }, context)).rejects.toThrow(/Say what changes/);
    expect(() => exitChoice("tight", "stopLoss")).toThrow(/percent/);
    expect(exitChoice("5%", "stopLoss")).toBe(5);
    expect(exitChoice("none", "stopLoss")).toBe("none");
    expect(exitChoice(undefined, "stopLoss")).toBe("recorded");
  });

  it("leaves out live testnet trades, whose prices are not the market's", async () => {
    state.db.seed("trading_positions", [{ ...position("t4", 5, 6, 100, 104, 98, 98, "stop_loss"), mode: "live", network: "testnet" }]);
    const result = (await tradingWhatIf.execute({ name: "Volume Anchor Trend", stopLoss: "none" }, context)) as WhatIfOut;
    expect(result.summary.trades).toBe(3);
    expect(result.notes.join(" ")).toContain("testnet");
  });
});
