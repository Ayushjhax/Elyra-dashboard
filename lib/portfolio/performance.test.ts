import { describe, expect, it } from "vitest";
import type { FlowEvent } from "@/lib/portfolio/flows";
import {
  allTimeReturn,
  benchmarkSeries,
  calendar,
  chain,
  flowBetween,
  intensity,
  intervalReturn,
  tradeStats,
  windowChain,
  type DailyRecord,
} from "@/lib/portfolio/performance";

/* ---------------------------------------------------------------------------
   Performance, net of deposits and withdrawals: a deposit is never a gain,
   and a gap is never guessed.
--------------------------------------------------------------------------- */

const NOW = Date.parse("2026-11-25T12:00:00Z");

function flow(at: string, usd: number | null, direction: "in" | "out" = "in"): FlowEvent {
  return { at, network: "solana", direction, symbol: "USDC", amount: usd ?? 1, usd, counterparty: null, reference: at };
}

function record(day: string, equityUsd: number | null, flowUsd: number | null = 0, flowsComplete = true): DailyRecord {
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return { day, recordedAt: `${next}T00:10:00.000Z`, equityUsd, flowUsd, flowsComplete };
}

describe("one interval", () => {
  it("takes the deposit out of the PnL and puts half of it in the capital", () => {
    const step = intervalReturn(10_000, 20_500, 10_000);
    expect(step?.pnl).toBe(500);
    expect(step?.r).toBeCloseTo(500 / 15_000, 10);
  });

  it("has no return over an empty account or an unknown flow", () => {
    expect(intervalReturn(0, 100, 100)).toBeNull();
    expect(intervalReturn(1000, 1100, null)).toBeNull();
    expect(intervalReturn(null, 1100, 0)).toBeNull();
  });
});

describe("a chain of readings", () => {
  it("does not draw a deposit as performance", () => {
    /* $10k grows 10%, then $10k more arrives and nothing moves. */
    const result = chain([
      { at: "a", equityUsd: 10_000, flowUsd: null },
      { at: "b", equityUsd: 11_000, flowUsd: 0 },
      { at: "c", equityUsd: 21_000, flowUsd: 10_000 },
    ]);
    expect(result.pnlUsd).toBe(1000);
    expect(result.returnPct).toBeCloseTo(0.1, 10);
    expect(result.gaps).toBe(0);
  });

  it("measures drawdown on the return, so a withdrawal is not a fall", () => {
    const result = chain([
      { at: "a", equityUsd: 10_000, flowUsd: null },
      { at: "b", equityUsd: 12_000, flowUsd: 0 },
      { at: "c", equityUsd: 9_000, flowUsd: 0 },
      { at: "d", equityUsd: 4_000, flowUsd: -5_000 },
    ]);
    expect(result.maxDrawdownPct).toBeCloseTo(0.25, 2);
  });

  it("leaves a gap out of the PnL and the return, and counts it", () => {
    const result = chain([
      { at: "a", equityUsd: 10_000, flowUsd: null },
      { at: "b", equityUsd: 20_000, flowUsd: null },
      { at: "c", equityUsd: 21_000, flowUsd: 0 },
    ]);
    expect(result.gaps).toBe(1);
    expect(result.pnlUsd).toBe(1000);
    expect(result.points[1].known).toBe(false);
  });
});

describe("flows between two readings", () => {
  const flows = [flow("2026-11-25T01:00:00Z", 1000), flow("2026-11-25T03:00:00Z", 300, "out")];

  it("nets those strictly after the first and up to the second", () => {
    expect(flowBetween(flows, "2026-11-25T00:00:00Z", "2026-11-25T03:00:00Z", "2026-11-18T00:00:00Z")).toBe(700);
    expect(flowBetween(flows, "2026-11-25T01:00:00Z", "2026-11-25T02:00:00Z", "2026-11-18T00:00:00Z")).toBe(0);
  });

  it("is unknown before the reads reached back, or with an unpriced flow", () => {
    expect(flowBetween(flows, "2026-11-17T00:00:00Z", "2026-11-25T03:00:00Z", "2026-11-18T00:00:00Z")).toBeNull();
    expect(flowBetween([flow("2026-11-25T01:00:00Z", null)], "2026-11-25T00:00:00Z", "2026-11-25T02:00:00Z", "2026-11-18T00:00:00Z")).toBeNull();
    expect(flowBetween(flows, "2026-11-25T00:00:00Z", "2026-11-25T03:00:00Z", null)).toBeNull();
  });
});

describe("a window", () => {
  const data = {
    daily: [record("2026-11-22", 10_000), record("2026-11-23", 10_500), record("2026-11-24", 16_000, 5_000)],
    readings: [
      { at: "2026-11-25T00:10:00.000Z", equityUsd: 16_000 },
      { at: "2026-11-25T06:00:00.000Z", equityUsd: 16_400 },
    ],
    flows: [] as FlowEvent[],
    flowsCoveredSince: "2026-11-18T12:00:00.000Z",
  };

  it("chains the daily closes for 30 days, ending at the live reading", () => {
    const result = windowChain(data, "30d", { at: "2026-11-25T12:00:00.000Z", equityUsd: 16_800 }, NOW);
    /* +500, then +500 after a $5k deposit, then +800 today. */
    expect(result.pnlUsd).toBe(1800);
    expect(result.points).toHaveLength(4);
  });

  it("reads the five-minute readings for 24 hours", () => {
    const result = windowChain(data, "24h", { at: "2026-11-25T12:00:00.000Z", equityUsd: 16_800 }, NOW);
    expect(result.points.map((point) => point.equityUsd)).toEqual([16_000, 16_400, 16_800]);
    expect(result.pnlUsd).toBe(800);
  });

  it("chains every close for the all-time return", () => {
    const value = allTimeReturn(data, { at: "2026-11-25T12:00:00.000Z", equityUsd: 16_800 });
    expect(value).toBeCloseTo((10_500 / 10_000) * (1 + 500 / 13_000) * (16_800 / 16_000) - 1, 10);
  });

  it("has no all-time return before two closes", () => {
    expect(allTimeReturn({ daily: [], flows: [], flowsCoveredSince: null }, { at: "2026-11-25T12:00:00Z", equityUsd: 100 })).toBeNull();
  });
});

describe("trades", () => {
  const trades = [
    { at: "2026-11-24T00:00:00Z", venue: "hyperliquid" as const, label: "BTC", pnlUsd: 300 },
    { at: "2026-11-23T00:00:00Z", venue: "hyperliquid" as const, label: "ETH", pnlUsd: -100 },
    { at: "2026-11-22T00:00:00Z", venue: "polymarket" as const, label: "Q", pnlUsd: 50 },
    { at: "2026-10-01T00:00:00Z", venue: "hyperliquid" as const, label: "SOL", pnlUsd: -999 },
  ];

  it("counts wins over all trades, and profit over loss, in the window", () => {
    const stats = tradeStats(trades, NOW - 7 * 86_400_000);
    expect(stats).toMatchObject({ trades: 3, wins: 2, losses: 1, grossProfitUsd: 350, grossLossUsd: 100 });
    expect(stats.winRate).toBeCloseTo(2 / 3, 10);
    expect(stats.profitFactor).toBeCloseTo(3.5, 10);
  });

  it("has no profit factor without a losing trade, and no win rate without trades", () => {
    expect(tradeStats([trades[0]], 0).profitFactor).toBeNull();
    expect(tradeStats([], 0).winRate).toBeNull();
  });
});

describe("the daily calendar", () => {
  it("shows each day net of its flows, and leaves a day with no neighbour unknown", () => {
    const data = {
      daily: [record("2026-11-21", 9_000), record("2026-11-23", 10_000), record("2026-11-24", 16_000, 5_000)],
      flows: [] as FlowEvent[],
      flowsCoveredSince: "2026-11-18T00:00:00Z",
    };
    const { days, summary } = calendar(data, { at: "2026-11-25T12:00:00.000Z", equityUsd: 15_500 }, NOW, 5);
    expect(days.map((day) => [day.day, day.pnlUsd])).toEqual([
      ["2026-11-21", null],
      ["2026-11-22", null],
      ["2026-11-23", null],
      ["2026-11-24", 1000],
      ["2026-11-25", -500],
    ]);
    expect(days.at(-1)?.provisional).toBe(true);
    expect(summary).toMatchObject({ profitableDays: 1, losingDays: 1, unknownDays: 3 });
    expect(summary.best?.day).toBe("2026-11-24");
    expect(summary.worst?.day).toBe("2026-11-25");
  });

  it("colours a day by its size against the period's largest move", () => {
    expect(intensity(null, 100)).toBe(0);
    expect(intensity(10, 100)).toBe(1);
    expect(intensity(-50, 100)).toBe(3);
    expect(intensity(100, 100)).toBe(4);
  });
});

describe("the benchmark", () => {
  it("is its own return from the window's first close", () => {
    const series = benchmarkSeries(
      [
        { at: "2026-11-01T00:00:00Z", close: 50_000 },
        { at: "2026-11-24T00:00:00Z", close: 60_000 },
        { at: "2026-11-25T00:00:00Z", close: 66_000 },
      ],
      Date.parse("2026-11-20T00:00:00Z"),
    );
    expect(series).toHaveLength(2);
    expect(series[0].returnPct).toBe(0);
    expect(series[1].returnPct).toBeCloseTo(0.1, 10);
  });
});
