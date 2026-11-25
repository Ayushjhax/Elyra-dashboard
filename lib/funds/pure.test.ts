import { describe, expect, it } from "vitest";
import { bookValue, dailyCloses, downsample, fundStats, hourBucket, riskMarks, unitsFor, withdrawable } from "@/lib/funds/accounting";
import { actionsFor, charterChanges, CHARTER_DEFAULTS, checkOrder, graduationCheck, maxNewPosition, openBlockers, validateCharter, type OrderContext } from "@/lib/funds/policy";
import type { FundCharter } from "@/lib/funds/types";

/* ---------------------------------------------------------------------------
   AI funds, the pure half: what a charter may say, what an order may do
   under it, how a fund moves through its life, and the accounting that
   keeps returns honest when capital moves.
--------------------------------------------------------------------------- */

const CHARTER: FundCharter = { name: "Trend book", objective: "Ride BTC and ETH trends; cut losers fast.", ...CHARTER_DEFAULTS };

const context = (over: Partial<OrderContext["book"]> = {}, risk: Partial<OrderContext["risk"]> = {}, status: OrderContext["status"] = "active"): OrderContext => ({
  status,
  charter: CHARTER,
  book: { navUsd: 1_000, grossUsd: 0, marginUsd: 0, openPositions: 0, openCoins: [], ...over },
  risk: { drawdownPct: 0, todayPct: 0, ...risk },
});

describe("validateCharter", () => {
  it("accepts the defaults and normalises market names", () => {
    const result = validateCharter({ ...CHARTER, markets: ["btc", "ETH", "kpepe", "BTC"] });
    expect("charter" in result && result.charter.markets).toEqual(["BTC", "ETH", "kPEPE"]);
  });

  it("refuses what the limits do not allow, in words", () => {
    expect(validateCharter({ ...CHARTER, name: "" })).toEqual({ error: "Name the fund." });
    expect(validateCharter({ ...CHARTER, markets: ["DOGWIFRUG"] })).toHaveProperty("error");
    expect(validateCharter({ ...CHARTER, maxLeverage: 8 })).toHaveProperty("error");
    expect(validateCharter({ ...CHARTER, maxLeverage: 2.5 })).toHaveProperty("error");
    expect(validateCharter({ ...CHARTER, maxDrawdownPct: 80 })).toHaveProperty("error");
    expect(validateCharter({ ...CHARTER, dailyLossPct: 10, maxDrawdownPct: 5 })).toEqual({ error: "The daily loss limit cannot be larger than the drawdown limit." });
    expect(validateCharter({ ...CHARTER, maxPositionPct: 100, maxGrossExposure: 0.5 })).toHaveProperty("error");
  });

  it("names what changed, and summarises the brief rather than repeating it", () => {
    const changes = charterChanges(CHARTER, { ...CHARTER, maxLeverage: 2, objective: "Shorter." });
    expect(changes.maxLeverage).toEqual({ from: 3, to: 2 });
    expect(changes.objective).toEqual({ from: `${CHARTER.objective.length} characters`, to: "8 characters" });
    expect(Object.keys(charterChanges(CHARTER, { ...CHARTER }))).toEqual([]);
  });
});

describe("checkOrder", () => {
  const order = { coin: "BTC", side: "long" as const, sizeUsd: 200, leverage: 2 };

  it("passes an order inside the charter", () => {
    expect(checkOrder(context(), order)).toEqual({ ok: true });
  });

  it("gives every reason an order breaks the charter", () => {
    const result = checkOrder(context({ openCoins: [] }), { coin: "DOGE", side: "short", sizeUsd: 400, leverage: 5 });
    expect(result.ok).toBe(false);
    const reasons = (result as { reasons: string[] }).reasons.join(" ");
    expect(reasons).toMatch(/outside the fund's markets/);
    expect(reasons).toMatch(/above the charter's 3x/);
    expect(reasons).toMatch(/more than 25% of NAV/);
  });

  it("refuses shorts when the charter does, and a second position in one coin", () => {
    const noShorts = { ...context(), charter: { ...CHARTER, allowShorts: false } };
    expect(checkOrder(noShorts, { ...order, side: "short" })).toMatchObject({ ok: false, reasons: ["The charter does not allow shorts."] });
    expect(checkOrder(context({ openCoins: ["BTC"], openPositions: 1, grossUsd: 200, marginUsd: 100 }), order)).toMatchObject({ ok: false });
  });

  it("holds gross exposure and margin to the book", () => {
    const full = context({ grossUsd: 1_400, marginUsd: 700, openPositions: 3, openCoins: ["ETH", "SOL", "HYPE"] });
    const result = checkOrder({ ...full, charter: { ...CHARTER, markets: [...CHARTER.markets, "HYPE"] } }, order);
    expect((result as { reasons: string[] }).reasons.join(" ")).toMatch(/Gross exposure would be 1.60× NAV/);
  });

  it("stops new positions when paused, halted, at the daily limit, or at the drawdown limit", () => {
    expect(openBlockers(context({}, {}, "paused"))[0]).toMatch(/paused/);
    expect(openBlockers(context({}, {}, "halted"))[0]).toMatch(/halted/);
    expect(openBlockers(context({}, { todayPct: -4.2 }))[0]).toMatch(/daily limit/);
    expect(openBlockers(context({}, { drawdownPct: 15 }))[0]).toMatch(/15% limit/);
    expect(maxNewPosition(context({}, {}, "paused"))).toBe(0);
  });

  it("offers the largest position the tightest limit allows", () => {
    expect(maxNewPosition(context())).toBe(250);
    expect(maxNewPosition(context({ grossUsd: 1_400, marginUsd: 500 }))).toBeCloseTo(100);
  });
});

describe("the lifecycle", () => {
  it("allows each state only its own moves", () => {
    expect(actionsFor("active", "paper")).toEqual(["pause", "wind_down", "graduate"]);
    expect(actionsFor("active", "live")).toEqual(["pause", "wind_down"]);
    expect(actionsFor("halted", "paper")).toEqual(["resume", "wind_down"]);
    expect(actionsFor("winding_down", "paper")).toEqual([]);
    expect(actionsFor("closed", "live")).toEqual([]);
  });

  it("graduates a paper fund only with a record", () => {
    const now = Date.parse("2026-11-17T12:00:00Z");
    const young = graduationCheck({ mode: "paper", status: "active", createdAt: "2026-11-14T12:00:00Z", closedTrades: 1, openPositions: 0, now });
    expect(young.ready).toBe(false);
    expect(young.reasons.join(" ")).toMatch(/4 days to go.*it has 1/);
    const ready = graduationCheck({ mode: "paper", status: "paused", createdAt: "2026-11-01T00:00:00Z", closedTrades: 3, openPositions: 2, now });
    expect(ready).toEqual({ ready: true, reasons: [], incubatedDays: 16 });
    expect(graduationCheck({ mode: "live", status: "active", createdAt: "2026-10-01T00:00:00Z", closedTrades: 9, openPositions: 0, now }).ready).toBe(false);
  });
});

describe("accounting", () => {
  it("prices units so a deposit is never a return", () => {
    const start = bookValue({ flows: [{ kind: "subscribe", amountUsd: 1_000, units: 10 }], realisedUsd: 0, open: [] });
    expect(start.npu).toBe(100);
    /* The manager makes 25%: NAV 1,250, NPU 125. */
    const up = bookValue({ flows: [{ kind: "subscribe", amountUsd: 1_000, units: 10 }], realisedUsd: 250, open: [] });
    expect(up.npu).toBe(125);
    /* $1,250 more buys 10 units at 125: NAV doubles, NPU does not move. */
    const units = unitsFor(1_250, up.npu);
    const after = bookValue({
      flows: [
        { kind: "subscribe", amountUsd: 1_000, units: 10 },
        { kind: "subscribe", amountUsd: 1_250, units },
      ],
      realisedUsd: 250,
      open: [],
    });
    expect(after.navUsd).toBe(2_500);
    expect(after.npu).toBe(125);
    /* Taking $500 out at 125 leaves NPU where it was. */
    const out = bookValue({
      flows: [
        { kind: "subscribe", amountUsd: 1_000, units: 10 },
        { kind: "subscribe", amountUsd: 1_250, units },
        { kind: "redeem", amountUsd: 500, units: unitsFor(500, 125) },
      ],
      realisedUsd: 250,
      open: [],
    });
    expect(out.npu).toBeCloseTo(125, 9);
  });

  it("marks an open position after fees, and at its entry when there is no price", () => {
    const flows = [{ kind: "subscribe" as const, amountUsd: 1_000, units: 10 }];
    const marked = bookValue({ flows, realisedUsd: 0, open: [{ side: "long", size: 0.01, entryPrice: 100_000, leverage: 2, mid: 101_000 }] });
    /* +$10 gross, less 0.045% on $1,000 and on $1,010. */
    expect(marked.unrealisedUsd).toBeCloseTo(10 - 0.45 - 0.4545, 4);
    expect(marked.grossUsd).toBeCloseTo(1_010);
    expect(marked.marginUsd).toBeCloseTo(500);
    expect(marked.stale).toBe(false);
    const stale = bookValue({ flows, realisedUsd: 0, open: [{ side: "short", size: 0.01, entryPrice: 100_000, leverage: 2, mid: null }] });
    expect(stale.stale).toBe(true);
    expect(stale.grossUsd).toBe(1_000);
  });

  it("measures drawdown from the high, and today from the day's start", () => {
    const marks = riskMarks(90, 120, 100);
    expect(marks.drawdownPct).toBeCloseTo(25, 9);
    expect(marks.todayPct).toBeCloseTo(-10, 9);
    expect(riskMarks(130, 120, 125).drawdownPct).toBe(0);
  });

  it("keeps the fund's minimum, its margin and its exposure when money comes out", () => {
    const book = bookValue({ flows: [{ kind: "subscribe", amountUsd: 1_000, units: 10 }], realisedUsd: 0, open: [{ side: "long", size: 0.012, entryPrice: 100_000, leverage: 1, mid: 100_000 }] });
    /* $1,200 at 1x holds $1,200 of margin — more than the NAV: nothing may come out. */
    expect(withdrawable(book, { maxGrossExposure: 1.5 })).toBe(0);
    const flat = bookValue({ flows: [{ kind: "subscribe", amountUsd: 1_000, units: 10 }], realisedUsd: 0, open: [] });
    expect(withdrawable(flat, { maxGrossExposure: 1.5 })).toBe(900);
  });

  it("reports the record: return, drawdown, Sharpe from daily closes, hit rate", () => {
    const marks = [100, 104, 101, 108, 103, 110, 112].map((npu, day) => ({ at: `2026-11-0${day + 1}T23:00:00.000Z`, nav: npu * 10, npu }));
    const stats = fundStats({ marks, npuNow: 112, trades: [{ pnlUsd: 40 }, { pnlUsd: -10 }, { pnlUsd: 30 }], createdAt: "2026-11-01T00:00:00Z", now: Date.parse("2026-11-08T00:00:00Z") });
    expect(stats.returnPct).toBeCloseTo(12);
    expect(stats.maxDrawdownPct).toBeCloseTo((1 - 103 / 108) * 100);
    expect(stats.sharpe).not.toBeNull();
    expect(stats.volatilityPct).toBeGreaterThan(0);
    expect(stats.winRate).toBeCloseTo(2 / 3);
    expect(stats.profitFactor).toBe(7);
    expect(stats.days).toBe(7);
    expect(fundStats({ marks: marks.slice(0, 3), npuNow: 101, trades: [], createdAt: "2026-11-01T00:00:00Z", now: Date.parse("2026-11-03T00:00:00Z") }).sharpe).toBeNull();
  });

  it("buckets marks by the hour and keeps each day's last", () => {
    expect(hourBucket(Date.parse("2026-11-17T10:42:13.120Z"))).toBe("2026-11-17T10:00:00.000Z");
    const closes = dailyCloses([
      { at: "2026-11-17T01:00:00.000Z", nav: 1, npu: 100 },
      { at: "2026-11-17T23:00:00.000Z", nav: 1, npu: 101 },
      { at: "2026-11-18T05:00:00.000Z", nav: 1, npu: 99 },
    ]);
    expect(closes.map((close) => close.npu)).toEqual([101, 99]);
    expect(downsample([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([1, 4, 7, 10]);
  });
});
