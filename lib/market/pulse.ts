import type { PerpMarket } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   The Hyperliquid board at a glance.

   One public read of every listed perpetual, ranked five ways: what moved
   most up and down over 24 hours, where funding is most stretched either
   way, and where the open interest and the volume are. Nothing inferred —
   each figure is the venue's own, and the change is mark against the
   venue's own price a day ago.

   Thin markets lead every "biggest move" list on any venue and say nothing
   about the market, so the movers and the funding extremes only rank
   markets with real turnover.

   Pure, so it is tested directly.
--------------------------------------------------------------------------- */

/** Below this 24h volume a market's move or funding is noise. */
export const MIN_VOLUME_USD = 1_000_000;

/**
 * Hyperliquid's resting funding: 0.00125% an hour, about 11% a year, which
 * most markets sit at when nothing is stretched. "Highest funding" means
 * above it — otherwise the list is just the markets where nothing happens.
 */
export const BASE_FUNDING_APR_PCT = 0.00125 * 24 * 365;

export interface PulseRow {
  symbol: string;
  markPrice: number;
  change24hPct: number | null;
  /** Hourly funding, annualised, percent. Positive: longs pay shorts. */
  fundingAprPct: number | null;
  openInterestUsd: number | null;
  volume24hUsd: number | null;
  maxLeverage: number | null;
}

export interface MarketPulse {
  gainers: PulseRow[];
  losers: PulseRow[];
  fundingHigh: PulseRow[];
  fundingLow: PulseRow[];
  openInterest: PulseRow[];
  volume: PulseRow[];
  /** Listed, trading markets read. */
  markets: number;
  /** Their combined open interest and 24h volume, USD. */
  totalOpenInterestUsd: number;
  totalVolumeUsd: number;
  asOf: string;
}

export function toPulseRow(market: PerpMarket): PulseRow | null {
  const mark = market.markPrice;
  if (market.delisted || mark === null || mark <= 0) return null;
  const prev = market.prevDayPrice ?? null;
  const hours = market.fundingIntervalHours ?? 1;
  return {
    symbol: market.symbol,
    markPrice: mark,
    change24hPct: prev !== null && prev > 0 ? ((mark - prev) / prev) * 100 : null,
    fundingAprPct: market.fundingRate === null ? null : market.fundingRate * (24 / hours) * 365 * 100,
    openInterestUsd: market.openInterest === null ? null : market.openInterest * mark,
    volume24hUsd: market.volume24hUsd,
    maxLeverage: market.maxLeverage,
  };
}

function top(rows: PulseRow[], value: (row: PulseRow) => number | null, direction: 1 | -1, limit: number): PulseRow[] {
  return rows
    .filter((row) => value(row) !== null)
    .sort((a, b) => direction * ((value(b) as number) - (value(a) as number)))
    .slice(0, limit);
}

export function buildPulse(markets: readonly PerpMarket[], limit = 8, now = new Date()): MarketPulse {
  const rows = markets.map(toPulseRow).filter((row): row is PulseRow => row !== null);
  const liquid = rows.filter((row) => (row.volume24hUsd ?? 0) >= MIN_VOLUME_USD);
  const change = (row: PulseRow) => row.change24hPct;
  const funding = (row: PulseRow) => row.fundingAprPct;

  return {
    gainers: top(liquid, change, 1, limit).filter((row) => (row.change24hPct ?? 0) > 0),
    losers: top(liquid, change, -1, limit).filter((row) => (row.change24hPct ?? 0) < 0),
    fundingHigh: top(liquid, funding, 1, limit).filter(
      (row) => (row.fundingAprPct ?? 0) > BASE_FUNDING_APR_PCT + 0.5,
    ),
    fundingLow: top(liquid, funding, -1, limit).filter((row) => (row.fundingAprPct ?? 0) < 0),
    openInterest: top(rows, (row) => row.openInterestUsd, 1, limit),
    volume: top(rows, (row) => row.volume24hUsd, 1, limit),
    markets: rows.length,
    totalOpenInterestUsd: rows.reduce((sum, row) => sum + (row.openInterestUsd ?? 0), 0),
    totalVolumeUsd: rows.reduce((sum, row) => sum + (row.volume24hUsd ?? 0), 0),
    asOf: now.toISOString(),
  };
}
