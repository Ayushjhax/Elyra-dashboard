import "server-only";

import { integer, oneOf, symbol, symbols } from "@/lib/agent/tools/args";
import type { RegisteredTool } from "@/lib/agent/tools/registry";
import { TTL, cached } from "@/lib/market/cache";
import { summarise } from "@/lib/market/indicators";
import { assetsBySymbols, pythConfigured } from "@/lib/market/pyth/catalog";
import { pricesForSymbols } from "@/lib/market/pyth/client";
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
      "Current price for one or more assets, from Pyth Network, plus 24h " +
      "change, 24h high/low, 24h quote volume and perp mark price from the " +
      "exchange sources where they list the asset. Covers crypto, equities, " +
      "metals, commodities, FX and indices — not only crypto. Batches into a " +
      "single upstream request, so ask for every symbol you need at once " +
      "rather than calling this repeatedly.",
    parameters: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          description:
            'Bare tickers, e.g. ["SOL","BTC","XAU","TSLA"]. Not "SOL-PERP".',
          items: { type: "string" },
        },
      },
      required: ["symbols"],
    },
  },

  /**
   * Price comes from Pyth; the 24h window comes from the exchanges.
   *
   * Pyth is the price of record here for the same reason it is in the UI —
   * it covers roughly 1,700 assets rather than the exchanges' crypto lists,
   * and the dashboard quotes it, so an agent citing a different number would
   * contradict the screen the operator is reading. Its price endpoint has no
   * 24h window, which the exchange snapshot supplies for the crypto it lists.
   */
  async execute(args) {
    const wanted = symbols(args, "symbols");

    const exchange = cached(`snapshot:${wanted.join(",")}`, TTL.price, () =>
      router.snapshots(wanted),
    ).catch(() => null);

    const pyth = pythConfigured()
      ? pricesForSymbols(wanted).catch(() => [])
      : Promise.resolve([]);

    const [exchangeResult, pythPrices, assets] = await Promise.all([
      exchange,
      pyth,
      pythConfigured() ? assetsBySymbols(wanted).catch(() => []) : Promise.resolve([]),
    ]);

    const byName = new Map(assets.map((asset) => [asset.symbol, asset]));
    const pythBySymbol = new Map(pythPrices.map((row) => [row.symbol, row]));
    const exchangeBySymbol = new Map(
      (exchangeResult?.value ?? []).map((row) => [row.symbol, row]),
    );

    const rows = [];
    for (const symbolName of wanted) {
      const key = symbolName.toUpperCase();
      const fromPyth = pythBySymbol.get(key);
      const fromExchange = exchangeBySymbol.get(key);
      if (!fromPyth && !fromExchange) continue;

      rows.push({
        symbol: key,
        name: byName.get(key)?.name ?? null,
        assetType: byName.get(key)?.assetType ?? null,
        /* Pyth wins where it has the asset. */
        price: fromPyth?.price ?? fromExchange?.price ?? null,
        priceSource: fromPyth ? "pyth" : (fromExchange?.source ?? null),
        confidence: fromPyth?.confidence ?? null,
        publisherCount: fromPyth?.publisherCount ?? null,
        marketSession: fromPyth?.marketSession ?? null,
        /* The 24h window, which Pyth does not publish. Null means no source
           listed this asset — say so rather than inferring a move. */
        change24hPct: fromExchange?.change24hPct ?? null,
        high24h: fromExchange?.high24h ?? null,
        low24h: fromExchange?.low24h ?? null,
        volume24h: fromExchange?.volume24h ?? null,
        markPrice: fromExchange?.markPrice ?? null,
        statsSource: fromExchange?.source ?? null,
      });
    }

    const found = new Set(rows.map((row) => row.symbol));

    return {
      fetchedAt: exchangeResult?.fetchedAt ?? new Date().toISOString(),
      servedFromCache: exchangeResult?.hit ?? false,
      symbols: rows,
      /* Named explicitly so the agent reports the gap rather than silently
         answering about the symbols that happened to work. */
      unavailable: wanted.filter((entry) => !found.has(entry.toUpperCase())),
      /* Stated so the agent can attribute the figure it cites. */
      note:
        "price is from Pyth Network where priceSource says so; the 24h " +
        "fields come from the exchange named in statsSource and are null " +
        "when no exchange lists the asset.",
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
