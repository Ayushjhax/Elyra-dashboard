import "server-only";

import { cached, providerFetch } from "@/lib/providers/http";
import { binanceSymbol } from "@/lib/providers/binance-public";
import { fail, ok, type ToolResult } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Historical candles.

   ── The incomplete bar is a lookahead bug waiting to happen ────────────

   Every exchange returns the CURRENT, still-forming bar as the last element.
   Its close is whatever the price is right now, its high and low are partial,
   and its volume is a fraction of what it will be. A backtest that includes
   it is testing a strategy against a bar that could not have been observed at
   decision time — and because it is exactly one bar at the very end, the
   resulting inflation is small enough to look plausible.

   `complete` is computed from the clock, not trusted from the payload, and
   incomplete bars are dropped before a simulation ever sees them.

   ── Validation refuses rather than repairs ─────────────────────────────

   A gap in history is a fact about the data. Forward-filling it invents bars
   that never traded, and every indicator downstream then computes over
   fiction. Gaps are reported and the caller decides.
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

/* ---------------------------------------------------------------------------
   Binance
--------------------------------------------------------------------------- */

const BINANCE = "https://api.binance.com";

/** Binance caps a single klines request at this. */
const PAGE = 1000;

/** Bars are immutable once closed, so this can be long. */
const TTL_MS = 10 * 60_000;

type WireKline = [
  number, string, string, string, string, string, number,
  string, number, string, string, string,
];

function toCandle(
  row: WireKline,
  instrumentId: string,
  interval: string,
  now: number,
): Candle | null {
  const [openTime, open, high, low, close, volume, closeTime, quoteVolume] = row;

  const candle: Candle = {
    instrumentId,
    venue: "binance",
    interval,
    openTime,
    closeTime,
    open: Number.parseFloat(open),
    high: Number.parseFloat(high),
    low: Number.parseFloat(low),
    close: Number.parseFloat(close),
    volume: Number.parseFloat(volume),
    quoteVolume: Number.parseFloat(quoteVolume),
    /* Derived from the clock. A bar whose close time has not passed is still
       forming, whatever the payload implies. */
    complete: closeTime < now,
    source: "binance:klines",
  };

  const numbers = [candle.open, candle.high, candle.low, candle.close, candle.volume];
  if (numbers.some((value) => !Number.isFinite(value))) return null;

  return candle;
}

export interface CandleRequest {
  /** "SOL", "BTC" — normalised to the venue's symbol. */
  symbol: string;
  interval: string;
  /** Epoch ms. Inclusive. */
  startAt: number;
  /** Epoch ms. Exclusive of incomplete bars. */
  endAt: number;
}

/**
 * Historical bars for a window, paginated.
 *
 * Bounded at twenty pages — twenty thousand bars, which is more than two years
 * of hourly data. An unbounded loop against a free endpoint is how an
 * accidental infinite request storm starts.
 */
export async function binanceCandles(
  request: CandleRequest,
): Promise<ToolResult<Candle[]>> {
  const pair = binanceSymbol(request.symbol);
  if (pair.length === 0) {
    return fail<Candle[]>("binance", "INVALID_REQUEST", "A symbol is required.");
  }
  if (!isSupportedInterval(request.interval)) {
    return fail<Candle[]>(
      "binance",
      "INVALID_REQUEST",
      `"${request.interval}" is not a supported timeframe. Use one of: ${Object.keys(INTERVAL_MS).join(", ")}.`,
    );
  }
  if (request.endAt <= request.startAt) {
    return fail<Candle[]>("binance", "INVALID_REQUEST", "The period ends before it starts.");
  }

  const key = `candles:binance:${pair}:${request.interval}:${request.startAt}:${request.endAt}`;

  return cached(key, TTL_MS, async () => {
    const now = Date.now();
    const rows: Candle[] = [];
    let cursor = request.startAt;

    for (let page = 0; page < 20; page += 1) {
      const url =
        `${BINANCE}/api/v3/klines?symbol=${pair}&interval=${request.interval}` +
        `&startTime=${cursor}&endTime=${request.endAt}&limit=${PAGE}`;

      const response = await providerFetch<WireKline[]>({
        provider: "binance",
        url,
        timeoutMs: 20_000,
      });

      if (!response.ok || !Array.isArray(response.data)) {
        return fail<Candle[]>(
          "binance",
          response.error?.code ?? "UPSTREAM_UNAVAILABLE",
          response.error?.message ?? "Historical candles could not be read.",
        );
      }

      if (response.data.length === 0) break;

      for (const row of response.data) {
        const candle = toCandle(row, request.symbol.toUpperCase(), request.interval, now);
        if (candle !== null) rows.push(candle);
      }

      if (response.data.length < PAGE) break;

      /* Next page starts one millisecond after the last bar opened, so the
         boundary bar is never fetched twice. */
      const last = response.data[response.data.length - 1];
      cursor = last[0] + 1;
      if (cursor >= request.endAt) break;
    }

    /* The still-forming bar is removed here, once, so nothing downstream has
       to remember to. */
    const complete = rows.filter((candle) => candle.complete);

    if (complete.length === 0) {
      return fail<Candle[]>(
        "binance",
        "NOT_FOUND",
        `No completed ${request.interval} candles for ${pair} in that period.`,
      );
    }

    return ok(complete, "binance", {
      asOf: new Date(complete[complete.length - 1].closeTime).toISOString(),
    });
  });
}

/* ---------------------------------------------------------------------------
   Validation
--------------------------------------------------------------------------- */

export interface CandleIssue {
  kind: "duplicate" | "out_of_order" | "bad_ohlc" | "negative_volume" | "gap";
  at: number;
  detail: string;
}

export interface ValidationResult {
  candles: Candle[];
  issues: CandleIssue[];
  /** Bars missing relative to a continuous series. */
  missingBars: number;
  /** Fraction of the expected series that is present, 0–1. */
  coverage: number;
}

/**
 * Cleans and inspects a series.
 *
 * Duplicates and out-of-order bars are REMOVED because they are data errors
 * with an unambiguous correct handling. Gaps are only REPORTED: a missing bar
 * could be an exchange outage or a delisting, and inventing one would put
 * fictional prices under every indicator that follows.
 */
export function validateCandles(candles: Candle[], interval: string): ValidationResult {
  const issues: CandleIssue[] = [];
  const step = INTERVAL_MS[interval] ?? 0;

  const sorted = [...candles].sort((a, b) => a.openTime - b.openTime);

  const clean: Candle[] = [];
  let previous: Candle | null = null;

  for (const candle of sorted) {
    if (previous !== null && candle.openTime === previous.openTime) {
      issues.push({
        kind: "duplicate",
        at: candle.openTime,
        detail: "Duplicate bar removed.",
      });
      continue;
    }

    /* The OHLC relationship is definitional. A bar whose high is below its
       low is not a bar with a small error; it is not a bar. */
    if (
      candle.high < candle.low ||
      candle.high < candle.open ||
      candle.high < candle.close ||
      candle.low > candle.open ||
      candle.low > candle.close
    ) {
      issues.push({
        kind: "bad_ohlc",
        at: candle.openTime,
        detail: "High/low do not bracket open/close — bar dropped.",
      });
      continue;
    }

    if (candle.volume < 0) {
      issues.push({
        kind: "negative_volume",
        at: candle.openTime,
        detail: "Negative volume — bar dropped.",
      });
      continue;
    }

    if (previous !== null && step > 0) {
      const expected = previous.openTime + step;
      if (candle.openTime > expected) {
        const missing = Math.round((candle.openTime - expected) / step);
        issues.push({
          kind: "gap",
          at: expected,
          detail: `${missing} bar(s) missing. Not filled — a synthetic bar would put fictional prices under every indicator.`,
        });
      }
    }

    clean.push(candle);
    previous = candle;
  }

  const missingBars = issues
    .filter((issue) => issue.kind === "gap")
    .reduce((sum, issue) => {
      const match = /^(\d+) bar/.exec(issue.detail);
      return sum + (match === null ? 0 : Number.parseInt(match[1], 10));
    }, 0);

  const expected = clean.length + missingBars;

  return {
    candles: clean,
    issues,
    missingBars,
    coverage: expected === 0 ? 0 : clean.length / expected,
  };
}

/** The UTC day a bar belongs to, for session-based indicators. */
export function sessionKey(candle: Candle): string {
  return new Date(candle.openTime).toISOString().slice(0, 10);
}
