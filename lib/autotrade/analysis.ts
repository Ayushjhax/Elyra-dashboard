import type { Side } from "@/lib/autotrade/rules";

/* ---------------------------------------------------------------------------
   Paper trading analysis: how the person's paper trades actually went. Pure.

   Every figure is computed from closed paper positions as recorded — fees and
   slippage included, since paper fills pay them (`PAPER_COSTS`). Nothing is
   annualised, projected or smoothed.

   A breakdown with few trades in it says more about luck than skill, so every
   group carries its count, and "sharpest timing" is named only for a window
   with at least `MIN_SAMPLE` trades. Below that the page says there is not
   enough yet, rather than crowning a window that won twice.
--------------------------------------------------------------------------- */

export const MIN_SAMPLE = 5;

export interface ClosedTrade {
  side: Side;
  /** Null for trades recorded before leverage was stored and whose rule is gone. */
  leverage: number | null;
  coin: string;
  pnlUsd: number;
  exitReason: string | null;
  openedAt: string;
  closedAt: string;
}

export interface GroupStats {
  key: string;
  label: string;
  trades: number;
  wins: number;
  /** Percent, or null with no trades. */
  winRate: number | null;
  netPnlUsd: number;
  avgPnlUsd: number | null;
}

export interface PaperAnalysis {
  overall: GroupStats & {
    losses: number;
    avgWinUsd: number | null;
    avgLossUsd: number | null;
    /** Gross wins ÷ gross losses. Null when there are no losses to divide by. */
    profitFactor: number | null;
    bestUsd: number | null;
    worstUsd: number | null;
    avgHoldMinutes: number | null;
  };
  byLeverage: GroupStats[];
  bySide: GroupStats[];
  /** Four-hour windows of the entry time, UTC. */
  byWindow: GroupStats[];
  byExit: GroupStats[];
  byCoin: GroupStats[];
  /** The window with the best net result among those with enough trades; null otherwise. */
  sharpestWindow: GroupStats | null;
  /** The leverage band with the best and the worst net result, among those with enough trades. */
  bestLeverage: GroupStats | null;
  worstLeverage: GroupStats | null;
  smallSample: boolean;
}

function stats(key: string, label: string, trades: readonly ClosedTrade[]): GroupStats {
  const wins = trades.filter((trade) => trade.pnlUsd > 0).length;
  const net = trades.reduce((sum, trade) => sum + trade.pnlUsd, 0);
  return {
    key,
    label,
    trades: trades.length,
    wins,
    winRate: trades.length === 0 ? null : (wins / trades.length) * 100,
    netPnlUsd: net,
    avgPnlUsd: trades.length === 0 ? null : net / trades.length,
  };
}

function grouped(trades: readonly ClosedTrade[], keyOf: (trade: ClosedTrade) => string, labels: Record<string, string>, order?: readonly string[]): GroupStats[] {
  const buckets = new Map<string, ClosedTrade[]>();
  for (const trade of trades) {
    const key = keyOf(trade);
    buckets.set(key, [...(buckets.get(key) ?? []), trade]);
  }
  const keys = order ?? [...buckets.keys()];
  return keys.filter((key) => buckets.has(key)).map((key) => stats(key, labels[key] ?? key, buckets.get(key) ?? []));
}

export function leverageBand(leverage: number | null): string {
  if (leverage === null) return "unknown";
  if (leverage <= 1) return "1x";
  if (leverage <= 2) return "2x";
  if (leverage <= 3) return "3x";
  return "4-5x";
}

const BAND_LABEL: Record<string, string> = { "1x": "1x", "2x": "2x", "3x": "3x", "4-5x": "4–5x", unknown: "Not recorded" };
const BAND_ORDER = ["1x", "2x", "3x", "4-5x", "unknown"] as const;

const WINDOWS = ["00", "04", "08", "12", "16", "20"] as const;
const WINDOW_LABEL: Record<string, string> = Object.fromEntries(
  WINDOWS.map((start) => [start, `${start}:00–${String(Number(start) + 4).padStart(2, "0")}:00 UTC`]),
);

const EXIT_LABEL: Record<string, string> = {
  take_profit: "Take-profit",
  stop_loss: "Stop-loss",
  exit_rule: "Exit rule",
  closed_outside_elyra: "Closed outside Elyra",
  closed_by_hand: "Closed by you",
  other: "Other",
};

function best(groups: readonly GroupStats[], direction: 1 | -1): GroupStats | null {
  const eligible = groups.filter((group) => group.trades >= MIN_SAMPLE && group.key !== "unknown");
  if (eligible.length === 0) return null;
  return eligible.reduce((top, group) => (direction * group.netPnlUsd > direction * top.netPnlUsd ? group : top));
}

export function analysePaperTrades(trades: readonly ClosedTrade[]): PaperAnalysis {
  const overall = stats("all", "All paper trades", trades);
  const winners = trades.filter((trade) => trade.pnlUsd > 0);
  const losers = trades.filter((trade) => trade.pnlUsd < 0);
  const grossWin = winners.reduce((sum, trade) => sum + trade.pnlUsd, 0);
  const grossLoss = -losers.reduce((sum, trade) => sum + trade.pnlUsd, 0);
  const holds = trades
    .map((trade) => (Date.parse(trade.closedAt) - Date.parse(trade.openedAt)) / 60_000)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0);

  const byLeverage = grouped(trades, (trade) => leverageBand(trade.leverage), BAND_LABEL, BAND_ORDER);
  const byWindow = grouped(
    trades,
    (trade) => {
      const hour = new Date(trade.openedAt).getUTCHours();
      return WINDOWS[Math.floor(hour / 4)] ?? "00";
    },
    WINDOW_LABEL,
    WINDOWS,
  );

  return {
    overall: {
      ...overall,
      losses: losers.length,
      avgWinUsd: winners.length === 0 ? null : grossWin / winners.length,
      avgLossUsd: losers.length === 0 ? null : -grossLoss / losers.length,
      profitFactor: grossLoss === 0 ? null : grossWin / grossLoss,
      bestUsd: trades.length === 0 ? null : Math.max(...trades.map((trade) => trade.pnlUsd)),
      worstUsd: trades.length === 0 ? null : Math.min(...trades.map((trade) => trade.pnlUsd)),
      avgHoldMinutes: holds.length === 0 ? null : holds.reduce((sum, minutes) => sum + minutes, 0) / holds.length,
    },
    byLeverage,
    bySide: grouped(trades, (trade) => trade.side, { long: "Long", short: "Short" }, ["long", "short"]),
    byWindow,
    byExit: grouped(trades, (trade) => (trade.exitReason !== null && trade.exitReason in EXIT_LABEL ? trade.exitReason : "other"), EXIT_LABEL),
    byCoin: grouped(trades, (trade) => trade.coin, {}).sort((a, b) => b.trades - a.trades).slice(0, 8),
    sharpestWindow: best(byWindow, 1),
    bestLeverage: best(byLeverage, 1),
    worstLeverage: best(byLeverage, -1),
    smallSample: trades.length < 20,
  };
}
