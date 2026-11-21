import { describe, expect, it } from "vitest";
import {
  agreesWithRecord,
  capitalRecord,
  fundCapital,
  fundingOver,
  intervalFor,
  levelFor,
  liquidationPrice,
  replay,
  summarise,
  type Bar,
  type ReviewTrade,
} from "@/lib/autotrade/review";
import { netPnl, PAPER_COSTS } from "@/lib/autotrade/rules";

const H = 3_600_000;
const DAY = 24 * H;
const T0 = Date.parse("2026-10-01T00:00:00.000Z");

/** An hourly bar at hour `i`: [high, low], close in between. */
const bar = (i: number, high: number, low: number, close = (high + low) / 2): Bar => ({ openTime: T0 + i * H, closeTime: T0 + (i + 1) * H - 1, high, low, close });

const trade = (overrides: Partial<ReviewTrade> = {}): ReviewTrade => ({
  id: "t1",
  coin: "BTC",
  side: "long",
  entryPrice: 100,
  originalSize: 1,
  leverage: 2,
  takeProfit: 110,
  stopLoss: 95,
  openedAt: T0 + 10 * 60_000,
  closedAt: T0 + 2 * H + 30 * 60_000,
  exitPrice: 95,
  exitReason: "stop_loss",
  realisedUsd: netPnl("long", 1, 100, 95),
  partials: [],
  ...overrides,
});

describe("liquidationPrice", () => {
  it("follows Hyperliquid's isolated formula: maintenance is half the initial margin at the cap", () => {
    expect(liquidationPrice("long", 100, 2, 20)).toBeCloseTo((100 * 0.5) / (1 - 1 / 40));
    expect(liquidationPrice("short", 100, 2, 20)).toBeCloseTo((100 * 1.5) / (1 + 1 / 40));
  });

  it("never liquidates a 1x long", () => {
    expect(liquidationPrice("long", 100, 1, 20)).toBe(0);
  });

  it("is nearer the entry at higher leverage", () => {
    expect(liquidationPrice("long", 100, 5, 20)).toBeGreaterThan(liquidationPrice("long", 100, 2, 20));
  });
});

describe("levelFor", () => {
  it("keeps the recorded level, removes it, or sets it from the entry", () => {
    expect(levelFor("recorded", 95, "long", 100, "stop")).toBe(95);
    expect(levelFor("none", 95, "long", 100, "stop")).toBeNull();
    expect(levelFor(5, 95, "long", 100, "stop")).toBeCloseTo(95);
    expect(levelFor(10, 110, "long", 100, "target")).toBeCloseTo(110);
    expect(levelFor(5, 105, "short", 100, "stop")).toBeCloseTo(105);
    expect(levelFor(10, 90, "short", 100, "target")).toBeCloseTo(90);
  });
});

describe("replay", () => {
  const noStop = { stopLoss: "none" as const, takeProfit: "recorded" as const };
  const now = T0 + 10 * H;

  it("lets a stopped trade run on to its take-profit", () => {
    const bars = [bar(0, 100.5, 99.5), bar(1, 100, 96), bar(2, 99, 94), bar(3, 104, 97), bar(4, 111, 103)];
    const result = replay(trade(), bars, noStop, 105, 20, now);
    expect(result.kind).toBe("take_profit");
    expect(result.exitAt).toBe(T0 + 4 * H);
    expect(result.pnlUsd).toBeCloseTo(netPnl("long", 1, 100, 110), 2);
    expect(result.worstUsd).toBeCloseTo(-6);
    expect(result.heldLonger).toEqual({ from: trade().closedAt, to: T0 + 4 * H, size: 1 });
  });

  it("liquidates a trade with no stop when the price reaches its liquidation price, losing the margin", () => {
    const bars = [bar(0, 100, 99), bar(1, 99, 94), bar(2, 90, 50)];
    const result = replay(trade(), bars, noStop, 60, 20, now);
    expect(result.kind).toBe("liquidated");
    expect(result.exitPrice).toBeCloseTo(liquidationPrice("long", 100, 2, 20));
    expect(result.pnlUsd).toBeCloseTo(-50 - (100 * PAPER_COSTS.takerFeePct) / 100, 1);
    /* The deepest is where it was liquidated, not the bar's low below it. */
    expect(result.worstUsd).toBeCloseTo(liquidationPrice("long", 100, 2, 20) - 100, 1);
  });

  it("marks a trade the new exits never close at the price now", () => {
    const bars = [bar(0, 100, 99), bar(1, 99, 94), bar(2, 101, 97), bar(3, 103, 100)];
    const result = replay(trade(), bars, noStop, 102, 20, now);
    expect(result.kind).toBe("still_open");
    expect(result.exitAt).toBeNull();
    expect(result.pnlUsd).toBeCloseTo(netPnl("long", 1, 100, 102), 2);
    expect(result.heldLonger?.to).toBe(now);
  });

  it("takes the worse exit when one bar reaches both", () => {
    const bars = [bar(0, 100, 99), bar(1, 111, 94)];
    expect(replay(trade({ exitReason: "take_profit", exitPrice: 110 }), bars, { stopLoss: "recorded", takeProfit: "recorded" }, 100, 20, now).kind).toBe("stop_loss");
  });

  it("keeps a close by hand unless the new exits fire first", () => {
    const byHand = trade({ exitReason: "closed_by_hand", exitPrice: 101, realisedUsd: 0.9, closedAt: T0 + 3 * H + 5 * 60_000 });
    const bars = [bar(0, 100.5, 99.5), bar(1, 101, 99), bar(2, 101.5, 98), bar(3, 101, 100), bar(4, 120, 100)];
    const kept = replay(byHand, bars, noStop, 101, 20, now);
    expect(kept.kind).toBe("as_recorded");
    expect(kept.pnlUsd).toBe(0.9);
    expect(kept.heldLonger).toBeNull();
    /* A 1.5% stop fires in hour 2, before the hand close. */
    const tighter = replay(byHand, bars, { stopLoss: 1.5, takeProfit: "recorded" }, 101, 20, now);
    expect(tighter.kind).toBe("stop_loss");
    expect(tighter.exitPrice).toBeCloseTo(98.5);
  });

  it("keeps the partial closes that came before the replayed exit", () => {
    const partial = trade({ originalSize: 2, partials: [{ at: T0 + H + 30 * 60_000, size: 1, pnlUsd: 3 }], realisedUsd: 3 + netPnl("long", 1, 100, 95) });
    const bars = [bar(0, 100.5, 99.5), bar(1, 103, 99), bar(2, 99, 94), bar(3, 111, 99)];
    const result = replay(partial, bars, noStop, 100, 20, now);
    expect(result.kind).toBe("take_profit");
    expect(result.pnlUsd).toBeCloseTo(3 + netPnl("long", 1, 100, 110), 2);
  });

  it("replays a short the other way up", () => {
    const short = trade({ side: "short", takeProfit: 90, stopLoss: 105, exitPrice: 105, realisedUsd: netPnl("short", 1, 100, 105) });
    const bars = [bar(0, 100.5, 99.5), bar(1, 106, 100), bar(2, 101, 89)];
    const result = replay(short, bars, noStop, 95, 20, now);
    expect(result.kind).toBe("take_profit");
    expect(result.pnlUsd).toBeCloseTo(netPnl("short", 1, 100, 90), 2);
    expect(result.worstUsd).toBeCloseTo(-6);
  });

  it("agrees with the record when the bars say the same", () => {
    const bars = [bar(0, 100.5, 99.5), bar(1, 100, 96), bar(2, 99, 94)];
    expect(agreesWithRecord(trade(), bars, 20)).toBe(true);
    expect(agreesWithRecord(trade({ exitReason: "take_profit" }), bars, 20)).toBe(false);
    expect(agreesWithRecord(trade({ exitReason: "closed_by_hand" }), bars, 20)).toBeNull();
  });
});

describe("summarise", () => {
  it("splits what the replay would have booked from what it marks to now", () => {
    const bars = [bar(0, 100.5, 99.5), bar(1, 100, 96), bar(2, 99, 94), bar(3, 111, 103)];
    const won = replay(trade(), bars, { stopLoss: "none", takeProfit: "recorded" }, 105, 20, T0 + 5 * H);
    const open = replay(trade({ id: "t2", takeProfit: 130 }), bars, { stopLoss: "none", takeProfit: "recorded" }, 105, 20, T0 + 5 * H);
    const summary = summarise([won, open], { agree: 2, of: 2 });
    expect(summary.counts).toMatchObject({ take_profit: 1, still_open: 1 });
    expect(summary.bookedUsd).toBeCloseTo(won.pnlUsd);
    expect(summary.markedUsd).toBeCloseTo(open.pnlUsd);
    expect(summary.totalUsd).toBeCloseTo(won.pnlUsd + open.pnlUsd);
    expect(summary.actualUsd).toBeCloseTo(2 * netPnl("long", 1, 100, 95));
  });
});

describe("capitalRecord", () => {
  const position = (id: string, openDay: number, closeDay: number | null, margin: number, realised: number): ReviewTrade =>
    trade({
      id,
      entryPrice: 100,
      originalSize: margin / 100,
      leverage: 1,
      openedAt: T0 + openDay * DAY + H,
      closedAt: closeDay === null ? null : T0 + closeDay * DAY + 2 * H,
      realisedUsd: closeDay === null ? null : realised,
    });

  it("is the first day's margin, then each later new peak as an addition", () => {
    /* $39.99 on the first day; on the 11th two trades open at once with what was earned not enough to cover them. */
    const record = capitalRecord([position("a", 0, 1, 39.99, 5), position("b", 10, 12, 50, 10), position("c", 10, 12, 50, -2)]);
    expect(record.initialUsd).toBe(39.99);
    expect(record.initialDay).toBe("2026-10-01");
    expect(record.additions).toEqual([{ day: "2026-10-11", amountUsd: 55.01 }]);
    expect(record.totalUsd).toBe(95);
    expect(record.realisedUsd).toBe(13);
    expect(record.returnPct).toBeCloseTo(13.7, 1);
    expect(record.peakMarginUsd).toBe(100);
  });

  it("lets gains fund later margin, and needs more after losses", () => {
    expect(capitalRecord([position("a", 0, 1, 50, 20), position("b", 2, 3, 60, 0)]).totalUsd).toBe(50);
    expect(capitalRecord([position("a", 0, 1, 50, -20), position("b", 2, 3, 50, 0)])).toMatchObject({ initialUsd: 50, additions: [{ day: "2026-10-03", amountUsd: 20 }], totalUsd: 70 });
  });

  it("frees margin a close releases for an open at the same moment", () => {
    const at = T0 + DAY;
    const first = trade({ id: "a", leverage: 1, originalSize: 0.5, closedAt: at, realisedUsd: 0 });
    const second = trade({ id: "b", leverage: 1, originalSize: 0.5, openedAt: at, closedAt: null, realisedUsd: null });
    expect(capitalRecord([first, second]).totalUsd).toBe(50);
  });

  it("counts partial closes as earned and frees their margin", () => {
    const partial = trade({ leverage: 1, originalSize: 1, partials: [{ at: T0 + H, size: 0.5, pnlUsd: 4 }], closedAt: null, realisedUsd: null });
    const record = capitalRecord([partial]);
    expect(record.totalUsd).toBe(100);
    expect(record.realisedUsd).toBe(4);
  });
});

describe("fundCapital", () => {
  it("is the fund's real deposits: the first, later ones by day, and withdrawals", () => {
    const record = fundCapital(
      [
        { kind: "subscribe", amountUsd: 39.99, at: T0 },
        { kind: "subscribe", amountUsd: 87.57, at: T0 + 10 * DAY },
        { kind: "redeem", amountUsd: 10, at: T0 + 12 * DAY },
      ],
      125,
    );
    expect(record).toMatchObject({ initialUsd: 39.99, initialDay: "2026-10-01", totalUsd: 127.56, realisedUsd: 125 });
    expect(record.additions).toEqual([{ day: "2026-10-11", amountUsd: 87.57 }]);
    expect(record.withdrawals).toEqual([{ day: "2026-10-13", amountUsd: 10 }]);
    expect(record.returnPct).toBeCloseTo(98, 0);
  });
});

describe("fundingOver", () => {
  it("charges a long a positive rate on its notional, and pays a short", () => {
    const bars = [bar(0, 101, 99, 100), bar(1, 101, 99, 100), bar(2, 101, 99, 100)];
    const rates = [
      { time: T0 + H, rate: 0.0001 },
      { time: T0 + 2 * H, rate: 0.0001 },
      { time: T0 + 5 * H, rate: 0.0001 },
    ];
    const held = { from: T0 + 30 * 60_000, to: T0 + 2 * H + 1, size: 2 };
    expect(fundingOver(held, "long", rates, bars)).toBeCloseTo(-0.04);
    expect(fundingOver(held, "short", rates, bars)).toBeCloseTo(0.04);
  });
});

describe("intervalFor", () => {
  it("picks the finest interval Hyperliquid's 5,000 bars reach back with", () => {
    const now = T0 + 400 * DAY;
    expect(intervalFor(now - 10 * DAY, now)).toBe("15m");
    expect(intervalFor(now - 100 * DAY, now)).toBe("1h");
    expect(intervalFor(now - 300 * DAY, now)).toBe("4h");
    expect(intervalFor(now - 3 * 365 * DAY, now)).toBe("1d");
    expect(intervalFor(now - 20 * 365 * DAY, now)).toBeNull();
  });
});
