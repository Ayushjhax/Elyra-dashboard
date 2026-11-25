import { netPnl, PAPER_COSTS, type Side } from "@/lib/autotrade/rules";

/* ---------------------------------------------------------------------------
   Looking back at a strategy's own trades: what it needed in capital, what it
   booked, and what a different stop-loss or take-profit would have done.
   Pure — the reads are lib/autotrade/reviewRead.ts — so every rule here is
   tested.

   Capital. A rule has no capital of its own: it opens a size at a leverage,
   and the margin comes from the account. So the capital a strategy needed
   is what its trades required, in order: the margin of what was open, less
   what the closed ones had already earned (gains fund later margin; losses
   need topping up). Its running peak is the capital put in — the first
   day's peak is the initial capital, and each new peak after it is money
   that had to be added that day. An AI fund has real deposits instead, and
   uses them (`fundCapital`).

   What-if. Each closed trade is replayed on Hyperliquid's candles from its
   entry with the exits asked for, and isolated margin's liquidation as the
   backstop a missing stop leaves. A trade whose own exit was a stop or a
   take-profit runs until the new exits, a liquidation or now; one closed for
   any other reason (by hand, by its exit rule, outside Elyra) still closes
   then, unless the new exits fire first. Partial closes stand only if they
   came before the replayed exit. Candles cannot say which extreme came
   first: when one bar spans two exits, the worse one is taken — as
   `paperExit` does — so a what-if is never flattered by the bar's order.

   Like the record it is compared with, a replay counts the taker fee
   (`PAPER_COSTS`) and not funding; funding over the extra time a trade
   would have been held is estimated separately (`fundingOver`).
--------------------------------------------------------------------------- */

export interface Bar {
  openTime: number;
  closeTime: number;
  high: number;
  low: number;
  close: number;
}

export interface PartialFill {
  at: number;
  size: number;
  pnlUsd: number;
}

export interface ReviewTrade {
  id: string;
  coin: string;
  side: Side;
  entryPrice: number;
  /** The size it opened at; partial closes take from it. */
  originalSize: number;
  leverage: number;
  takeProfit: number;
  stopLoss: number;
  openedAt: number;
  /** Null while still open. */
  closedAt: number | null;
  exitPrice: number | null;
  exitReason: string | null;
  /** The whole trade's result after fees, partial closes included. */
  realisedUsd: number | null;
  partials: PartialFill[];
}

const cents = (value: number): number => Math.round(value * 100) / 100;

/* ---------------------------------------------------------------------------
   Liquidation
--------------------------------------------------------------------------- */

/**
 * Where an isolated position is liquidated, by Hyperliquid's own formula:
 * equity falls to the maintenance margin, which is half the initial margin
 * at the market's maximum leverage. At 1x a long cannot be liquidated.
 */
export function liquidationPrice(side: Side, entry: number, leverage: number, maxLeverage: number): number {
  const lev = Math.max(1, leverage);
  const maintenance = 1 / (2 * Math.max(lev, maxLeverage));
  return side === "long" ? Math.max(0, (entry * (1 - 1 / lev)) / (1 - maintenance)) : (entry * (1 + 1 / lev)) / (1 + maintenance);
}

/* ---------------------------------------------------------------------------
   Capital
--------------------------------------------------------------------------- */

export interface CapitalStep {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  amountUsd: number;
}

export interface CapitalRecord {
  /** The first day's peak: what had to be there to start. */
  initialUsd: number;
  initialDay: string | null;
  /** Each later day the need rose to a new peak, and by how much. */
  additions: CapitalStep[];
  /** Initial plus additions: everything the strategy ever needed at once. */
  totalUsd: number;
  realisedUsd: number;
  /** Realised over the capital put in, percent; null with no capital. */
  returnPct: number | null;
  /** The most margin open at one time. */
  peakMarginUsd: number;
}

const day = (at: number): string => new Date(at).toISOString().slice(0, 10);

/** Margin a size held at an entry and leverage. */
export const marginOf = (size: number, entry: number, leverage: number): number => (size * entry) / Math.max(1, leverage);

/**
 * What a run of trades needed, from its own order of events. A trade still
 * open holds its margin; its unrealised result is not counted as earned.
 */
export function capitalRecord(trades: readonly ReviewTrade[]): CapitalRecord {
  type Event = { at: number; margin: number; realised: number };
  const events: Event[] = [];
  for (const trade of trades) {
    const full = marginOf(trade.originalSize, trade.entryPrice, trade.leverage);
    events.push({ at: trade.openedAt, margin: full, realised: 0 });
    let left = trade.originalSize;
    let partialPnl = 0;
    for (const partial of trade.partials) {
      if (trade.closedAt !== null && partial.at > trade.closedAt) continue;
      const size = Math.min(left, partial.size);
      left -= size;
      partialPnl += partial.pnlUsd;
      events.push({ at: partial.at, margin: -marginOf(size, trade.entryPrice, trade.leverage), realised: partial.pnlUsd });
    }
    if (trade.closedAt !== null) {
      events.push({ at: trade.closedAt, margin: -marginOf(left, trade.entryPrice, trade.leverage), realised: (trade.realisedUsd ?? 0) - partialPnl });
    }
  }
  /* Closes before opens at the same instant: margin a close frees is there for the open. */
  events.sort((a, b) => a.at - b.at || a.margin - b.margin);

  let open = 0;
  let earned = 0;
  let peak = 0;
  let peakMargin = 0;
  let firstDay: string | null = null;
  let initial = 0;
  const byDay = new Map<string, number>();
  for (const event of events) {
    open += event.margin;
    earned += event.realised;
    peakMargin = Math.max(peakMargin, open);
    const need = open - earned;
    const today = day(event.at);
    firstDay ??= today;
    if (need > peak + 1e-9) {
      const step = need - peak;
      peak = need;
      if (today === firstDay) initial += step;
      else byDay.set(today, (byDay.get(today) ?? 0) + step);
    }
  }
  const additions = [...byDay.entries()].map(([d, amount]) => ({ day: d, amountUsd: cents(amount) })).filter((step) => step.amountUsd > 0);
  const total = cents(initial) + additions.reduce((sum, step) => sum + step.amountUsd, 0);
  const realised = trades.reduce((sum, trade) => sum + (trade.closedAt !== null ? (trade.realisedUsd ?? 0) : trade.partials.reduce((s, p) => s + p.pnlUsd, 0)), 0);
  return {
    initialUsd: cents(initial),
    initialDay: firstDay,
    additions,
    totalUsd: cents(total),
    realisedUsd: cents(realised),
    returnPct: total > 0 ? Math.round((realised / total) * 1000) / 10 : null,
    peakMarginUsd: cents(peakMargin),
  };
}

/** An AI fund's capital is its real deposits and withdrawals, not a derivation. */
export function fundCapital(
  flows: readonly { kind: "subscribe" | "redeem"; amountUsd: number; at: number }[],
  realisedUsd: number,
): { initialUsd: number; initialDay: string | null; additions: CapitalStep[]; withdrawals: CapitalStep[]; totalUsd: number; realisedUsd: number; returnPct: number | null } {
  const ordered = [...flows].sort((a, b) => a.at - b.at);
  const first = ordered.find((flow) => flow.kind === "subscribe");
  const initialDay = first === undefined ? null : day(first.at);
  const sumByDay = (kind: "subscribe" | "redeem", skipFirst: boolean) => {
    const map = new Map<string, number>();
    for (const flow of ordered) {
      if (flow.kind !== kind || (skipFirst && flow === first)) continue;
      map.set(day(flow.at), (map.get(day(flow.at)) ?? 0) + flow.amountUsd);
    }
    return [...map.entries()].map(([d, amount]) => ({ day: d, amountUsd: cents(amount) }));
  };
  const initial = first?.amountUsd ?? 0;
  const additions = sumByDay("subscribe", true);
  const total = cents(initial + additions.reduce((sum, step) => sum + step.amountUsd, 0));
  return {
    initialUsd: cents(initial),
    initialDay,
    additions,
    withdrawals: sumByDay("redeem", false),
    totalUsd: total,
    realisedUsd: cents(realisedUsd),
    returnPct: total > 0 ? Math.round((realisedUsd / total) * 1000) / 10 : null,
  };
}

/* ---------------------------------------------------------------------------
   What-if
--------------------------------------------------------------------------- */

/** An exit as asked: the one the trade had, none at all, or a percent from the entry. */
export type ExitChoice = "recorded" | "none" | number;

export interface Scenario {
  stopLoss: ExitChoice;
  takeProfit: ExitChoice;
}

export type ReplayKind = "take_profit" | "stop_loss" | "liquidated" | "as_recorded" | "still_open";

export interface Replay {
  id: string;
  coin: string;
  side: Side;
  kind: ReplayKind;
  /** When the replayed trade ends; null while it would still be open. */
  exitAt: number | null;
  exitPrice: number;
  /** The replayed result after fees, partial closes that stood included; marked to now while open. */
  pnlUsd: number;
  /** The recorded result, for the same trade. */
  actualUsd: number;
  /** The deepest the replayed trade went against its entry, in dollars (≤ 0). */
  worstUsd: number;
  /** When the replayed trade is held past its recorded close, from and to — for funding. */
  heldLonger: { from: number; to: number; size: number } | null;
  liquidationPrice: number;
}

/** The exit price a choice gives, or null for none. */
export function levelFor(choice: ExitChoice, recorded: number, side: Side, entry: number, kind: "stop" | "target"): number | null {
  if (choice === "none") return null;
  if (choice === "recorded") return recorded;
  const sign = (side === "long") === (kind === "target") ? 1 : -1;
  return entry * (1 + (sign * choice) / 100);
}

/** Whether an exit is part of the levels being changed — a stop or a take-profit — or a fixed event. */
export const replacedExit = (reason: string | null): boolean => reason === "stop_loss" || reason === "take_profit";

/**
 * One closed trade, replayed. `bars` are the coin's candles in time order;
 * `mark` is the price at `now`, for a trade the replay leaves open.
 */
export function replay(trade: ReviewTrade, bars: readonly Bar[], scenario: Scenario, mark: number, maxLeverage: number, now: number): Replay {
  const long = trade.side === "long";
  const entry = trade.entryPrice;
  const stop = levelFor(scenario.stopLoss, trade.stopLoss, trade.side, entry, "stop");
  const target = levelFor(scenario.takeProfit, trade.takeProfit, trade.side, entry, "target");
  const liq = liquidationPrice(trade.side, entry, trade.leverage, maxLeverage);
  /* The adverse exit that fires first: whichever of the stop and the liquidation is nearer the entry. */
  const adverse: { price: number; kind: "stop_loss" | "liquidated" } =
    stop !== null && (long ? stop >= liq : stop <= liq) ? { price: stop, kind: "stop_loss" } : { price: liq, kind: "liquidated" };
  const fixedEnd = trade.closedAt !== null && !replacedExit(trade.exitReason) ? trade.closedAt : null;
  const actual = trade.realisedUsd ?? 0;

  const taken = (at: number) => trade.partials.filter((partial) => partial.at <= at);
  const exposedAt = (at: number) => Math.max(0, trade.originalSize - taken(at).reduce((sum, partial) => sum + partial.size, 0));
  const partialPnl = (at: number) => taken(at).reduce((sum, partial) => sum + partial.pnlUsd, 0);

  let worst = 0;
  const end = (kind: ReplayKind, at: number | null, price: number, pnl: number): Replay => {
    const recordedEnd = trade.closedAt;
    const to = at ?? now;
    const longer = recordedEnd !== null && to > recordedEnd ? { from: recordedEnd, to, size: exposedAt(recordedEnd) } : null;
    return {
      id: trade.id,
      coin: trade.coin,
      side: trade.side,
      kind,
      exitAt: at,
      exitPrice: price,
      pnlUsd: cents(pnl),
      actualUsd: cents(actual),
      worstUsd: cents(worst),
      heldLonger: kind === "as_recorded" ? null : longer,
      liquidationPrice: liq,
    };
  };

  for (const bar of bars) {
    if (bar.closeTime <= trade.openedAt) continue;
    if (fixedEnd !== null && bar.openTime >= fixedEnd) break;
    const at = Math.max(bar.openTime, trade.openedAt);
    const size = exposedAt(at);
    const hitAdverse = long ? bar.low <= adverse.price : bar.high >= adverse.price;
    /* The deepest it went — no deeper than where it was stopped or liquidated, since it was gone after. */
    const reached = hitAdverse ? adverse.price : long ? bar.low : bar.high;
    worst = Math.min(worst, (long ? reached - entry : entry - reached) * size);
    if (hitAdverse) {
      const pnl =
        adverse.kind === "liquidated"
          ? -marginOf(size, entry, trade.leverage) - (size * entry * PAPER_COSTS.takerFeePct) / 100
          : netPnl(trade.side, size, entry, adverse.price);
      return end(adverse.kind, at, adverse.price, partialPnl(at) + pnl);
    }
    if (target !== null && (long ? bar.high >= target : bar.low <= target)) {
      return end("take_profit", at, target, partialPnl(at) + netPnl(trade.side, size, entry, target));
    }
  }

  if (fixedEnd !== null) return end("as_recorded", fixedEnd, trade.exitPrice ?? entry, actual);
  return end("still_open", null, mark, partialPnl(now) + netPnl(trade.side, exposedAt(now), entry, mark));
}

export interface WhatIfSummary {
  trades: number;
  actualUsd: number;
  /** The replayed trades that would have closed, and their result. */
  bookedUsd: number;
  /** The ones still open, marked to now. */
  markedUsd: number;
  /** Booked plus marked: the whole replayed result, now. */
  totalUsd: number;
  counts: Record<ReplayKind, number>;
  /** Of the trades whose recorded exit was a stop or a take-profit, how many the bars replay the same way with those exits. */
  calibration: { agree: number; of: number };
  worstUsd: number;
}

export function summarise(replays: readonly Replay[], calibration: { agree: number; of: number }): WhatIfSummary {
  const counts: Record<ReplayKind, number> = { take_profit: 0, stop_loss: 0, liquidated: 0, as_recorded: 0, still_open: 0 };
  let booked = 0;
  let marked = 0;
  let actual = 0;
  let worst = 0;
  for (const entry of replays) {
    counts[entry.kind] += 1;
    actual += entry.actualUsd;
    if (entry.kind === "still_open") marked += entry.pnlUsd;
    else booked += entry.pnlUsd;
    worst = Math.min(worst, entry.worstUsd);
  }
  return {
    trades: replays.length,
    actualUsd: cents(actual),
    bookedUsd: cents(booked),
    markedUsd: cents(marked),
    totalUsd: cents(booked + marked),
    counts,
    calibration,
    worstUsd: cents(worst),
  };
}

/** Whether replaying a trade with its own exits lands where it really did — the bars' word against the record. */
export function agreesWithRecord(trade: ReviewTrade, bars: readonly Bar[], maxLeverage: number): boolean | null {
  if (!replacedExit(trade.exitReason)) return null;
  const again = replay(trade, bars, { stopLoss: "recorded", takeProfit: "recorded" }, trade.exitPrice ?? trade.entryPrice, maxLeverage, trade.closedAt ?? trade.openedAt);
  return again.kind === trade.exitReason;
}

/**
 * Funding over the time a replayed trade is held past its recorded close,
 * from Hyperliquid's hourly rates: a long pays a positive rate, a short
 * receives it. Notional is the size at each hour's price. Positive is
 * received.
 */
export function fundingOver(
  held: { from: number; to: number; size: number },
  side: Side,
  rates: readonly { time: number; rate: number }[],
  bars: readonly Bar[],
): number {
  let total = 0;
  let index = 0;
  for (const { time, rate } of rates) {
    if (time <= held.from || time > held.to) continue;
    while (index < bars.length - 1 && bars[index].closeTime < time) index += 1;
    const price = bars[index]?.close;
    if (price === undefined) continue;
    const paid = rate * held.size * price;
    total += side === "long" ? -paid : paid;
  }
  return cents(total);
}

/** The finest of Hyperliquid's intervals whose 5,000-bar window reaches back to `since`. */
export function intervalFor(since: number, now: number): "15m" | "1h" | "4h" | "1d" | null {
  const span = now - since;
  const steps: Array<["15m" | "1h" | "4h" | "1d", number]> = [
    ["15m", 15 * 60_000],
    ["1h", 3_600_000],
    ["4h", 4 * 3_600_000],
    ["1d", 86_400_000],
  ];
  for (const [name, ms] of steps) if (span / ms <= 4_900) return name;
  return null;
}
