import "server-only";

import type { Interval } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The neutral shape of market data.

   Every source returns these, so swapping one for another is a line in the
   router and nothing else. Sources normalise units here: rates are percent
   per funding interval, volumes are quote currency, sizes are base units.
--------------------------------------------------------------------------- */

export type SourceId = "binance" | "hyperliquid" | "okx";

export interface MarketSnapshot {
  symbol: string;
  price: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  /** Quote currency, so it is comparable across symbols. */
  volume24h: number;
  /** Perp mark, where the source has one. */
  markPrice: number | null;
  source: SourceId;
  fetchedAt: string;
}

export interface Candle {
  /** Open time, epoch milliseconds. */
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FundingSnapshot {
  symbol: string;
  /** Percent per funding interval, not annualised. */
  currentRatePct: number;
  nextFundingTime: string | null;
  /** Mean over the requested window. */
  meanRatePct: number;
  /** Run length of the current sign, counting back from the latest settlement. */
  consecutiveNegative: number;
  consecutivePositive: number;
  intervalHours: number;
  settlementsInWindow: number;
  source: SourceId;
  fetchedAt: string;
}

export interface OpenInterestSnapshot {
  symbol: string;
  /** Base units. */
  current: number;
  /** Quote currency, where the source reports it. */
  currentNotional: number | null;
  /** Percent change across the window; null when history is unavailable. */
  changePct: number | null;
  windowHours: number;
  source: SourceId;
  fetchedAt: string;
}

/**
 * What every source implements.
 *
 * A source may declare a capability unsupported by throwing `Unsupported`,
 * which the router treats as "ask the next one" rather than as a failure.
 */
export interface MarketSource {
  readonly id: SourceId;
  /** Whether this source lists the symbol at all. */
  supports(symbol: string): boolean;
  /** Batched: one upstream request for the whole list where the API allows. */
  snapshot(symbols: string[]): Promise<MarketSnapshot[]>;
  candles(symbol: string, interval: Interval, limit: number): Promise<Candle[]>;
  funding(symbol: string, lookbackHours: number): Promise<FundingSnapshot>;
  openInterest(
    symbol: string,
    lookbackHours: number,
  ): Promise<OpenInterestSnapshot>;
}

/** Thrown by a source that does not offer a capability for a symbol. */
export class UnsupportedCapability extends Error {
  readonly source: SourceId;

  constructor(source: SourceId, capability: string, symbol: string) {
    super(`${source} has no ${capability} for ${symbol}`);
    this.name = "UnsupportedCapability";
    this.source = source;
  }
}

/** Interval to candle duration, for turning a lookback into a candle count. */
export const INTERVAL_MS: Record<Interval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
  "1W": 604_800_000,
};
