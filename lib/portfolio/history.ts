import "server-only";

import { candles } from "@/lib/market/router";
import { describe, isUnreachable } from "@/lib/supabase/reachability";
import { serviceClient } from "@/lib/supabase/server";
import type { Interval } from "@/lib/types";
import type { PortfolioHistoryPoint, SpotHolding } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   Where the performance line comes from.

   Two sources, and the page is told which one it got, because they answer
   different questions and only one of them is the user's actual history.

   RECORDED — `portfolio_snapshots`, one row per user per bucket, written on
   read. This is the real thing: what the portfolio was actually worth at a
   past moment, including assets since sold and deposits since made. It is
   also empty on day one and only fills while someone uses the page.

   RECONSTRUCTED — today's holdings valued backwards through real candle
   history. This is NOT the user's past balance, and the UI must never call
   it that: it ignores every trade, deposit and withdrawal, so it answers
   "how would what I hold now have moved?" and nothing else. It is built from
   real prices, which is what separates it from a fabricated line, and it is
   labelled at every point it surfaces.

   The fabricated third option — interpolating from a single current balance,
   or synthesising a series from 24h change — is not implemented and should
   not be. A picture of performance that never happened is the single most
   misleading thing this page could show.
--------------------------------------------------------------------------- */

export type HistoryBasis = "recorded" | "reconstructed" | "none";

export interface HistoryResult {
  points: PortfolioHistoryPoint[];
  basis: HistoryBasis;
  /** Symbols a reconstruction could not price, so the UI can state coverage. */
  uncovered: string[];
  /** Share of current portfolio value the series actually accounts for. */
  coveragePct: number;
}

export const RANGES = {
  "1D": { interval: "15m" as Interval, limit: 96, sinceMs: 86_400_000 },
  "1W": { interval: "1H" as Interval, limit: 168, sinceMs: 7 * 86_400_000 },
  "1M": { interval: "4H" as Interval, limit: 180, sinceMs: 30 * 86_400_000 },
  "3M": { interval: "1D" as Interval, limit: 90, sinceMs: 90 * 86_400_000 },
  "1Y": { interval: "1D" as Interval, limit: 365, sinceMs: 365 * 86_400_000 },
  ALL: { interval: "1D" as Interval, limit: 365, sinceMs: 5 * 365 * 86_400_000 },
} as const;

export type RangeKey = keyof typeof RANGES;

export function isRangeKey(value: string): value is RangeKey {
  return value in RANGES;
}

/* ---------------------------------------------------------------------------
   Recorded snapshots
--------------------------------------------------------------------------- */

/**
 * How often a reading is kept.
 *
 * The page polls every thirty seconds; storing each one would be 2,880 rows
 * per user per day to draw a line nobody can see the resolution of. Five
 * minutes keeps a month of continuous use under 9,000 rows and is finer than
 * any range tab above 1D can render.
 */
const BUCKET_MS = 5 * 60_000;

/** Reported once. A missing table is a migration to run, not a per-request error. */
let snapshotTableMissing = false;

function noteMissingTable(reason: string): void {
  if (snapshotTableMissing) return;
  snapshotTableMissing = true;
  console.warn(
    `\n[elyra] portfolio_snapshots is not available: ${reason}\n` +
      "  Performance history will fall back to a reconstruction from candle data.\n" +
      "  Run supabase/migrations/0004_portfolio_snapshots.sql to record real history.\n",
  );
}

/**
 * Writes one reading, at most once per bucket.
 *
 * Deliberately never throws and never blocks the response: history is an
 * enhancement to the portfolio read, and a page that failed because it could
 * not write a data point for a chart would be a bad trade.
 */
export async function recordSnapshot(
  userId: string,
  totalValueUsd: number | null,
): Promise<void> {
  if (userId.length === 0 || totalValueUsd === null || snapshotTableMissing) return;

  /* Floored to the bucket, so concurrent polls in the same window collide on
     the primary key and the first one wins rather than writing near-duplicate
     rows a few seconds apart. */
  const at = new Date(Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS).toISOString();

  try {
    const { error } = await serviceClient()
      .from("portfolio_snapshots")
      .upsert(
        { user_id: userId, at, total_value_usd: totalValueUsd },
        { onConflict: "user_id,at", ignoreDuplicates: true },
      );

    if (error !== null) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        noteMissingTable(error.message);
        return;
      }
      if (isUnreachable(error)) return;
      console.warn("[portfolio history] write failed:", describe(error));
    }
  } catch {
    /* Unreachable database. The read this belongs to is already answering. */
  }
}

async function readRecorded(
  userId: string,
  range: RangeKey,
): Promise<PortfolioHistoryPoint[]> {
  if (snapshotTableMissing) return [];

  const since = new Date(Date.now() - RANGES[range].sinceMs).toISOString();

  try {
    const { data, error } = await serviceClient()
      .from("portfolio_snapshots")
      .select("at, total_value_usd")
      .eq("user_id", userId)
      .gte("at", since)
      .order("at", { ascending: true })
      .limit(1000);

    if (error !== null) {
      if (error.code === "42P01" || error.code === "PGRST205") noteMissingTable(error.message);
      return [];
    }

    return (data ?? []).map((row) => ({
      at: String(row.at),
      totalValueUsd: Number(row.total_value_usd),
      /* Deposits and withdrawals are not tracked, so net flow is unknown
         rather than zero — the tooltip omits the line instead of claiming
         nothing moved in or out. */
      netFlowUsd: null,
    }));
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------------
   Reconstruction
--------------------------------------------------------------------------- */

/** Stablecoins are held at $1 rather than looked up; no venue lists USDC/USD. */
const PEGGED = new Set(["USDC", "USDT", "PYUSD", "USDE", "DAI", "FDUSD", "USDS"]);

/** Past this many symbols the candle fan-out costs more than the chart is worth. */
const MAX_SYMBOLS = 8;

/**
 * Today's holdings, valued backwards through real candles.
 *
 * Only the largest holdings are priced — a long tail of dust would multiply
 * the upstream calls without moving the line. Everything excluded is
 * reported in `uncovered` and reflected in `coveragePct`, so the panel can
 * say what share of the portfolio the line actually represents rather than
 * implying it covers all of it.
 */
export async function reconstruct(
  holdings: SpotHolding[],
  range: RangeKey,
): Promise<HistoryResult> {
  const { interval, limit } = RANGES[range];

  const priced = holdings
    .filter((holding) => holding.verified && (holding.valueUsd ?? 0) > 1 && holding.quantity > 0)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  if (priced.length === 0) {
    return { points: [], basis: "none", uncovered: [], coveragePct: 0 };
  }

  const totalValue = priced.reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0);
  const head = priced.slice(0, MAX_SYMBOLS);
  const uncovered = priced.slice(MAX_SYMBOLS).map((holding) => holding.symbol);

  /* Pegged assets contribute a flat line at quantity × $1. Asking a venue
     for USDC candles returns nothing and would drop the holding entirely,
     which would make a stablecoin-heavy portfolio look far more volatile
     than it is. */
  const pegged = head.filter((holding) => PEGGED.has(holding.symbol.toUpperCase()));
  const floating = head.filter((holding) => !PEGGED.has(holding.symbol.toUpperCase()));
  const peggedValue = pegged.reduce((sum, holding) => sum + holding.quantity, 0);

  const series = await Promise.all(
    floating.map(async (holding) => {
      try {
        const rows = await candles(holding.symbol.toUpperCase(), interval, limit);
        return { holding, rows };
      } catch {
        return { holding, rows: [] };
      }
    }),
  );

  const usable = series.filter((entry) => entry.rows.length > 1);
  for (const entry of series) {
    if (entry.rows.length <= 1) uncovered.push(entry.holding.symbol);
  }

  if (usable.length === 0) {
    return { points: [], basis: "none", uncovered, coveragePct: 0 };
  }

  /* The intersection of timestamps, not the union. A symbol missing a candle
     at time T would otherwise drop out of the sum there and put a step in
     the line that no price ever made. */
  const byTime = usable.map(
    (entry) => new Map(entry.rows.map((candle) => [candle.openTime, candle.close])),
  );
  const shared = usable[0].rows
    .map((candle) => candle.openTime)
    .filter((time) => byTime.every((map) => map.has(time)))
    .sort((a, b) => a - b);

  if (shared.length < 2) {
    return { points: [], basis: "none", uncovered, coveragePct: 0 };
  }

  const points: PortfolioHistoryPoint[] = shared.map((time) => {
    let value = peggedValue;
    usable.forEach((entry, index) => {
      value += entry.holding.quantity * (byTime[index].get(time) ?? 0);
    });
    return { at: new Date(time).toISOString(), totalValueUsd: value, netFlowUsd: null };
  });

  const coveredValue =
    peggedValue + usable.reduce((sum, entry) => sum + (entry.holding.valueUsd ?? 0), 0);

  return {
    points,
    basis: "reconstructed",
    uncovered,
    coveragePct: totalValue > 0 ? Math.min(100, (coveredValue / totalValue) * 100) : 0,
  };
}

/* ---------------------------------------------------------------------------
   The one entry point
--------------------------------------------------------------------------- */

/**
 * Recorded history when there is enough of it, a reconstruction otherwise.
 *
 * "Enough" is two points: one point is a dot, not a line, and falling back
 * to a reconstruction is strictly more informative than drawing nothing
 * while the snapshot table fills up.
 */
export async function portfolioHistory(
  userId: string | null,
  holdings: SpotHolding[],
  range: RangeKey,
): Promise<HistoryResult> {
  if (userId !== null) {
    const recorded = await readRecorded(userId, range);
    if (recorded.length >= 2) {
      return { points: recorded, basis: "recorded", uncovered: [], coveragePct: 100 };
    }
  }
  return reconstruct(holdings, range);
}
