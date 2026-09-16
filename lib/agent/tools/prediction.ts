import "server-only";

import type { RegisteredTool, ToolContext } from "@/lib/agent/tools/registry";
import { ToolArgumentError } from "@/lib/agent/tools/args";
import {
  byEvent,
  byOutcome,
  bestPerformer,
  boundsOf,
  exposureOf,
  largestPosition,
  matchingSymbol,
  nextResolution,
  resolvingWithin,
  shareOfPortfolio,
  worstPerformer,
} from "@/lib/prediction/analytics";
import {
  ORDERS_REQUIRE_AUTH,
  polymarketActivity,
  polymarketPositions,
} from "@/lib/providers/polymarket-account";
import {
  polymarketCategory,
  polymarketEvent,
  polymarketEvents,
  polymarketMarket,
  polymarketOrderbook,
  polymarketPriceHistory,
  polymarketSearchEvents,
  polymarketTrending,
} from "@/lib/providers/polymarket";
import type {
  PredictionEvent,
  PredictionPosition,
  ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Prediction markets, in Elyra's vocabulary.

   The model asks "what prediction markets am I exposed to"; it does not ask
   for `/positions?user=0x…`. No Polymarket endpoint name, host or parameter
   appears in any tool description below, and no tool takes an address — the
   account comes from `ToolContext`, resolved from a verified session.

   ── The distinction every tool here preserves ──────────────────────────

   NOT CONNECTED is not ZERO.

   Polymarket holds positions in a proxy wallet whose address is not the
   user's EOA, so an unconnected account cannot be read at all. Reporting "$0
   in prediction markets" for someone who simply has not linked theirs is a
   fabrication about their money. Every personal tool below returns
   `connected: false` with an explanation instead, and the model is told in
   the description what that means.

   ── Probabilities are prices ───────────────────────────────────────────

   A 63% outcome is priced at 63¢, not forecast at 63% by Elyra. The
   descriptions say so, because the difference is the difference between
   reporting a market and making a prediction.
--------------------------------------------------------------------------- */

const NOT_CONNECTED = {
  connected: false,
  error:
    "This account has no Polymarket address linked, so personal prediction " +
    "positions cannot be read.",
  note:
    "Say the account is not connected. Do NOT report zero prediction exposure — " +
    "we cannot see the positions, which is different from there being none. " +
    "Public market data is still available.",
} as const;

function envelope<T>(result: ToolResult<T>): Record<string, unknown> {
  if (!result.ok || result.data === undefined) {
    return {
      error: result.error?.message ?? "Prediction-market data is unavailable.",
      code: result.error?.code ?? "UPSTREAM_UNAVAILABLE",
      note: "Report that this is unavailable. Do not estimate probabilities.",
    };
  }
  return {
    data: result.data,
    asOf: result.asOf,
    source: result.provider,
    ...(result.stale === true ? { stale: true } : {}),
    ...(result.partial === true ? { incomplete: true } : {}),
    ...(result.warnings?.length ? { warnings: result.warnings } : {}),
  };
}

const money = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 100) / 100;

const pct = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 10) / 10;

/** A probability as a whole-number percentage, which is how people read odds. */
const prob = (price: number): number => Math.round(price * 1000) / 10;

function marketRow(market: PredictionEvent["markets"][number]) {
  return {
    marketId: market.id,
    question: market.question,
    outcomes: market.outcomes.map((outcome) => ({
      label: outcome.label,
      impliedProbabilityPct: prob(outcome.price),
    })),
    liquidityUsd: money(market.liquidityUsd),
    volume24hUsd: money(market.volume24hUsd),
    endsAt: market.endsAt,
    status: market.status ?? (market.closed ? "closed" : "open"),
    url: market.url ?? null,
  };
}

function eventRow(event: PredictionEvent) {
  return {
    eventId: event.id,
    title: event.title,
    categories: event.categories,
    endsAt: event.endsAt,
    volumeUsd: money(event.volumeUsd),
    liquidityUsd: money(event.liquidityUsd),
    url: event.url ?? null,
    markets: event.markets.slice(0, 8).map(marketRow),
  };
}

function positionRow(position: PredictionPosition) {
  const bounds = boundsOf(position);
  return {
    positionId: position.id,
    marketId: position.marketId,
    market: position.marketTitle,
    outcome: position.outcome,
    shares: position.quantity,
    entryProbabilityPct: position.entryPrice === null ? null : prob(position.entryPrice),
    currentProbabilityPct:
      position.currentPrice === null ? null : prob(position.currentPrice),
    costBasisUsd: money(position.costBasisUsd),
    currentValueUsd: money(position.currentValueUsd),
    pnlUsd: money(position.pnlUsd),
    pnlPct: pct(position.pnlPct),
    maxLossUsd: money(bounds.maxLossUsd),
    maxPayoutUsd: money(bounds.maxPayoutUsd),
    endsAt: position.endsAt,
    status: position.status,
  };
}

/* ---------------------------------------------------------------------------
   Personal — reading the caller's own account
--------------------------------------------------------------------------- */

async function loadPositions(
  context: ToolContext,
): Promise<
  | { connected: false }
  | { connected: true; result: ToolResult<PredictionPosition[]>; address: string }
> {
  const address = context.polymarketAddress ?? null;
  if (address === null || address.length === 0) return { connected: false };
  return {
    connected: true,
    address,
    result: await polymarketPositions(address),
  };
}

export const predictionGetPositions: RegisteredTool = {
  def: {
    name: "prediction_get_positions",
    description:
      "The caller's own prediction-market positions: which markets, which " +
      "outcome, how many shares, entry and current probability, value and " +
      "PnL. Each share settles at $1 or $0, so maxLoss and maxPayout are " +
      "exact, not estimates. Returns connected:false when no prediction " +
      "account is linked — that means the positions CANNOT BE SEEN, not that " +
      "there are none.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter: open, claimable, resolved. Omit for everything live.",
        },
      },
      required: [],
    },
  },
  async execute(args, context) {
    const loaded = await loadPositions(context);
    if (!loaded.connected) return NOT_CONNECTED;

    const { result } = loaded;
    if (!result.ok || result.data === undefined) return envelope(result);

    const wanted = typeof args.status === "string" ? args.status.toLowerCase() : null;
    const rows = result.data.filter(
      (position) => wanted === null || position.status === wanted,
    );

    return {
      connected: true,
      asOf: result.asOf,
      source: "polymarket",
      positions: rows.map(positionRow),
      note:
        "Probabilities are market prices, not Elyra forecasts. A share pays " +
        "$1 if the outcome resolves true and $0 otherwise.",
    };
  },
};

export const predictionGetPortfolioSummary: RegisteredTool = {
  def: {
    name: "prediction_get_portfolio_summary",
    description:
      "A computed summary of the caller's prediction-market exposure: total " +
      "value, cost basis, unrealised PnL, capital at risk, maximum payout if " +
      "everything resolves in their favour, largest position, best and worst " +
      "performer, next resolution, and unclaimed winnings. Every figure is " +
      "calculated server-side — use them as given.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  async execute(_args, context) {
    const loaded = await loadPositions(context);
    if (!loaded.connected) return NOT_CONNECTED;

    const { result } = loaded;
    if (!result.ok || result.data === undefined) return envelope(result);

    const positions = result.data;
    const exposure = exposureOf(positions);
    const largest = largestPosition(positions);
    const best = bestPerformer(positions);
    const worst = worstPerformer(positions);
    const next = nextResolution(positions);

    return {
      connected: true,
      asOf: result.asOf,
      source: "polymarket",
      currentValueUsd: money(exposure.currentValueUsd),
      costBasisUsd: money(exposure.costBasisUsd),
      unrealisedPnlUsd: money(exposure.unrealisedPnlUsd),
      /* Bounded and exact — the reason these can be stated as facts. */
      capitalAtRiskUsd: money(exposure.maxLossUsd),
      maxPayoutUsd: money(exposure.maxPayoutUsd),
      maxProfitUsd: money(exposure.maxProfitUsd),
      activeMarkets: exposure.openCount,
      claimable: {
        count: exposure.claimableCount,
        valueUsd: money(exposure.claimableValueUsd),
      },
      largestPosition: largest === null ? null : positionRow(largest),
      bestPerformer: best === null ? null : positionRow(best),
      worstPerformer: worst === null ? null : positionRow(worst),
      nextResolution: next === null ? null : positionRow(next),
      resolvingWithin24h: resolvingWithin(positions, 24).length,
      resolvingWithin7d: resolvingWithin(positions, 24 * 7).length,
      ...(exposure.unvaluedCount > 0
        ? {
            warnings: [
              `${exposure.unvaluedCount} position(s) had no value reported and are excluded from these totals.`,
            ],
          }
        : {}),
    };
  },
};

export const predictionGetExposure: RegisteredTool = {
  def: {
    name: "prediction_get_exposure",
    description:
      "How the caller's prediction capital is concentrated: by event, by " +
      "outcome, and as a share of their whole portfolio. Positions across " +
      "several outcomes of ONE event are one bet on one question — this tool " +
      "groups them that way so concentration is not understated.",
    parameters: {
      type: "object",
      properties: {
        totalEquityUsd: {
          type: "number",
          description:
            "Portfolio equity, if already known from portfolio_overview, so " +
            "the share can be computed. Omit if unknown.",
        },
      },
      required: [],
    },
  },
  async execute(args, context) {
    const loaded = await loadPositions(context);
    if (!loaded.connected) return NOT_CONNECTED;

    const { result } = loaded;
    if (!result.ok || result.data === undefined) return envelope(result);

    const positions = result.data;
    const exposure = exposureOf(positions);
    const equity =
      typeof args.totalEquityUsd === "number" && args.totalEquityUsd > 0
        ? args.totalEquityUsd
        : null;

    return {
      connected: true,
      asOf: result.asOf,
      predictionValueUsd: money(exposure.currentValueUsd),
      sharePctOfPortfolio: pct(shareOfPortfolio(exposure.currentValueUsd, equity)),
      byEvent: byEvent(positions).slice(0, 10).map((slice) => ({
        label: slice.label,
        valueUsd: money(slice.valueUsd),
        pctOfPrediction: pct(slice.pctOfPrediction),
        positions: slice.positionCount,
      })),
      byOutcome: byOutcome(positions).map((slice) => ({
        outcome: slice.label,
        valueUsd: money(slice.valueUsd),
        pctOfPrediction: pct(slice.pctOfPrediction),
      })),
      note:
        equity === null
          ? "Portfolio share is unavailable because total equity was not supplied."
          : undefined,
    };
  },
};

export const predictionGetExpiringPositions: RegisteredTool = {
  def: {
    name: "prediction_get_expiring_positions",
    description:
      "The caller's positions resolving soon, soonest first. Use for " +
      "questions about what settles this week or needs attention.",
    parameters: {
      type: "object",
      properties: {
        withinHours: { type: "number", description: "Window in hours. Default 168 (a week)." },
      },
      required: [],
    },
  },
  async execute(args, context) {
    const loaded = await loadPositions(context);
    if (!loaded.connected) return NOT_CONNECTED;

    const { result } = loaded;
    if (!result.ok || result.data === undefined) return envelope(result);

    const hours = typeof args.withinHours === "number" ? args.withinHours : 168;
    const rows = resolvingWithin(result.data, hours);

    return {
      connected: true,
      asOf: result.asOf,
      withinHours: hours,
      positions: rows.map(positionRow),
    };
  },
};

export const predictionGetActivity: RegisteredTool = {
  def: {
    name: "prediction_get_activity",
    description:
      "The caller's recent prediction-market activity: buys, sells, redeems " +
      "and settlements, with size and price.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "Default 20, max 100." } },
      required: [],
    },
  },
  async execute(args, context) {
    const address = context.polymarketAddress ?? null;
    if (address === null || address.length === 0) return NOT_CONNECTED;

    const limit = typeof args.limit === "number" ? args.limit : 20;
    const result = await polymarketActivity(address, limit);
    if (!result.ok || result.data === undefined) return envelope(result);

    return {
      connected: true,
      asOf: result.asOf,
      activity: result.data.map((row) => ({
        kind: row.kind,
        market: row.marketTitle,
        outcome: row.outcome,
        shares: row.quantity,
        probabilityPct: row.price === null ? null : prob(row.price),
        usdValue: money(row.usdValue),
        at: row.at,
      })),
    };
  },
};

export const predictionGetOpenOrders: RegisteredTool = {
  def: {
    name: "prediction_get_open_orders",
    description:
      "The caller's resting prediction-market orders. Currently ALWAYS " +
      "unavailable: unlike positions, orders are not public and reading them " +
      "needs an authenticated trading session Elyra does not have. Say that " +
      "plainly — it is a missing connection, not an empty order book.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  async execute() {
    return {
      available: false,
      error: ORDERS_REQUIRE_AUTH,
      note: "Do not report zero open orders. Say they cannot be read yet.",
    };
  },
};

export const predictionGetPosition: RegisteredTool = {
  def: {
    name: "prediction_get_position",
    description:
      "One of the caller's prediction positions in detail, found by market " +
      "title or by the asset it references (for example 'BTC').",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Market title fragment, or an asset symbol." },
      },
      required: ["query"],
    },
  },
  async execute(args, context) {
    if (typeof args.query !== "string" || args.query.trim().length === 0) {
      throw new ToolArgumentError("prediction_get_position needs a `query`.");
    }

    const loaded = await loadPositions(context);
    if (!loaded.connected) return NOT_CONNECTED;

    const { result } = loaded;
    if (!result.ok || result.data === undefined) return envelope(result);

    const needle = args.query.trim().toLowerCase();
    const bySymbol = matchingSymbol(result.data, args.query);
    const byTitle = result.data.filter((p) =>
      p.marketTitle.toLowerCase().includes(needle),
    );

    const matches = [...new Set([...byTitle, ...bySymbol])];

    return {
      connected: true,
      asOf: result.asOf,
      matches: matches.map(positionRow),
      ...(matches.length === 0
        ? { note: "No position matched. Say so rather than describing a different one." }
        : {}),
    };
  },
};

/* ---------------------------------------------------------------------------
   Public — market discovery
--------------------------------------------------------------------------- */

export const predictionSearchMarkets: RegisteredTool = {
  def: {
    name: "prediction_search_markets",
    description:
      "Search live prediction markets by topic — 'Bitcoin', 'Fed', 'SOL', " +
      "an election. Returns grouped questions with the market's implied " +
      "probability for each outcome. These are PRICES set by traders, not " +
      "Elyra's forecasts, and a probability is not a price target.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Topic or keyword." },
        limit: { type: "number", description: "Default 6, max 20." },
      },
      required: ["query"],
    },
  },
  async execute(args) {
    if (typeof args.query !== "string" || args.query.trim().length === 0) {
      throw new ToolArgumentError("prediction_search_markets needs a `query`.");
    }

    const limit = typeof args.limit === "number" ? args.limit : 6;
    const result = await polymarketSearchEvents(args.query, limit);
    if (!result.ok || result.data === undefined) return envelope(result);

    return {
      asOf: result.asOf,
      source: "polymarket",
      query: args.query,
      events: result.data.map(eventRow),
      note: "Implied probabilities are market prices, not Elyra forecasts.",
    };
  },
};

export const predictionSearchEvents: RegisteredTool = {
  def: {
    name: "prediction_search_events",
    description:
      "Browse live prediction-market events, most active first, optionally " +
      "within a category such as crypto, politics, sports, tech or " +
      "geopolitics. The category is validated against the provider — an " +
      "unknown one is reported rather than silently returning nothing.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category slug, e.g. 'crypto'." },
        limit: { type: "number", description: "Default 10, max 50." },
      },
      required: [],
    },
  },
  async execute(args) {
    const limit = typeof args.limit === "number" ? args.limit : 10;
    let category: string | null = null;

    if (typeof args.category === "string" && args.category.trim().length > 0) {
      const slug = args.category.trim().toLowerCase().replace(/\s+/g, "-");
      const resolved = await polymarketCategory(slug);
      if (!resolved.ok) {
        /* Named, not silently ignored. Filtering on a category the provider
           does not have returns an empty list that reads as "nothing is
           happening in crypto", which is a very different claim. */
        return {
          error: `"${slug}" is not a category on this provider.`,
          note: "Say the category is unknown. Do not report an empty market list.",
        };
      }
      category = slug;
    }

    const result = await polymarketEvents({ category, limit });
    if (!result.ok || result.data === undefined) return envelope(result);

    return {
      asOf: result.asOf,
      source: "polymarket",
      category,
      events: result.data.map(eventRow),
    };
  },
};

export const predictionGetTrending: RegisteredTool = {
  def: {
    name: "prediction_get_trending",
    description:
      "The busiest prediction markets right now, by 24-hour volume. Use for " +
      "'what is happening in prediction markets' with no specific topic. " +
      "Implied probabilities are prices set by traders, not Elyra forecasts.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "Default 8, max 50." } },
      required: [],
    },
  },
  async execute(args) {
    const limit = typeof args.limit === "number" ? args.limit : 8;
    const result = await polymarketTrending(limit);
    if (!result.ok || result.data === undefined) return envelope(result);

    return {
      asOf: result.asOf,
      source: "polymarket",
      markets: result.data.map((market) => ({
        marketId: market.id,
        question: market.question,
        outcomes: market.outcomes.map((outcome) => ({
          label: outcome.label,
          impliedProbabilityPct: prob(outcome.price),
        })),
        volume24hUsd: money(market.volume24hUsd),
        liquidityUsd: money(market.liquidityUsd),
        endsAt: market.endsAt,
      })),
      note: "Implied probabilities are market prices, not Elyra forecasts.",
    };
  },
};

export const predictionGetMarket: RegisteredTool = {
  def: {
    name: "prediction_get_market",
    description:
      "One prediction market in detail by its id, including every outcome's " +
      "implied probability, volume, liquidity and resolution date.",
    parameters: {
      type: "object",
      properties: { marketId: { type: "string", description: "The market id." } },
      required: ["marketId"],
    },
  },
  async execute(args) {
    if (typeof args.marketId !== "string") {
      throw new ToolArgumentError("prediction_get_market needs a `marketId`.");
    }
    const result = await polymarketMarket(args.marketId);
    if (!result.ok || result.data === undefined) return envelope(result);
    return { asOf: result.asOf, source: "polymarket", market: marketRow(result.data) };
  },
};

export const predictionGetEvent: RegisteredTool = {
  def: {
    name: "prediction_get_event",
    description:
      "One prediction-market event and every market under it. An event is " +
      "the question ('Fed decision in September?'); the markets are its " +
      "possible answers.",
    parameters: {
      type: "object",
      properties: { eventId: { type: "string", description: "The event id." } },
      required: ["eventId"],
    },
  },
  async execute(args) {
    if (typeof args.eventId !== "string") {
      throw new ToolArgumentError("prediction_get_event needs an `eventId`.");
    }
    const result = await polymarketEvent(args.eventId);
    if (!result.ok || result.data === undefined) return envelope(result);
    return { asOf: result.asOf, source: "polymarket", event: eventRow(result.data) };
  },
};

export const predictionGetOrderbook: RegisteredTool = {
  def: {
    name: "prediction_get_orderbook",
    description:
      "Resting bids and asks for one outcome, best price first, with the " +
      "midpoint and spread. Use when asked what it would actually cost to " +
      "take a position, since the headline probability is a midpoint rather " +
      "than a fillable price.",
    parameters: {
      type: "object",
      properties: {
        outcomeTokenId: { type: "string", description: "The outcome's token id." },
      },
      required: ["outcomeTokenId"],
    },
  },
  async execute(args) {
    if (typeof args.outcomeTokenId !== "string") {
      throw new ToolArgumentError("prediction_get_orderbook needs an `outcomeTokenId`.");
    }
    const result = await polymarketOrderbook(args.outcomeTokenId);
    if (!result.ok || result.data === undefined) return envelope(result);

    const book = result.data;
    return {
      asOf: result.asOf,
      source: "polymarket",
      bestBidPct: book.bids[0] === undefined ? null : prob(book.bids[0].price),
      bestAskPct: book.asks[0] === undefined ? null : prob(book.asks[0].price),
      midpointPct: book.midpoint === null ? null : prob(book.midpoint),
      spreadPoints: book.spread === null ? null : Math.round(book.spread * 1000) / 10,
      topBids: book.bids.slice(0, 5).map((l) => ({ probabilityPct: prob(l.price), shares: l.size })),
      topAsks: book.asks.slice(0, 5).map((l) => ({ probabilityPct: prob(l.price), shares: l.size })),
    };
  },
};

export const predictionGetMarketHistory: RegisteredTool = {
  def: {
    name: "prediction_get_market_history",
    description:
      "How an outcome's probability has moved over time. Use for 'what " +
      "changed' or 'how much has this moved today'. Changes are reported in " +
      "PERCENTAGE POINTS: 54% to 64% is a 10-point move.",
    parameters: {
      type: "object",
      properties: {
        outcomeTokenId: { type: "string", description: "The outcome's token id." },
        interval: { type: "string", description: "1h, 6h, 1d, 1w or max. Default 1d." },
      },
      required: ["outcomeTokenId"],
    },
  },
  async execute(args) {
    if (typeof args.outcomeTokenId !== "string") {
      throw new ToolArgumentError("prediction_get_market_history needs an `outcomeTokenId`.");
    }

    const allowed = ["1h", "6h", "1d", "1w", "max"] as const;
    const interval = allowed.includes(args.interval as (typeof allowed)[number])
      ? (args.interval as (typeof allowed)[number])
      : "1d";

    const result = await polymarketPriceHistory(args.outcomeTokenId, interval);
    if (!result.ok || result.data === undefined) return envelope(result);

    const points = result.data;
    if (points.length === 0) {
      return { asOf: result.asOf, points: [], note: "No history for that outcome." };
    }

    const first = points[0];
    const last = points[points.length - 1];

    return {
      asOf: result.asOf,
      source: "polymarket",
      interval,
      openProbabilityPct: prob(first.probability),
      currentProbabilityPct: prob(last.probability),
      changePoints: Math.round((last.probability - first.probability) * 1000) / 10,
      highPct: prob(Math.max(...points.map((p) => p.probability))),
      lowPct: prob(Math.min(...points.map((p) => p.probability))),
      samples: points.length,
    };
  },
};

export const PREDICTION_TOOLS: RegisteredTool[] = [
  predictionGetPositions,
  predictionGetPosition,
  predictionGetPortfolioSummary,
  predictionGetExposure,
  predictionGetExpiringPositions,
  predictionGetActivity,
  predictionGetOpenOrders,
  predictionSearchMarkets,
  predictionSearchEvents,
  predictionGetTrending,
  predictionGetMarket,
  predictionGetEvent,
  predictionGetOrderbook,
  predictionGetMarketHistory,
];
