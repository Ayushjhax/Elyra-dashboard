import { resolveStrategy } from "@/lib/backtest/strategies";

/* ---------------------------------------------------------------------------
   Natural language — a backtest request read out of a sentence. Pure, so
   the website's tools, Telegram and the Android app parse alike.
--------------------------------------------------------------------------- */

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

const PERIODS: Record<string, number> = {
  "1m": 30,
  "3m": 90,
  "6m": 182,
  "1y": 365,
  "2y": 730,
};

export interface ParsedRequest {
  symbol: string;
  timeframe: string;
  days: number;
  strategyIds: string[];
  feeBps?: number;
  params: Record<string, number>;
}

const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX", "LINK", "ADA", "SUI"];

/**
 * Reads a backtest request out of plain language.
 *
 * Deliberately permissive about ORDER and strict about meaning: people write
 * "backtest rsi 12 on sol 1h for a year" and "sol rsi 1y 1h" and mean the
 * same thing. What it will not do is guess a strategy — an unrecognised name
 * returns no strategy rather than a plausible one, because running the wrong
 * strategy and labelling it correctly is worse than asking.
 */
export function parseBacktestRequest(text: string): ParsedRequest {
  const lower = text.toLowerCase();

  const symbol = SYMBOLS.find((s) => new RegExp(`\\b${s}\\b`, "i").test(text)) ?? "SOL";

  const timeframe =
    TIMEFRAMES.find((tf) => new RegExp(`\\b${tf}\\b`).test(lower)) ??
    (/\bhourly\b/.test(lower) ? "1h" : /\bdaily\b/.test(lower) ? "1d" : "1h");

  let days = 365;
  for (const [token, value] of Object.entries(PERIODS)) {
    if (new RegExp(`\\b${token}\\b`).test(lower)) {
      days = value;
      break;
    }
  }
  if (/\bsix months\b/.test(lower)) days = 182;
  else if (/\bthree months\b/.test(lower)) days = 90;
  else if (/\bone year\b|\ba year\b/.test(lower)) days = 365;
  else if (/\btwo years\b/.test(lower)) days = 730;

  const feeMatch = /(\d+)\s*bps/.exec(lower);
  const feeBps = feeMatch === null ? undefined : Number.parseInt(feeMatch[1], 10);

  /* Split on comparison separators so "macd, rsi and bollinger" yields three.

     The comma is handled SEPARATELY from the keywords. Putting it inside
     `\b(?:,|and|...)\b` looks tidy and silently fails: a comma is not a word
     character, so there is no boundary after it and the alternation never
     matches. "macd, rs 12" then stayed as one chunk and only the last alias
     in it was found — the comparison quietly ran one strategy short. */
  const parts = text
    .split(/\s*,\s*|\b(?:and|vs\.?|versus|compare|against)\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);

  const strategyIds: string[] = [];
  const params: Record<string, number> = {};

  for (const part of parts) {
    const match = resolveStrategy(part);
    if (match === null) continue;
    if (!strategyIds.includes(match.strategy.id)) {
      strategyIds.push(match.strategy.id);
      Object.assign(params, match.params);
    }
  }

  return { symbol, timeframe, days, strategyIds, feeBps, params };
}
