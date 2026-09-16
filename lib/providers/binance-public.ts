import "server-only";

import { cached, providerFetch } from "@/lib/providers/http";
import {
  fail,
  ok,
  type DataCapability,
  type MarketTicker,
  type PerpMarket,
  type ProviderAdapter,
  type ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Binance — PUBLIC market data only.

   Strictly separate from `lib/exchange/binance.ts`, which holds a user's
   decrypted API credentials and reads their account. Nothing in this file
   signs anything, reads a key, or touches an account. The split is the
   point: a market-data question must never be a reason to load a credential.

   Verified live while writing this:

     api.binance.com/api/v3/ticker/24hr   → 24h stats (spot)
     fapi.binance.com/fapi/v1/premiumIndex → mark, index, funding (perps)

   ── Funding is reported, not annualised ────────────────────────────────

   `lastFundingRate` is the rate for ONE interval. Binance USD-M perps settle
   every eight hours, so the annualised figure is the rate × 3 × 365 — and
   that multiplier is a property of the venue, not of the number. It is
   carried as `fundingIntervalHours` so a caller annualises correctly instead
   of every call site hardcoding 8 and one of them being wrong.

   Every numeric field arrives as a string. Parsed once, below.
--------------------------------------------------------------------------- */

const SPOT = "https://api.binance.com";
const FUTURES = "https://fapi.binance.com";

/** USD-M perpetual funding settles on an eight-hour cycle. */
const FUNDING_INTERVAL_HOURS = 8;

const TICKER_TTL_MS = 10_000;
const FUNDING_TTL_MS = 30_000;

export const binancePublicProvider: ProviderAdapter = {
  id: "binance",
  capabilities: ["candles", "perp_positions"] as const satisfies readonly DataCapability[],
  /* No credential is involved, so there is nothing to be unconfigured. */
  configured: () => process.env.ENABLE_BINANCE_PUBLIC !== "false",
};

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Quote currencies Binance actually lists pairs against. */
const QUOTES = ["USDT", "USDC", "FDUSD", "BUSD", "TRY", "BTC", "ETH", "BNB"];

/**
 * "sol" and "SOL/USDT" both become "SOLUSDT".
 *
 * A trailing quote currency only counts as one when there is a BASE in front
 * of it. Without that check "BTC" reads as a pair already quoted in BTC and
 * is passed through unchanged — so a question about the single most-asked-
 * about asset in the product queries a symbol Binance does not list.
 */
export function binanceSymbol(symbol: string): string {
  const cleaned = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length === 0) return "";

  const quoted = QUOTES.some(
    (quote) => cleaned.length > quote.length && cleaned.endsWith(quote),
  );

  return quoted ? cleaned : `${cleaned}USDT`;
}

interface WireTicker {
  symbol?: string;
  lastPrice?: string;
  priceChangePercent?: string;
  highPrice?: string;
  lowPrice?: string;
  volume?: string;
  quoteVolume?: string;
}

/** 24-hour spot statistics for one symbol. */
export async function binanceTicker(symbol: string): Promise<ToolResult<MarketTicker>> {
  const pair = binanceSymbol(symbol);
  if (pair.length === 0) {
    return fail<MarketTicker>("binance", "INVALID_REQUEST", "A symbol is required.");
  }

  return cached(`binance:ticker:${pair}`, TICKER_TTL_MS, async () => {
    const response = await providerFetch<WireTicker>({
      provider: "binance",
      url: `${SPOT}/api/v3/ticker/24hr?symbol=${pair}`,
      timeoutMs: 8_000,
    });

    if (!response.ok || response.data === undefined) {
      return fail<MarketTicker>(
        "binance",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Binance did not answer.",
      );
    }

    const last = num(response.data.lastPrice);
    if (last === null) {
      /* No price is not a price of zero — and Binance answers 200 with an
         error object for an unknown symbol rather than a 404. */
      return fail<MarketTicker>(
        "binance",
        "NOT_FOUND",
        `Binance does not list ${pair}.`,
      );
    }

    return ok<MarketTicker>(
      {
        symbol: pair,
        provider: "binance",
        lastPrice: last,
        change24hPct: num(response.data.priceChangePercent),
        high24h: num(response.data.highPrice),
        low24h: num(response.data.lowPrice),
        volume24hBase: num(response.data.volume),
        volume24hQuote: num(response.data.quoteVolume),
      },
      "binance",
    );
  });
}

interface WirePremium {
  symbol?: string;
  markPrice?: string;
  indexPrice?: string;
  lastFundingRate?: string;
  nextFundingTime?: number;
}

/**
 * Mark price, index price and the current funding rate for a USD-M perp.
 *
 * Open interest and volume are not on this endpoint and are left null rather
 * than fetched from a second call the caller did not ask for.
 */
export async function binanceFunding(symbol: string): Promise<ToolResult<PerpMarket>> {
  const pair = binanceSymbol(symbol);
  if (pair.length === 0) {
    return fail<PerpMarket>("binance", "INVALID_REQUEST", "A symbol is required.");
  }

  return cached(`binance:funding:${pair}`, FUNDING_TTL_MS, async () => {
    const response = await providerFetch<WirePremium>({
      provider: "binance",
      url: `${FUTURES}/fapi/v1/premiumIndex?symbol=${pair}`,
      timeoutMs: 8_000,
    });

    if (!response.ok || response.data === undefined) {
      return fail<PerpMarket>(
        "binance",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Binance did not answer.",
      );
    }

    const mark = num(response.data.markPrice);
    if (mark === null) {
      return fail<PerpMarket>("binance", "NOT_FOUND", `Binance has no perp for ${pair}.`);
    }

    const next = response.data.nextFundingTime;

    return ok<PerpMarket>(
      {
        symbol: pair,
        provider: "binance",
        markPrice: mark,
        indexPrice: num(response.data.indexPrice),
        fundingRate: num(response.data.lastFundingRate),
        fundingIntervalHours: FUNDING_INTERVAL_HOURS,
        nextFundingAt:
          typeof next === "number" && next > 0 ? new Date(next).toISOString() : null,
        openInterest: null,
        volume24hUsd: null,
        maxLeverage: null,
      },
      "binance",
    );
  });
}

/**
 * A per-interval funding rate as an annual percentage.
 *
 * Here rather than at call sites so the interval is applied exactly once.
 * Funding compounds in practice, but this is the simple annualisation every
 * venue quotes, and mixing the two conventions across surfaces would be worse
 * than picking the conventional one and saying so.
 */
export function annualisedFundingPct(market: PerpMarket): number | null {
  if (market.fundingRate === null || market.fundingIntervalHours === null) return null;
  if (market.fundingIntervalHours <= 0) return null;
  const intervalsPerYear = (24 / market.fundingIntervalHours) * 365;
  return market.fundingRate * intervalsPerYear * 100;
}
