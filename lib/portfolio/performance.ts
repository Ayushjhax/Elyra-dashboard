import { dayOf, type FlowEvent } from "@/lib/portfolio/flows";

/* ---------------------------------------------------------------------------
   Portfolio performance — the arithmetic behind the Portfolio page.

   Every figure here is taken net of deposits and withdrawals
   (lib/portfolio/flows.ts). Between two readings of equity, the change that
   was money moving in or out is removed; what is left is performance.

   Returns are TIME-WEIGHTED: each interval's return is
       r = (E1 − E0 − F) / (E0 + F / 2)
   (Modified Dietz, flows assumed mid-interval), and a window's return is the
   product of (1 + r) less one. So a deposit halfway through changes neither
   the return nor the drawdown, which is the property a return must have to
   compare one period with another. Net PnL is the plain sum of
   (E1 − E0 − F): dollars made, not dollars added.

   An interval whose flows are unknown — a chain that could not be read, a
   read that did not reach back far enough, a token with no price — is a
   GAP. It adds nothing to the PnL or the return, and the page says how many
   there were. Guessing it as zero would put the deposit it missed into the
   performance, which is exactly what this file exists to prevent.

   Win rate and profit factor come from closed trades with a realised result:
   Hyperliquid closing fills and settled Polymarket positions. Paper trades
   are not the portfolio's money and are not counted.

   Pure and shared: the page computes every window from one response.
--------------------------------------------------------------------------- */

export type PerformanceWindow = "24h" | "7d" | "30d" | "3M" | "1Y";

export const WINDOWS: readonly PerformanceWindow[] = ["24h", "7d", "30d", "3M", "1Y"];

const DAY_MS = 86_400_000;

export const WINDOW_MS: Record<PerformanceWindow, number> = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "3M": 90 * DAY_MS,
  "1Y": 365 * DAY_MS,
};

/** Windows read from the five-minute readings rather than the daily closes. */
export function isIntraday(window: PerformanceWindow): boolean {
  return window === "24h" || window === "7d";
}

/* ---------------------------------------------------------------------------
   What the server sends (GET /api/portfolio/overview)
--------------------------------------------------------------------------- */

/** One day's recorded close. */
export interface DailyRecord {
  /** The UTC day whose close this approximates. */
  day: string;
  /** When equity was read. */
  recordedAt: string;
  /** Null when the reading was partial — a venue failed — and so is not the account's value. */
  equityUsd: number | null;
  /** Net flow since the previous record's reading; null when unknown. */
  flowUsd: number | null;
  /** False when a chain could not be read far enough back, or a flow had no price. */
  flowsComplete: boolean;
}

/** One recorded reading of equity (portfolio_snapshots). */
export interface EquityReading {
  at: string;
  equityUsd: number;
}

/** A trade with a realised result. */
export interface ClosedTrade {
  at: string;
  venue: "hyperliquid" | "polymarket";
  /** "BTC", or a prediction market's title. */
  label: string;
  /** Net of fees where the venue reports them. */
  pnlUsd: number;
}

/** A note for a person: an English template (the translation key) and its values. */
export interface OverviewNote {
  key: string;
  values?: Record<string, string | number>;
}

/** A note as plain English, for a log or a stored row. */
export function noteText(note: OverviewNote): string {
  return note.key.replace(/\{(\w+)\}/g, (whole, name: string) => String(note.values?.[name] ?? whole));
}

export interface BenchmarkPoint {
  at: string;
  close: number;
}

export interface OverviewResponse {
  error: string | null;
  /** The first day tracking recorded for this account; null before the first. */
  trackingSince: string | null;
  daily: DailyRecord[];
  readings: EquityReading[];
  /** Flows over the last seven days, valued. */
  flows: FlowEvent[];
  /** Every flow after this time was seen; before it, some may have been missed. */
  flowsCoveredSince: string | null;
  /** What could not be read. */
  flowNotes: OverviewNote[];
  trades: ClosedTrade[];
  tradeNotes: OverviewNote[];
  benchmark: { symbol: string; hourly: BenchmarkPoint[]; daily: BenchmarkPoint[] };
}

/* ---------------------------------------------------------------------------
   Chaining readings into a series
--------------------------------------------------------------------------- */

/** A reading of equity and what moved in or out since the one before it. */
export interface ChainPoint {
  at: string;
  equityUsd: number | null;
  /** Net flow since the previous point; null when unknown. Ignored on the first. */
  flowUsd: number | null;
}

export interface SeriesPoint {
  at: string;
  equityUsd: number | null;
  /** Cumulative net PnL since the window began. */
  pnlUsd: number;
  /** Cumulative time-weighted return since the window began, as a fraction. */
  returnPct: number;
  /** False when the interval ending here was a gap. */
  known: boolean;
}

export interface ChainResult {
  points: SeriesPoint[];
  pnlUsd: number;
  returnPct: number;
  /** Largest peak-to-trough fall of the return index, as a fraction (positive). */
  maxDrawdownPct: number;
  /** Intervals left out because their flows or equity were unknown. */
  gaps: number;
}

/** One interval's net PnL and return, or null when it cannot be known. */
export function intervalReturn(start: number | null, end: number | null, flow: number | null): { pnl: number; r: number } | null {
  if (start === null || end === null || flow === null) return null;
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(flow)) return null;
  const capital = start + flow / 2;
  /* An account that was empty, or emptied, has no return to speak of for
     the interval — a ratio over nothing is not a number. */
  if (capital <= 0 || start <= 0) return null;
  const pnl = end - start - flow;
  return { pnl, r: pnl / capital };
}

export function chain(input: readonly ChainPoint[]): ChainResult {
  const points: SeriesPoint[] = [];
  let pnl = 0;
  let index = 1;
  let peak = 1;
  let drawdown = 0;
  let gaps = 0;
  input.forEach((point, i) => {
    if (i === 0) {
      points.push({ at: point.at, equityUsd: point.equityUsd, pnlUsd: 0, returnPct: 0, known: point.equityUsd !== null });
      return;
    }
    const step = intervalReturn(input[i - 1].equityUsd, point.equityUsd, point.flowUsd);
    if (step === null) {
      gaps += 1;
    } else {
      pnl += step.pnl;
      index *= 1 + step.r;
      peak = Math.max(peak, index);
      drawdown = Math.max(drawdown, peak > 0 ? (peak - index) / peak : 0);
    }
    points.push({ at: point.at, equityUsd: point.equityUsd, pnlUsd: pnl, returnPct: index - 1, known: step !== null });
  });
  return { points, pnlUsd: pnl, returnPct: index - 1, maxDrawdownPct: drawdown, gaps };
}

/** The net of the flows in (after, until], or null when any of it is unknown. */
export function flowBetween(
  flows: readonly FlowEvent[],
  after: string,
  until: string,
  coveredSince: string | null,
): number | null {
  const a = Date.parse(after);
  const b = Date.parse(until);
  /* Flows before `coveredSince` may not all have been seen. */
  if (coveredSince === null || a < Date.parse(coveredSince)) return null;
  let net = 0;
  for (const flow of flows) {
    const t = Date.parse(flow.at);
    if (t <= a || t > b) continue;
    if (flow.usd === null) return null;
    net += flow.direction === "in" ? flow.usd : -flow.usd;
  }
  return net;
}

/** The account as it stands, for the provisional point at the end of every window. */
export interface CurrentReading {
  at: string;
  /** Null when the live read was partial or failed. */
  equityUsd: number | null;
}

/**
 * The chain for one window: daily closes for the long windows, the recorded
 * readings for 24h and 7d, each ending with the live reading.
 */
export function windowChain(
  data: Pick<OverviewResponse, "daily" | "readings" | "flows" | "flowsCoveredSince">,
  window: PerformanceWindow,
  current: CurrentReading | null,
  now: number,
): ChainResult {
  const since = now - WINDOW_MS[window];
  const base: ChainPoint[] = [];

  if (isIntraday(window)) {
    const readings = data.readings.filter((reading) => Date.parse(reading.at) >= since);
    readings.forEach((reading, i) => {
      base.push({
        at: reading.at,
        equityUsd: reading.equityUsd,
        flowUsd: i === 0 ? 0 : flowBetween(data.flows, readings[i - 1].at, reading.at, data.flowsCoveredSince),
      });
    });
  } else {
    const records = data.daily.filter((record) => Date.parse(record.recordedAt) >= since);
    for (const record of records) {
      base.push({ at: record.recordedAt, equityUsd: record.equityUsd, flowUsd: record.flowsComplete ? record.flowUsd : null });
    }
  }

  if (current !== null && current.equityUsd !== null) {
    const last = base.at(-1);
    if (last === undefined) {
      base.push({ at: current.at, equityUsd: current.equityUsd, flowUsd: 0 });
    } else if (Date.parse(current.at) > Date.parse(last.at)) {
      base.push({
        at: current.at,
        equityUsd: current.equityUsd,
        flowUsd: flowBetween(data.flows, last.at, current.at, data.flowsCoveredSince),
      });
    }
  }

  return chain(base);
}

/** The return since tracking began, chained over every daily close and the live reading. */
export function allTimeReturn(data: Pick<OverviewResponse, "daily" | "flows" | "flowsCoveredSince">, current: CurrentReading | null): number | null {
  const base: ChainPoint[] = data.daily.map((record) => ({
    at: record.recordedAt,
    equityUsd: record.equityUsd,
    flowUsd: record.flowsComplete ? record.flowUsd : null,
  }));
  const last = base.at(-1);
  if (current !== null && current.equityUsd !== null && last !== undefined && Date.parse(current.at) > Date.parse(last.at)) {
    base.push({ at: current.at, equityUsd: current.equityUsd, flowUsd: flowBetween(data.flows, last.at, current.at, data.flowsCoveredSince) });
  }
  if (base.length < 2) return null;
  const result = chain(base);
  return result.gaps === base.length - 1 ? null : result.returnPct;
}

/* ---------------------------------------------------------------------------
   Benchmark
--------------------------------------------------------------------------- */

/** The benchmark's return over the window at each of its points, as a fraction. */
export function benchmarkSeries(points: readonly BenchmarkPoint[], since: number): Array<{ at: string; returnPct: number }> {
  const inside = points.filter((point) => Date.parse(point.at) >= since && point.close > 0);
  if (inside.length < 2) return [];
  const first = inside[0].close;
  return inside.map((point) => ({ at: point.at, returnPct: point.close / first - 1 }));
}

/* ---------------------------------------------------------------------------
   Trades
--------------------------------------------------------------------------- */

export interface TradeStats {
  trades: number;
  wins: number;
  losses: number;
  /** Fraction of trades that made money; null with no trades. */
  winRate: number | null;
  grossProfitUsd: number;
  grossLossUsd: number;
  /** Gross profit over gross loss; null with no losing trade (or none at all). */
  profitFactor: number | null;
}

export function tradeStats(trades: readonly ClosedTrade[], since: number): TradeStats {
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let count = 0;
  for (const trade of trades) {
    if (Date.parse(trade.at) < since || !Number.isFinite(trade.pnlUsd)) continue;
    count += 1;
    if (trade.pnlUsd > 0) {
      wins += 1;
      grossProfit += trade.pnlUsd;
    } else if (trade.pnlUsd < 0) {
      losses += 1;
      grossLoss += -trade.pnlUsd;
    }
  }
  return {
    trades: count,
    wins,
    losses,
    winRate: count === 0 ? null : wins / count,
    grossProfitUsd: grossProfit,
    grossLossUsd: grossLoss,
    profitFactor: grossLoss === 0 ? null : grossProfit / grossLoss,
  };
}

/* ---------------------------------------------------------------------------
   Daily PnL calendar
--------------------------------------------------------------------------- */

export interface CalendarDay {
  day: string;
  /** Null when there is no record for the day, or its flows or the day before are unknown. */
  pnlUsd: number | null;
  /** The day so far, from the live reading. */
  provisional: boolean;
}

export interface CalendarSummary {
  profitableDays: number;
  losingDays: number;
  best: CalendarDay | null;
  worst: CalendarDay | null;
  /** Days in the period with no known PnL. */
  unknownDays: number;
}

function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/**
 * The last `days` UTC days, oldest first, each with its PnL net of flows. A
 * day's PnL needs that day's close and the close of the day before it; a
 * missing neighbour leaves the day unknown rather than folding two days
 * into one square.
 */
export function calendar(
  data: Pick<OverviewResponse, "daily" | "flows" | "flowsCoveredSince">,
  current: CurrentReading | null,
  now: number,
  days = 90,
): { days: CalendarDay[]; summary: CalendarSummary } {
  const byDay = new Map(data.daily.map((record) => [record.day, record]));
  const today = new Date(now).toISOString().slice(0, 10);
  const out: CalendarDay[] = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(Date.parse(`${today}T00:00:00Z`) - i * DAY_MS).toISOString().slice(0, 10);
    if (day === today) {
      /* Today so far: the live reading against yesterday's close. */
      const yesterday = byDay.get(previousDay(day));
      const step =
        yesterday === undefined || current === null
          ? null
          : intervalReturn(yesterday.equityUsd, current.equityUsd, flowBetween(data.flows, yesterday.recordedAt, current.at, data.flowsCoveredSince));
      out.push({ day, pnlUsd: step?.pnl ?? null, provisional: true });
      continue;
    }
    const record = byDay.get(day);
    const before = byDay.get(previousDay(day));
    const step =
      record === undefined || before === undefined
        ? null
        : intervalReturn(before.equityUsd, record.equityUsd, record.flowsComplete ? record.flowUsd : null);
    out.push({ day, pnlUsd: step?.pnl ?? null, provisional: false });
  }

  let profitable = 0;
  let losing = 0;
  let unknown = 0;
  let best: CalendarDay | null = null;
  let worst: CalendarDay | null = null;
  for (const entry of out) {
    if (entry.pnlUsd === null) {
      unknown += 1;
      continue;
    }
    if (entry.pnlUsd > 0) profitable += 1;
    else if (entry.pnlUsd < 0) losing += 1;
    if (best === null || entry.pnlUsd > (best.pnlUsd ?? -Infinity)) best = entry;
    if (worst === null || entry.pnlUsd < (worst.pnlUsd ?? Infinity)) worst = entry;
  }
  return {
    days: out,
    summary: {
      profitableDays: profitable,
      losingDays: losing,
      best: best !== null && (best.pnlUsd ?? 0) > 0 ? best : null,
      worst: worst !== null && (worst.pnlUsd ?? 0) < 0 ? worst : null,
      unknownDays: unknown,
    },
  };
}

/** How strongly a day is coloured: 0 for flat or unknown, 1–4 by its size against the period's largest move. */
export function intensity(pnl: number | null, largest: number): 0 | 1 | 2 | 3 | 4 {
  if (pnl === null || pnl === 0 || largest <= 0) return 0;
  const share = Math.abs(pnl) / largest;
  if (share > 0.75) return 4;
  if (share > 0.4) return 3;
  if (share > 0.15) return 2;
  return 1;
}

/** The day a record approximates the close of, for a reading taken at `at` after midnight. */
export function closeDayOf(at: string): string {
  return new Date(Date.parse(at) - DAY_MS).toISOString().slice(0, 10);
}

export { dayOf };
