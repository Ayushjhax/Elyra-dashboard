/* ---------------------------------------------------------------------------
   The candle shape and the supported intervals — the pure half of
   lib/backtest/candles.ts, which keeps the Binance reads. Split out so the
   backtest metrics, and the Android app, can use them without the network
   code.
--------------------------------------------------------------------------- */

export interface Candle {
  instrumentId: string;
  venue: string;
  interval: string;
  /** Epoch ms, UTC. */
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume?: number;
  /** False for the still-forming bar. Never simulated. */
  complete: boolean;
  source: string;
}

/** Supported intervals and their exact duration. */
export const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export function isSupportedInterval(interval: string): boolean {
  return Object.hasOwn(INTERVAL_MS, interval);
}

/** True when the interval divides a day — required for session VWAP. */
export function isIntraday(interval: string): boolean {
  const ms = INTERVAL_MS[interval];
  return ms !== undefined && ms < 86_400_000;
}
