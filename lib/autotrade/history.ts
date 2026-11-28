import { analysePaperTrades, type ClosedTrade, type PaperAnalysis } from "@/lib/autotrade/analysis";
import { PAPER_COSTS, type RuleMode } from "@/lib/autotrade/rules";
import type { RuleView, TradeView } from "@/lib/autotrade/types";

/* ---------------------------------------------------------------------------
   The Automation drawer's trade history and its analysis, from ONE set of
   trades. The history's filters choose the trades; the analysis reads the
   closed paper trades among exactly those, so the two can never disagree.
   Pure.

   Modeled costs restate what the paper engine charged (`PAPER_COSTS`): the
   taker fee on every fill, and the slippage `paperFill` moved each fill's
   price by. They are already inside the recorded result — shown, never
   subtracted twice. A live trade paid Hyperliquid's own fees, which are not
   modeled here.
--------------------------------------------------------------------------- */

export interface HistoryFilters {
  /** A market's coin, or every market. */
  coin: string;
  /** A closed trade's exit reason, "open", "failed", or every outcome. */
  outcome: string;
  mode: RuleMode | "all";
}

export const ALL = "all";
export const NO_FILTERS: HistoryFilters = { coin: ALL, outcome: ALL, mode: ALL };

/** What happened to a trade, as the outcome filter names it. */
export function outcomeOf(trade: TradeView): string {
  if (trade.status === "closed") return trade.exitReason ?? "other";
  if (trade.status === "failed") return "failed";
  return "open";
}

export function filterTrades(trades: readonly TradeView[], filters: HistoryFilters): TradeView[] {
  return trades.filter(
    (trade) =>
      (filters.coin === ALL || trade.coin === filters.coin) &&
      (filters.mode === ALL || trade.mode === filters.mode) &&
      (filters.outcome === ALL || outcomeOf(trade) === filters.outcome),
  );
}

/** The values each filter can take, from the trades there are — never an option that matches nothing. */
export function filterChoices(trades: readonly TradeView[]): { coins: string[]; outcomes: string[]; modes: RuleMode[] } {
  const unique = <T,>(values: T[]) => [...new Set(values)];
  return {
    coins: unique(trades.map((trade) => trade.coin)).sort(),
    outcomes: unique(trades.map(outcomeOf)),
    modes: unique(trades.map((trade) => trade.mode)),
  };
}

/**
 * The closed paper trades among `trades`, as the analysis reads them. A
 * trade recorded before leverage was stored takes its rule's, as the server's
 * own analysis does; with neither it is "not recorded".
 */
export function closedPaperTrades(trades: readonly TradeView[], rules: readonly Pick<RuleView, "id" | "leverage">[]): ClosedTrade[] {
  const ruleLeverage = new Map(rules.map((rule) => [rule.id, rule.leverage]));
  return trades
    .filter((trade) => trade.mode === "paper" && trade.status === "closed" && trade.closedAt !== null && trade.realisedPnlUsd !== null)
    .map((trade) => ({
      side: trade.side,
      leverage: trade.leverage ?? (trade.ruleId !== null ? (ruleLeverage.get(trade.ruleId) ?? null) : null),
      coin: trade.coin,
      pnlUsd: trade.realisedPnlUsd as number,
      exitReason: trade.exitReason,
      openedAt: trade.openedAt,
      closedAt: trade.closedAt as string,
    }));
}

/** The analysis of the history's own trades; null when none of them is a closed paper trade. */
export function analyseHistory(trades: readonly TradeView[], rules: readonly Pick<RuleView, "id" | "leverage">[]): PaperAnalysis | null {
  const closed = closedPaperTrades(trades, rules);
  return closed.length === 0 ? null : analysePaperTrades(closed);
}

export interface ModeledCosts {
  feesUsd: number;
  slippageUsd: number;
  totalUsd: number;
}

/**
 * What a paper trade's fills paid under `PAPER_COSTS`, so far: the entry,
 * every partial close and — once closed — the final exit. Null for a live
 * trade, whose fees are Hyperliquid's.
 */
export function paperCosts(trade: TradeView): ModeledCosts | null {
  if (trade.mode !== "paper") return null;
  const fee = PAPER_COSTS.takerFeePct / 100;
  const slip = PAPER_COSTS.slippagePct / 100;
  const opened = trade.originalSize ?? trade.size;
  const exits = [
    ...(trade.partialCloses ?? []).map((part) => ({ size: part.size, price: part.price })),
    ...(trade.status === "closed" && trade.exitPrice !== null ? [{ size: trade.size, price: trade.exitPrice }] : []),
  ];

  /* The entry paid against the mid it was sent at, when that was recorded;
     otherwise the modeled move, undone from the fill. */
  const long = trade.side === "long";
  const entryMid =
    trade.expectedPrice !== null && trade.expectedPrice !== undefined ? trade.expectedPrice : trade.entryPrice / (1 + (long ? slip : -slip));
  const entrySlippage = opened * Math.abs(trade.entryPrice - entryMid);
  /* An exit sells a long and buys back a short: its fill is the mid moved against the trader. */
  const exitSlippage = exits.reduce((sum, leg) => sum + leg.size * Math.abs(leg.price - leg.price / (1 + (long ? -slip : slip))), 0);

  const feesUsd = opened * trade.entryPrice * fee + exits.reduce((sum, leg) => sum + leg.size * leg.price * fee, 0);
  const slippageUsd = entrySlippage + exitSlippage;
  return { feesUsd, slippageUsd, totalUsd: feesUsd + slippageUsd };
}

/** How long a trade has been, or was, open: whole minutes, for the reader to put in words. */
export function heldMinutes(trade: Pick<TradeView, "openedAt" | "closedAt">, now: number | null): number | null {
  const end = trade.closedAt !== null ? Date.parse(trade.closedAt) : now;
  if (end === null) return null;
  const minutes = Math.floor((end - Date.parse(trade.openedAt)) / 60_000);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}
