"use client";

import type { Translator } from "@/lib/i18n/translate";
import { networkName } from "@/lib/portfolio/chain";
import { networkOf } from "@/lib/portfolio/accounts";
import { networkLabel } from "@/lib/portfolio/networkLabel";
import {
  WINDOWS,
  WINDOW_MS,
  calendar,
  tradeStats,
  windowChain,
  type CurrentReading,
  type OverviewResponse,
} from "@/lib/portfolio/performance";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";
import { workbook, type Cell, type Sheet } from "@/lib/portfolio/xlsx";
import type { WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Export XLSX: the account's records as a workbook, built in the browser
   from what the page already holds — nothing is fetched for it.

   Summary (each window's return, PnL, drawdown, win rate and profit
   factor), daily closes with their flows and PnL, holdings, open positions,
   closed trades, deposits and withdrawals, and wallet transactions. Every
   money figure is a number cell in USD, so the spreadsheet can sum it; a
   figure that could not be measured is an empty cell, never a zero.
--------------------------------------------------------------------------- */

const round = (value: number | null | undefined, places = 2): Cell =>
  value === null || value === undefined || !Number.isFinite(value) ? null : Math.round(value * 10 ** places) / 10 ** places;

export function buildWorkbook(input: {
  t: Translator;
  data: OverviewResponse | null;
  snapshot: PortfolioSnapshot | null;
  activity: readonly WalletActivity[];
  current: CurrentReading | null;
  now: number;
}): Uint8Array {
  const { t, data, snapshot, activity, current, now } = input;
  const sheets: Sheet[] = [];

  const summary: Cell[][] = [[t("Window"), t("Total return %"), t("Net PnL (USD)"), t("Max drawdown %"), t("Win rate %"), t("Profit factor"), t("Closed trades"), t("Intervals left out")]];
  if (data !== null) {
    for (const window of WINDOWS) {
      const chain = windowChain(data, window, current, now);
      const stats = tradeStats(data.trades, now - WINDOW_MS[window]);
      summary.push([
        window,
        chain.points.length < 2 ? null : round(chain.returnPct * 100, 4),
        chain.points.length < 2 ? null : round(chain.pnlUsd),
        chain.points.length < 2 ? null : round(chain.maxDrawdownPct * 100, 4),
        stats.winRate === null ? null : round(stats.winRate * 100, 2),
        round(stats.profitFactor, 4),
        stats.trades,
        chain.gaps,
      ]);
    }
  }
  sheets.push({ name: t("Summary"), rows: summary });

  const daily: Cell[][] = [[t("Day (UTC)"), t("Equity (USD)"), t("Net deposits (USD)"), t("Daily PnL (USD)"), t("Deposits fully read")]];
  if (data !== null) {
    const pnlByDay = new Map(calendar(data, current, now, 400).days.map((day) => [day.day, day.pnlUsd]));
    for (const record of data.daily) {
      daily.push([record.day, round(record.equityUsd), round(record.flowUsd), round(pnlByDay.get(record.day) ?? null), record.flowsComplete ? t("Yes") : t("No")]);
    }
  }
  sheets.push({ name: t("Daily closes"), rows: daily });

  const holdings: Cell[][] = [[t("Network"), t("Asset"), t("Amount"), t("Price (USD)"), t("Value (USD)"), t("24h %"), t("Verified")]];
  for (const holding of snapshot?.spot ?? []) {
    const network = networkOf(holding);
    holdings.push([
      network === null ? holding.venue : networkName(network),
      holding.symbol,
      round(holding.quantity, 8),
      round(holding.priceUsd, 8),
      round(holding.valueUsd),
      round(holding.change24hPct, 4),
      holding.verified ? t("Yes") : t("No"),
    ]);
  }
  sheets.push({ name: t("Holdings"), rows: holdings });

  const positions: Cell[][] = [[t("Venue"), t("Market"), t("Side"), t("Size"), t("Entry (USD)"), t("Mark (USD)"), t("Unrealised PnL (USD)"), t("Leverage")]];
  for (const position of snapshot?.perps ?? []) {
    positions.push([
      position.venue,
      position.market,
      position.side === "long" ? t("Long") : t("Short"),
      round(position.size, 8),
      round(position.entryPrice, 8),
      round(position.markPrice, 8),
      round(position.unrealizedPnlUsd),
      round(position.leverage, 2),
    ]);
  }
  sheets.push({ name: t("Positions"), rows: positions });

  const trades: Cell[][] = [[t("Closed (UTC)"), t("Venue"), t("Market"), t("PnL (USD)")]];
  for (const trade of data?.trades ?? []) trades.push([trade.at, trade.venue === "hyperliquid" ? "Hyperliquid" : "Polymarket", trade.label, round(trade.pnlUsd)]);
  sheets.push({ name: t("Closed trades"), rows: trades });

  const flows: Cell[][] = [[t("Time (UTC)"), t("Network"), t("Direction"), t("Asset"), t("Amount"), t("Value (USD)"), t("Counterparty"), t("Reference")]];
  for (const flow of data?.flows ?? []) {
    flows.push([
      flow.at,
      networkLabel(flow.network),
      flow.direction === "in" ? t("In") : t("Out"),
      flow.symbol,
      round(flow.amount, 8),
      round(flow.usd),
      flow.counterparty,
      flow.reference,
    ]);
  }
  sheets.push({ name: t("Deposits & withdrawals"), rows: flows });

  const transactions: Cell[][] = [[t("Time (UTC)"), t("Network"), t("What happened"), t("Status"), t("Reference")]];
  for (const item of activity) {
    transactions.push([item.at, networkLabel(item.network ?? "solana"), item.summary?.title ?? null, item.status, item.signature]);
  }
  sheets.push({ name: t("Transactions"), rows: transactions });

  return workbook(sheets);
}

/** Saves the bytes as a file, through the browser's own download. */
export function download(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  /* Revoked after the click has been handled, not before. */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
