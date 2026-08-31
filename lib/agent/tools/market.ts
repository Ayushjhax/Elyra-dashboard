import "server-only";

import { integer, oneOf, symbol, symbols } from "@/lib/agent/tools/args";
import type { RegisteredTool } from "@/lib/agent/tools/registry";
import { TTL, cached } from "@/lib/market/cache";
import { summarise } from "@/lib/market/indicators";
import * as router from "@/lib/market/router";
import { INTERVAL_MS } from "@/lib/market/types";
import type { Interval } from "@/lib/types";

/* ---------------------------------------------------------------------------
   Market tools. All read-only.

   Every one returns `fetchedAt` and the source it came from. The system
   prompt requires the agent to cite the numbers it pulled and to say when
   data is stale, and it cannot do either unless the tools tell it.
--------------------------------------------------------------------------- */

const INTERVALS: readonly Interval[] = [
  "1m",
  "5m",
  "15m",
  "1H",
  "4H",
  "1D",
  "1W",
];

export const getMarketSnapshot: RegisteredTool = {
  def: {
    name: "get_market_snapshot",
    description:
      "Current price, 24h change, 24h high/low, 24h quote volume and perp " +
      "mark price for one or more symbols. Batches into a single upstream " +
      "request, so ask for every symbol you need at once rather than calling " +
      "this repeatedly.",
    parameters: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          description: 'Bare tickers, e.g. ["SOL","BTC"]. Not "SOL-PERP".',
          items: { type: "string" },
        },
      },
      required: ["symbols"],
    },
  },

  async execute(args) {
    const wanted = symbols(args, "symbols");
    const key = `snapshot:${wanted.join(",")}`;

    const result = await cached(key, TTL.price, () => router.snapshots(wanted));
    const found = new Set(result.value.map((row) => row.symbol));

    return {
      fetchedAt: result.fetchedAt,
      servedFromCache: result.hit,
      symbols: result.value,
      /* Named explicitly so the agent reports the gap rather than silently
         answering about the symbols that happened to work. */
      unavailable: wanted.filter((entry) => !found.has(entry)),
    };
  },
};

export const getOhlcvSummary: RegisteredTool = {
  def: {
    name: "get_ohlcv_summary",
    description:
      "Computed summary of a candle series: window open/high/low/close, " +
      "SMA 20 and 50, RSI 14, ATR 14, latest volume against its 20-period " +
      "average, the range high and low with the timestamps they printed, and " +
      "at most 20 downsampled candles. Indicators are null when there is not " +
      "enough history to compute them honestly.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: 'Bare ticker, e.g. "SOL".' },
        interval: {
          type: "string",
          description: "Candle interval.",
          enum: [...INTERVALS],
        },
        lookback: {
          type: "integer",
          description:
            "How many candles to analyse. Defaults to 200, capped at 500.",
        },
      },
      required: ["symbol", "interval"],
    },
  },

  async execute(args) {
    const ticker = symbol(args);
    const interval = oneOf(args, "interval", INTERVALS, "1H");
    const lookback = integer(args, "lookback", {
      min: 20,
      max: 500,
      fallback: 200,
    });

    const key = `${ticker}:ohlcv:${interval}:${lookback}`;
    const result = await cached(key, TTL.candles, async () => {
      const candles = await router.candles(ticker, interval, lookback);
      return summarise(ticker, interval, candles);
    });

    if (result.value === null) {
      return {
        symbol: ticker,
        interval,
        error: "No candles returned for this symbol and interval.",
      };
    }

    return {
      fetchedAt: result.fetchedAt,
      servedFromCache: result.hit,
      windowHours: (INTERVAL_MS[interval] * result.value.candlesAnalysed) / 3_600_000,
      ...result.value,
    };
  },
};

export const getFundingRate: RegisteredTool = {
  def: {
    name: "get_funding_rate",
    description:
      "Perpetual funding for a symbol: the current rate, the next funding " +
      "time, the mean over the window, and how many consecutive settlements " +
      "have been positive or negative. Rates are percent per funding " +
      "interval — check intervalHours, it is 8h on Binance and OKX but 1h on " +
      "Hyperliquid, so the figures are not comparable across venues without it.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: 'Bare ticker, e.g. "SOL".' },
        lookback_hours: {
          type: "integer",
          description: "Window for the mean and run lengths. Defaults to 24.",
        },
      },
      required: ["symbol"],
    },
  },

  async execute(args) {
    const ticker = symbol(args);
    const hours = integer(args, "lookback_hours", {
      min: 1,
      max: 720,
      fallback: 24,
    });

    const key = `${ticker}:funding:${hours}`;
    const result = await cached(key, TTL.funding, () =>
      router.funding(ticker, hours),
    );

    /* The snapshot carries its own fetchedAt; the cache envelope's is
       authoritative, so it goes last. On a hit both are the time of the
       original upstream call, which is exactly the staleness the prompt
       requires the agent to report. */
    return {
      ...result.value,
      fetchedAt: result.fetchedAt,
      servedFromCache: result.hit,
    };
  },
};

export const getOpenInterest: RegisteredTool = {
  def: {
    name: "get_open_interest",
    description:
      "Current open interest for a symbol and its change across the window. " +
      "changePct is null when the source exposes no history — say so rather " +
      "than describing a change you cannot see.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: 'Bare ticker, e.g. "SOL".' },
        lookback_hours: {
          type: "integer",
          description: "Window for the change. Defaults to 24.",
        },
      },
      required: ["symbol"],
    },
  },

  async execute(args) {
    const ticker = symbol(args);
    const hours = integer(args, "lookback_hours", {
      min: 1,
      max: 720,
      fallback: 24,
    });

    const key = `${ticker}:oi:${hours}`;
    const result = await cached(key, TTL.openInterest, () =>
      router.openInterest(ticker, hours),
    );

    return {
      ...result.value,
      fetchedAt: result.fetchedAt,
      servedFromCache: result.hit,
    };
  },
};

export const MARKET_TOOLS = [
  getMarketSnapshot,
  getOhlcvSummary,
  getFundingRate,
  getOpenInterest,
];
