import "server-only";

import type { ClosedTrade, OverviewNote } from "@/lib/portfolio/performance";
import { providerFetch } from "@/lib/providers/http";
import { polymarketClosedPositions } from "@/lib/providers/polymarket-account";

/* ---------------------------------------------------------------------------
   Closed trades with a realised result — what a win rate is counted over.

   Hyperliquid: closing fills from the account's most recent 2,000
   (`userFills`, aggregated by time so one order's partial fills are one
   trade). `closedPnl` is the venue's own realised result; the fee is taken
   off it when it was paid in USDC (a maker rebate is a negative fee, and
   adds). `userFillsByTime` was not used: it returns the OLDEST 2,000 after
   its start, so a year's window would show a busy trader their trades of
   last spring and none from this week.

   Polymarket: settled positions (lib/providers/polymarket-account.ts) —
   sold out, redeemed, or resolved and held.

   Paper trades are not here: they are the automation's practice, not the
   portfolio's money.
--------------------------------------------------------------------------- */

const INFO = "https://api.hyperliquid.xyz/info";
const FILL_CAP = 2000;

interface WireFill {
  coin?: string;
  dir?: string;
  closedPnl?: string;
  fee?: string;
  feeToken?: string;
  time?: number;
}

const num = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** A fill that closed (or flipped) a position, net of a USDC fee. Null for an opening fill. */
export function tradeOfFill(wire: WireFill): ClosedTrade | null {
  const pnl = num(wire.closedPnl);
  const closing = (wire.dir ?? "").startsWith("Close") || (wire.dir ?? "").includes(">") || /liquidat/i.test(wire.dir ?? "");
  if (pnl === null || typeof wire.time !== "number" || wire.coin === undefined) return null;
  if (!closing && pnl === 0) return null;
  const fee = wire.feeToken === "USDC" ? (num(wire.fee) ?? 0) : 0;
  return { at: new Date(wire.time).toISOString(), venue: "hyperliquid", label: wire.coin.toUpperCase(), pnlUsd: pnl - fee };
}

export interface TradesRead {
  trades: ClosedTrade[];
  notes: OverviewNote[];
}

export async function readClosedTrades(input: {
  evmAddress: string | null;
  polymarketAddress: string | null;
  /** Epoch milliseconds. */
  since: number;
}): Promise<TradesRead> {
  const notes: OverviewNote[] = [];
  const trades: ClosedTrade[] = [];

  const [fills, closed] = await Promise.all([
    input.evmAddress === null
      ? Promise.resolve(null)
      : providerFetch<WireFill[]>({
          provider: "hyperliquid",
          url: INFO,
          method: "POST",
          body: { type: "userFills", user: input.evmAddress.toLowerCase(), aggregateByTime: true },
          timeoutMs: 12_000,
        }),
    input.polymarketAddress === null ? Promise.resolve(null) : polymarketClosedPositions(input.polymarketAddress, Math.floor(input.since / 1000)),
  ]);

  if (fills !== null) {
    if (fills.ok && Array.isArray(fills.data)) {
      let oldest = Number.POSITIVE_INFINITY;
      for (const wire of fills.data) {
        if (typeof wire.time === "number") oldest = Math.min(oldest, wire.time);
        const trade = tradeOfFill(wire);
        if (trade !== null && Date.parse(trade.at) >= input.since) trades.push(trade);
      }
      if (fills.data.length >= FILL_CAP && oldest > input.since) {
        notes.push({ key: "Hyperliquid returns its latest 2,000 fills, back to {date}; older trades are not counted.", values: { date: new Date(oldest).toISOString().slice(0, 10) } });
      }
    } else {
      notes.push({ key: "Hyperliquid fills could not be read, so its trades are not counted." });
    }
  }

  if (closed !== null) {
    if (closed.ok && closed.data) {
      for (const row of closed.data) {
        if (Date.parse(row.at) >= input.since) trades.push({ at: row.at, venue: "polymarket", label: row.marketTitle, pnlUsd: row.pnlUsd });
      }
    } else {
      notes.push({ key: "Polymarket's settled positions could not be read, so its trades are not counted." });
    }
  }

  return { trades: trades.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), notes };
}
