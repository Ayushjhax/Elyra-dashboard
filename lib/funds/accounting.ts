import { netPnl, type Side } from "@/lib/autotrade/rules";
import { FUND_LIMITS } from "@/lib/funds/policy";
import type { FundBook, FundMarkPoint, FundStats } from "@/lib/funds/types";

/* ---------------------------------------------------------------------------
   Fund accounting. Pure.

   ── Units, so a return is the manager's, not the deposit's ──────────────

   Capital comes in and goes out at the NAV per unit (NPU) of the moment:
   $1,000 into a fund at NPU 125 buys 8 units. NAV moves with the book; NPU
   moves only with performance. Every return Elyra shows is NPU's — a
   time-weighted return — so adding money never reads as gain, and taking
   it out never reads as loss. A fund's first unit is worth 100.

   ── The mark is conservative ────────────────────────────────────────────

   NAV = cash (capital in − capital out + realised) + unrealised, where an
   open position is marked at the mid AFTER the taker fee on both legs
   (`netPnl`) — what closing it now would leave, not what the screen shows
   before costs. A position with no live price is marked at its entry and
   the book says so (`stale`), rather than at a guess.
--------------------------------------------------------------------------- */

export interface FlowLike {
  kind: "subscribe" | "redeem";
  amountUsd: number;
  units: number;
}

export interface OpenLike {
  side: Side;
  size: number;
  entryPrice: number;
  leverage: number;
  /** The live mid, or null when none could be read. */
  mid: number | null;
}

export function bookValue(input: { flows: readonly FlowLike[]; realisedUsd: number; open: readonly OpenLike[] }): FundBook {
  let contributed = 0;
  let withdrawn = 0;
  let units = 0;
  for (const flow of input.flows) {
    if (flow.kind === "subscribe") {
      contributed += flow.amountUsd;
      units += flow.units;
    } else {
      withdrawn += flow.amountUsd;
      units -= flow.units;
    }
  }
  let unrealised = 0;
  let gross = 0;
  let margin = 0;
  let stale = false;
  for (const position of input.open) {
    const mark = position.mid ?? position.entryPrice;
    if (position.mid === null) stale = true;
    unrealised += netPnl(position.side, position.size, position.entryPrice, mark);
    gross += position.size * mark;
    margin += (position.size * position.entryPrice) / Math.max(1, position.leverage);
  }
  const cash = contributed - withdrawn + input.realisedUsd;
  const nav = cash + unrealised;
  /* Units below a millionth are dust left by rounding, not holdings. */
  const live = units > 1e-6 ? units : 0;
  return {
    navUsd: nav,
    cashUsd: cash,
    unrealisedUsd: unrealised,
    realisedUsd: input.realisedUsd,
    contributedUsd: contributed,
    withdrawnUsd: withdrawn,
    units: live,
    npu: live > 0 ? Math.max(nav / live, 1e-9) : FUND_LIMITS.startingNpu,
    grossUsd: gross,
    marginUsd: margin,
    openPositions: input.open.length,
    stale,
  };
}

/** Units an amount buys or redeems at a NAV per unit. */
export function unitsFor(amountUsd: number, npu: number): number {
  return amountUsd / npu;
}

/** The UTC day of an instant, as YYYY-MM-DD. */
export function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** The hour an instant falls in, as the ISO time it starts — a mark's bucket. */
export function hourBucket(at: number): string {
  const date = new Date(at);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

/** Fall from the high, and today's change, both per unit, in percent. */
export function riskMarks(npu: number, highWaterMark: number, dayStartNpu: number): { drawdownPct: number; todayPct: number } {
  const high = Math.max(highWaterMark, npu);
  return {
    drawdownPct: high > 0 ? Math.max(0, (1 - npu / high) * 100) : 0,
    todayPct: dayStartNpu > 0 ? (npu / dayStartNpu - 1) * 100 : 0,
  };
}

/** The last mark of each UTC day, oldest first. */
export function dailyCloses(marks: readonly FundMarkPoint[]): FundMarkPoint[] {
  const byDay = new Map<string, FundMarkPoint>();
  for (const mark of [...marks].sort((a, b) => a.at.localeCompare(b.at))) byDay.set(mark.at.slice(0, 10), mark);
  return [...byDay.values()];
}

/** At most `count` points, evenly spaced, always keeping the last. */
export function downsample<T>(points: readonly T[], count: number): T[] {
  if (points.length <= count) return [...points];
  const step = (points.length - 1) / (count - 1);
  const out: T[] = [];
  for (let index = 0; index < count; index += 1) out.push(points[Math.round(index * step)]);
  return out;
}

/**
 * The record: return and drawdown per unit over every mark, volatility and
 * Sharpe from daily closes (risk-free rate zero, crypto's 365-day year),
 * and the closed trades' hit rate and profit factor.
 */
export function fundStats(input: {
  marks: readonly FundMarkPoint[];
  /** The book's NPU now, which may be newer than the last mark. */
  npuNow: number;
  trades: readonly { pnlUsd: number }[];
  createdAt: string;
  now: number;
}): FundStats {
  const series = [...input.marks].sort((a, b) => a.at.localeCompare(b.at)).map((mark) => mark.npu);
  series.push(input.npuNow);

  let high: number = FUND_LIMITS.startingNpu;
  let maxDrawdown = 0;
  for (const npu of series) {
    high = Math.max(high, npu);
    maxDrawdown = Math.max(maxDrawdown, (1 - npu / high) * 100);
  }

  const closes = dailyCloses(input.marks).map((mark) => mark.npu);
  const returns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) returns.push(closes[index] / closes[index - 1] - 1);
  let volatilityPct: number | null = null;
  let sharpe: number | null = null;
  if (returns.length >= 5) {
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
    const deviation = Math.sqrt(variance);
    volatilityPct = deviation * Math.sqrt(365) * 100;
    sharpe = deviation > 0 ? (mean / deviation) * Math.sqrt(365) : null;
  }

  const pnls = input.trades.map((trade) => trade.pnlUsd).filter(Number.isFinite);
  const wins = pnls.filter((pnl) => pnl > 0);
  const losses = pnls.filter((pnl) => pnl < 0);
  const lost = -losses.reduce((sum, pnl) => sum + pnl, 0);
  return {
    returnPct: (input.npuNow / FUND_LIMITS.startingNpu - 1) * 100,
    maxDrawdownPct: maxDrawdown,
    volatilityPct,
    sharpe,
    days: Math.max(0, Math.floor((input.now - Date.parse(input.createdAt)) / 86_400_000)),
    trades: pnls.length,
    winRate: pnls.length === 0 ? null : wins.length / pnls.length,
    profitFactor: lost > 0 ? wins.reduce((sum, pnl) => sum + pnl, 0) / lost : null,
    netPnlUsd: pnls.reduce((sum, pnl) => sum + pnl, 0),
    bestUsd: pnls.length === 0 ? null : Math.max(...pnls),
    worstUsd: pnls.length === 0 ? null : Math.min(...pnls),
  };
}

/** How much may come out while the book stays inside the charter, in USD. */
export function withdrawable(book: FundBook, charter: { maxGrossExposure: number }): number {
  /* NAV must cover the margin held, keep gross within the limit, and stay
     at the fund's minimum — beyond that, winding down is the way out. */
  const floor = Math.max(FUND_LIMITS.minCapitalUsd, book.marginUsd, book.grossUsd / charter.maxGrossExposure);
  return Math.max(0, book.navUsd - floor);
}
