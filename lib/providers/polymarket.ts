import "server-only";

import { cached, providerFetch } from "@/lib/providers/http";
import {
  fail,
  ok,
  type DataCapability,
  type PredictionBookLevel,
  type PredictionEvent,
  type PredictionMarket,
  type PredictionOrderbook,
  type PredictionOutcome,
  type PredictionPricePoint,
  type PredictionTrade,
  type ProviderAdapter,
  type ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Polymarket — prediction market prices.

   Keyless, read-only, via the Gamma API. Verified live while writing this.

   ── The trap in this payload ───────────────────────────────────────────

   `outcomes` and `outcomePrices` arrive as JSON-ENCODED STRINGS, not arrays:

     "outcomes":      "[\"Yes\", \"No\"]"
     "outcomePrices": "[\"0.115\", \"0.885\"]"

   A caller that trusts the field names and iterates them gets the characters
   of a string. They are parsed defensively below — a market whose outcomes
   cannot be parsed is dropped rather than returned with a broken shape,
   because a half-parsed prediction market renders as a confident nonsense
   probability.

   ── What a price here is, and is not ───────────────────────────────────

   The price IS the market's implied probability; that is the instrument.
   It is not a forecast Elyra is making, and nothing above this layer may
   present it as one. Prices are clamped to 0–1 because a transiently
   crossed book can report otherwise, and a probability above 1 on a screen
   destroys trust in every other number next to it.

   Read-only by construction: this file has no order-placing path. Trading a
   prediction market needs a signed allowance on Polygon, which does not
   exist anywhere in this repo.
--------------------------------------------------------------------------- */

const GAMMA = "https://gamma-api.polymarket.com";
/* The keyless account/tape surface. `lib/providers/polymarket-account.ts`
   holds the same constant for positions; both read the one host. */
const DATA_API = "https://data-api.polymarket.com";

/** Odds move on trades, not continuously. Fifteen seconds is plenty. */
const MARKET_TTL_MS = 15_000;

export const polymarketProvider: ProviderAdapter = {
  id: "polymarket",
  capabilities: ["prediction_markets"] as const satisfies readonly DataCapability[],
  configured: () => process.env.ENABLE_POLYMARKET !== "false",
};

interface WireMarket {
  id?: string;
  question?: string;
  description?: string | null;
  conditionId?: string | null;
  slug?: string | null;
  groupItemTitle?: string | null;
  outcomes?: string | string[] | null;
  outcomePrices?: string | string[] | null;
  /** JSON-encoded array of CLOB token ids, positional with `outcomes`. */
  clobTokenIds?: string | string[] | null;
  liquidity?: string | number | null;
  liquidityNum?: string | number | null;
  volume?: string | number | null;
  volumeNum?: string | number | null;
  volume24hr?: string | number | null;
  bestBid?: string | number | null;
  bestAsk?: string | number | null;
  startDate?: string | null;
  endDate?: string | null;
  closedTime?: string | null;
  resolutionSource?: string | null;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  events?: Array<{ id?: string; title?: string }>;
  /* --- Microstructure metadata, verified present on live Gamma markets. --- */
  /** Minimum price increment. Every entry, target and stop must land on it. */
  orderPriceMinTickSize?: string | number | null;
  orderMinSize?: string | number | null;
  /** Part of a negative-risk (mutually exclusive) group — see `negRiskMarketID`. */
  negRisk?: boolean | null;
  negRiskMarketID?: string | null;
  lastTradePrice?: string | number | null;
  /** Probability point change over the window, as the venue computes it. */
  oneDayPriceChange?: string | number | null;
  oneHourPriceChange?: string | number | null;
  /** False when the venue is not currently matching orders on this market. */
  acceptingOrders?: boolean | null;
  enableOrderBook?: boolean | null;
}

interface WireTag {
  id?: number | string;
  label?: string;
  slug?: string;
}

interface WireEvent {
  id?: string;
  title?: string;
  slug?: string | null;
  description?: string | null;
  liquidity?: string | number | null;
  volume?: string | number | null;
  startDate?: string | null;
  endDate?: string | null;
  closed?: boolean;
  active?: boolean;
  tags?: WireTag[];
  markets?: WireMarket[];
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A field that is either an array or a JSON string holding one.
 *
 * Both forms are accepted rather than only the one observed today: the field
 * is documented as an array and delivered as a string, so either could change
 * without notice and neither should break the read.
 */
function stringList(value: string | string[] | null | undefined): string[] | null {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

function toMarket(wire: WireMarket, categories?: string[]): PredictionMarket | null {
  const labels = stringList(wire.outcomes);
  const prices = stringList(wire.outcomePrices);

  if (
    wire.id === undefined ||
    wire.question === undefined ||
    labels === null ||
    prices === null ||
    labels.length === 0 ||
    labels.length !== prices.length
  ) {
    /* Dropped, not patched. A market with three labels and two prices has no
       correct interpretation, and guessing the alignment would put a wrong
       probability next to a real question. */
    return null;
  }

  const outcomes: PredictionOutcome[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    const price = num(prices[index]);
    if (price === null) return null;
    outcomes.push({ label: labels[index], price: Math.min(1, Math.max(0, price)) });
  }

  const closed = wire.closed === true;

  return {
    id: wire.id,
    provider: "polymarket",
    /* The condition id is what the Data API keys positions on, so it is what
       lets a market be joined to a holding. Kept alongside the numeric id. */
    eventId: wire.events?.[0]?.id ?? null,
    question: wire.question,
    description: wire.description ?? null,
    categories: categories ?? [],
    slug: wire.slug ?? null,
    outcomes,
    liquidityUsd: num(wire.liquidityNum) ?? num(wire.liquidity),
    volume24hUsd: num(wire.volume24hr),
    volumeUsd: num(wire.volumeNum) ?? num(wire.volume),
    startAt: wire.startDate ?? null,
    endsAt: wire.endDate ?? null,
    resolvedAt: wire.closedTime ?? null,
    /* `closed` and `archived` are different states and neither is
       "resolved" on its own — a closed market whose outcome is published has
       a closedTime, and one that was cancelled does not. */
    status: closed ? (wire.closedTime ? "resolved" : "closed") : "open",
    resolutionSource: wire.resolutionSource ?? null,
    url: wire.slug ? `https://polymarket.com/market/${wire.slug}` : null,
    closed,

    tokenIds: stringList(wire.clobTokenIds) ?? [],
    conditionId: wire.conditionId ?? null,
    tickSize: num(wire.orderPriceMinTickSize),
    minOrderSize: num(wire.orderMinSize),
    negRisk: wire.negRisk ?? null,
    negRiskGroupId: wire.negRiskMarketID ?? null,
    lastTradePrice: num(wire.lastTradePrice),
    change24hPoints: num(wire.oneDayPriceChange),
    change1hPoints: num(wire.oneHourPriceChange),
    acceptingOrders: wire.acceptingOrders ?? null,
  };
}

/** The CLOB token ids for a market, positional with its outcomes. */
export function tokenIdsOf(wire: { clobTokenIds?: string | string[] | null }): string[] {
  return stringList(wire.clobTokenIds) ?? [];
}

/** The condition id, which is what the Data API keys a position on. */
export function conditionIdOf(wire: { conditionId?: string | null }): string | null {
  return wire.conditionId ?? null;
}

/** The most active open markets, busiest first. */
export async function polymarketTrending(limit = 10): Promise<ToolResult<PredictionMarket[]>> {
  const size = Math.min(Math.max(limit, 1), 50);
  const url =
    `${GAMMA}/markets?limit=${size}&closed=false&active=true` +
    `&order=volume24hr&ascending=false`;

  return cached(`polymarket:trending:${size}`, MARKET_TTL_MS, async () => {
    const response = await providerFetch<WireMarket[]>({
      provider: "polymarket",
      url,
      timeoutMs: 10_000,
    });

    if (!response.ok || response.data === undefined) {
      return fail<PredictionMarket[]>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket did not answer.",
      );
    }

    if (!Array.isArray(response.data)) {
      return fail<PredictionMarket[]>(
        "polymarket",
        "UPSTREAM_UNAVAILABLE",
        "Polymarket returned an unexpected shape.",
      );
    }

    const markets: PredictionMarket[] = [];
    let dropped = 0;
    for (const wire of response.data) {
      const market = toMarket(wire);
      if (market === null) dropped += 1;
      else markets.push(market);
    }

    return ok(markets, "polymarket", {
      partial: dropped > 0,
      warnings:
        dropped > 0
          ? [`${dropped} Polymarket market(s) were skipped — prices and outcomes did not line up.`]
          : [],
    });
  });
}

/**
 * Open markets matching a search term.
 *
 * ── Why this goes through /public-search ───────────────────────────────
 *
 * `/markets?search=` is SILENTLY IGNORED. Verified live: searching "bitcoin"
 * and searching "election" both return the same three Fed-rate markets — the
 * top of the volume-ordered list, unfiltered. The parameter is accepted, the
 * response is a 200, and nothing about it says the term was dropped.
 *
 * That is the worst possible failure for this call. Every text query resolves
 * to whatever is busiest, so an order book gets read, analysed and captioned
 * with the market the user actually named — a confident, correct-looking
 * answer about the wrong instrument.
 *
 * `/public-search` does honour the term. It returns EVENTS, so the markets
 * are flattened out of them; event order is the venue's own relevance
 * ranking and is preserved, because "bitcoin" should return a Bitcoin market
 * even when a Fed market trades more.
 */
export async function polymarketSearch(
  query: string,
  limit = 5,
): Promise<ToolResult<PredictionMarket[]>> {
  const term = query.trim();
  if (term.length === 0) {
    return fail<PredictionMarket[]>("polymarket", "INVALID_REQUEST", "A search term is required.");
  }

  const size = Math.min(Math.max(limit, 1), 20);

  return cached(`polymarket:search:${term.toLowerCase()}:${size}`, MARKET_TTL_MS, async () => {
    const params = new URLSearchParams({
      q: term,
      limit_per_type: String(Math.min(size * 2, 20)),
      events_status: "active",
    });

    const response = await providerFetch<{ events?: WireEvent[] }>({
      provider: "polymarket",
      url: `${GAMMA}/public-search?${params.toString()}`,
      timeoutMs: 12_000,
    });

    if (!response.ok || response.data === undefined) {
      return fail<PredictionMarket[]>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket search did not answer.",
      );
    }

    const markets: PredictionMarket[] = [];
    for (const event of response.data.events ?? []) {
      const categories = (event.tags ?? [])
        .map((tag) => tag.label)
        .filter((label): label is string => typeof label === "string");

      /* Within one event, busiest first — an event's markets are the same
         question at different thresholds, so volume picks the live one. Event
         ORDER is left alone: that is the relevance ranking. */
      const inEvent = (event.markets ?? [])
        .map((wire) => toMarket(wire, categories))
        .filter((market): market is PredictionMarket => market !== null && !market.closed)
        .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));

      markets.push(...inEvent);
      if (markets.length >= size) break;
    }

    return ok(markets.slice(0, size), "polymarket");
  });
}

/* ---------------------------------------------------------------------------
   Events, search and categories

   Verified against the official Gamma OpenAPI document
   (docs.polymarket.com/api-spec/gamma-openapi.yaml) and live calls. Paths are
   not guessed: `/events`, `/markets/{id}`, `/public-search` and
   `/tags/slug/{slug}` are all in that spec.
--------------------------------------------------------------------------- */

const EVENT_TTL_MS = 30_000;
const CATEGORY_TTL_MS = 10 * 60_000;

function toEvent(wire: WireEvent): PredictionEvent | null {
  if (wire.id === undefined || wire.title === undefined) return null;

  const categories = (wire.tags ?? [])
    .map((tag) => tag.label)
    .filter((label): label is string => typeof label === "string");

  const markets = (wire.markets ?? [])
    .map((market) => toMarket(market, categories))
    .filter((market): market is PredictionMarket => market !== null);

  return {
    id: wire.id,
    provider: "polymarket",
    title: wire.title,
    slug: wire.slug ?? null,
    description: wire.description ?? null,
    categories,
    markets,
    liquidityUsd: num(wire.liquidity),
    volumeUsd: num(wire.volume),
    endsAt: wire.endDate ?? null,
    closed: wire.closed === true,
    url: wire.slug ? `https://polymarket.com/event/${wire.slug}` : null,
  };
}

export interface EventQuery {
  /** A provider tag slug, e.g. "crypto". Validated before use. */
  category?: string | null;
  limit?: number;
  /** Only events resolving before this. ISO. */
  endsBefore?: string | null;
}

/**
 * Open events, busiest first.
 *
 * Ordered by 24h volume rather than by liquidity or recency: the question a
 * "what is happening" request is really asking is where attention is, and
 * volume is the only field that measures that.
 */
export async function polymarketEvents(
  query: EventQuery = {},
): Promise<ToolResult<PredictionEvent[]>> {
  const limit = Math.min(Math.max(query.limit ?? 10, 1), 50);

  const params = new URLSearchParams({
    limit: String(limit),
    closed: "false",
    active: "true",
    order: "volume24hr",
    ascending: "false",
  });

  if (query.category !== null && query.category !== undefined && query.category.length > 0) {
    params.set("tag_slug", query.category);
  }
  if (query.endsBefore !== null && query.endsBefore !== undefined) {
    params.set("end_date_max", query.endsBefore);
  }

  const key = `polymarket:events:${params.toString()}`;

  return cached(key, EVENT_TTL_MS, async () => {
    const response = await providerFetch<WireEvent[]>({
      provider: "polymarket",
      url: `${GAMMA}/events?${params.toString()}`,
      timeoutMs: 12_000,
    });

    if (!response.ok || !Array.isArray(response.data)) {
      return fail<PredictionEvent[]>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket did not answer.",
      );
    }

    const events = response.data
      .map(toEvent)
      .filter((event): event is PredictionEvent => event !== null);

    return ok(events, "polymarket");
  });
}

/**
 * Full-text search across events.
 *
 * `/public-search` returns events rather than markets, which is the right
 * grain for a question like "markets about Bitcoin": one event carries every
 * related market, and returning them flat would show the same question five
 * times with different thresholds.
 */
export async function polymarketSearchEvents(
  query: string,
  limit = 6,
): Promise<ToolResult<PredictionEvent[]>> {
  const term = query.trim();
  if (term.length === 0) {
    return fail<PredictionEvent[]>("polymarket", "INVALID_REQUEST", "A search term is required.");
  }

  const size = Math.min(Math.max(limit, 1), 20);
  const params = new URLSearchParams({
    q: term,
    limit_per_type: String(size),
    events_status: "active",
  });

  return cached(
    `polymarket:search-events:${term.toLowerCase()}:${size}`,
    EVENT_TTL_MS,
    async () => {
      const response = await providerFetch<{ events?: WireEvent[] }>({
        provider: "polymarket",
        url: `${GAMMA}/public-search?${params.toString()}`,
        timeoutMs: 12_000,
      });

      if (!response.ok || response.data === undefined) {
        return fail<PredictionEvent[]>(
          "polymarket",
          response.error?.code ?? "UPSTREAM_UNAVAILABLE",
          response.error?.message ?? "Polymarket search did not answer.",
        );
      }

      const events = (response.data.events ?? [])
        .map(toEvent)
        .filter((event): event is PredictionEvent => event !== null);

      return ok(events, "polymarket");
    },
  );
}

/** One market by its Gamma id. */
export async function polymarketMarket(id: string): Promise<ToolResult<PredictionMarket>> {
  const marketId = id.trim();
  if (!/^[0-9]+$/.test(marketId)) {
    return fail<PredictionMarket>(
      "polymarket",
      "INVALID_REQUEST",
      "A Polymarket market id is numeric.",
    );
  }

  return cached(`polymarket:market:${marketId}`, MARKET_TTL_MS, async () => {
    const response = await providerFetch<WireMarket>({
      provider: "polymarket",
      url: `${GAMMA}/markets/${marketId}`,
      timeoutMs: 10_000,
    });

    if (!response.ok || response.data === undefined) {
      return fail<PredictionMarket>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket did not answer.",
      );
    }

    const market = toMarket(response.data);
    if (market === null) {
      return fail<PredictionMarket>(
        "polymarket",
        "UPSTREAM_UNAVAILABLE",
        "That market's outcomes and prices did not line up.",
      );
    }

    return ok(market, "polymarket");
  });
}

/** One event, with every market under it. */
export async function polymarketEvent(id: string): Promise<ToolResult<PredictionEvent>> {
  const eventId = id.trim();
  if (!/^[0-9]+$/.test(eventId)) {
    return fail<PredictionEvent>(
      "polymarket",
      "INVALID_REQUEST",
      "A Polymarket event id is numeric.",
    );
  }

  return cached(`polymarket:event:${eventId}`, EVENT_TTL_MS, async () => {
    const response = await providerFetch<WireEvent>({
      provider: "polymarket",
      url: `${GAMMA}/events/${eventId}`,
      timeoutMs: 12_000,
    });

    if (!response.ok || response.data === undefined) {
      return fail<PredictionEvent>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket did not answer.",
      );
    }

    const event = toEvent(response.data);
    if (event === null) {
      return fail<PredictionEvent>("polymarket", "NOT_FOUND", "No such event.");
    }

    return ok(event, "polymarket");
  });
}

/**
 * Whether a category slug exists on Polymarket, and its label.
 *
 * Checked rather than assumed. Polymarket's tag list is thousands of entries
 * deep and mostly long-tail ("caitlin clark", "virgins"), so a fixed menu of
 * categories would either be wrong or would drift; and "culture" — an obvious
 * guess — does not exist at all. Offering a category the provider cannot
 * filter on produces an empty list that reads as "nothing is happening".
 */
export async function polymarketCategory(
  slug: string,
): Promise<ToolResult<{ slug: string; label: string }>> {
  const clean = slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(clean)) {
    return fail<{ slug: string; label: string }>(
      "polymarket",
      "INVALID_REQUEST",
      "That is not a category slug.",
    );
  }

  return cached(`polymarket:tag:${clean}`, CATEGORY_TTL_MS, async () => {
    const response = await providerFetch<WireTag>({
      provider: "polymarket",
      url: `${GAMMA}/tags/slug/${clean}`,
      timeoutMs: 10_000,
    });

    if (!response.ok || response.data?.label === undefined) {
      return fail<{ slug: string; label: string }>(
        "polymarket",
        "NOT_FOUND",
        `Polymarket has no "${clean}" category.`,
      );
    }

    return ok({ slug: clean, label: response.data.label }, "polymarket");
  });
}

/* ---------------------------------------------------------------------------
   CLOB — order books and price history

   Verified against docs.polymarket.com/api-spec/clob-openapi.yaml and live
   calls. The CLOB is keyed on TOKEN ids (one per outcome), not on the market
   id — a market with two outcomes has two books.
--------------------------------------------------------------------------- */

const CLOB = "https://clob.polymarket.com";

/** Books move on every trade. Short, but not so short it hammers the venue. */
const BOOK_TTL_MS = 5_000;
const HISTORY_TTL_MS = 60_000;

interface WireBook {
  market?: string;
  asset_id?: string;
  bids?: Array<{ price?: string; size?: string }>;
  asks?: Array<{ price?: string; size?: string }>;
  min_order_size?: string;
  tick_size?: string;
  last_trade_price?: string;
}

function levels(
  raw: Array<{ price?: string; size?: string }> | undefined,
  bestFirst: "high" | "low",
): PredictionBookLevel[] {
  const rows: PredictionBookLevel[] = [];
  for (const entry of raw ?? []) {
    const price = num(entry.price);
    const size = num(entry.size);
    if (price === null || size === null) continue;
    rows.push({ price, size });
  }

  /* ---- The trap ----

     Polymarket returns BOTH sides with the best price LAST: bids ascend and
     asks descend, so `bids[0]` is the worst bid and `asks[0]` is the worst
     ask. Verified live — a book whose bids ended 0.11 and asks ended 0.12
     reported a midpoint of 0.115.

     Reading index 0 as "best" would quote a price several ticks away on both
     sides and would look entirely plausible doing it. Sorted explicitly here
     so no caller has to know. */
  rows.sort((a, b) => (bestFirst === "high" ? b.price - a.price : a.price - b.price));
  return rows;
}

/** The book for one outcome token. */
export async function polymarketOrderbook(
  tokenId: string,
): Promise<ToolResult<PredictionOrderbook>> {
  const token = tokenId.trim();
  if (!/^[0-9]{1,90}$/.test(token)) {
    return fail<PredictionOrderbook>(
      "polymarket",
      "INVALID_REQUEST",
      "A CLOB token id is a long numeric string.",
    );
  }

  return cached(`polymarket:book:${token}`, BOOK_TTL_MS, async () => {
    const response = await providerFetch<WireBook>({
      provider: "polymarket",
      url: `${CLOB}/book?token_id=${token}`,
      timeoutMs: 10_000,
    });

    if (!response.ok || response.data === undefined) {
      return fail<PredictionOrderbook>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "The Polymarket order book did not answer.",
      );
    }

    const bids = levels(response.data.bids, "high");
    const asks = levels(response.data.asks, "low");

    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;

    return ok<PredictionOrderbook>(
      {
        marketId: response.data.market ?? "",
        tokenId: token,
        bids,
        asks,
        /* Null on a one-sided book. Halving a single quote would invent a
           midpoint for a market nobody is willing to take the other side of. */
        midpoint: bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null,
        spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
        lastTradePrice: num(response.data.last_trade_price),
        minOrderSize: num(response.data.min_order_size),
        tickSize: num(response.data.tick_size),
      },
      "polymarket",
    );
  });
}

/**
 * Probability over time for one outcome token.
 *
 * ── The trap in these two parameters ───────────────────────────────────
 *
 * `interval` is the LOOKBACK WINDOW, not the bar size. `fidelity` is the bar
 * size, in MINUTES. Reading `interval` as "one-day bars" is the natural
 * mistake and it is quietly catastrophic — verified live on a market with
 * four months of history:
 *
 *     interval=1d   fidelity=60     25 points spanning 1 day
 *     interval=1w   fidelity=60    169 points spanning 7 days
 *     interval=max  fidelity=60    745 points spanning 31 days
 *     interval=max  fidelity=1440  126 points spanning 126 days
 *
 * A backtest asking for "1d" and expecting a year of daily bars gets
 * twenty-five hourly ones, and any strategy with a lookback longer than that
 * silently produces no trades at all — which reads as "this strategy never
 * triggers" rather than "the data was never there".
 *
 * `fidelity` therefore defaults from the window but may be set explicitly,
 * so a caller that needs daily bars over months can ask for exactly that.
 */
export async function polymarketPriceHistory(
  tokenId: string,
  interval: "1h" | "6h" | "1d" | "1w" | "max" = "1d",
  fidelityMinutes?: number,
): Promise<ToolResult<PredictionPricePoint[]>> {
  const token = tokenId.trim();
  if (!/^[0-9]{1,90}$/.test(token)) {
    return fail<PredictionPricePoint[]>(
      "polymarket",
      "INVALID_REQUEST",
      "A CLOB token id is a long numeric string.",
    );
  }

  const fidelity =
    fidelityMinutes !== undefined && Number.isFinite(fidelityMinutes) && fidelityMinutes > 0
      ? Math.round(fidelityMinutes)
      : interval === "1h"
        ? 1
        : interval === "6h"
          ? 10
          : 60;

  return cached(`polymarket:history:${token}:${interval}:${fidelity}`, HISTORY_TTL_MS, async () => {
    const response = await providerFetch<{ history?: Array<{ t?: number; p?: number }> }>({
      provider: "polymarket",
      url: `${CLOB}/prices-history?market=${token}&interval=${interval}&fidelity=${fidelity}`,
      timeoutMs: 12_000,
    });

    if (!response.ok || response.data === undefined) {
      return fail<PredictionPricePoint[]>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket price history did not answer.",
      );
    }

    const points: PredictionPricePoint[] = [];
    for (const row of response.data.history ?? []) {
      if (typeof row.t !== "number" || typeof row.p !== "number") continue;
      /* `t` is seconds, not milliseconds. Treating it as ms dates every point
         to January 1970 and produces an empty-looking chart. */
      points.push({
        at: new Date(row.t * 1000).toISOString(),
        probability: Math.min(1, Math.max(0, row.p)),
      });
    }

    return ok(points, "polymarket");
  });
}

/** Mid price for one outcome token, as an implied probability. */
export async function polymarketMidpoint(tokenId: string): Promise<ToolResult<number>> {
  const token = tokenId.trim();
  if (!/^[0-9]{1,90}$/.test(token)) {
    return fail<number>("polymarket", "INVALID_REQUEST", "A CLOB token id is numeric.");
  }

  return cached(`polymarket:mid:${token}`, BOOK_TTL_MS, async () => {
    const response = await providerFetch<{ mid?: string }>({
      provider: "polymarket",
      url: `${CLOB}/midpoint?token_id=${token}`,
      timeoutMs: 8_000,
    });

    const mid = num(response.data?.mid);
    if (!response.ok || mid === null) {
      return fail<number>(
        "polymarket",
        response.error?.code ?? "NOT_FOUND",
        response.error?.message ?? "No midpoint for that outcome.",
      );
    }

    return ok(Math.min(1, Math.max(0, mid)), "polymarket");
  });
}

/* ---------------------------------------------------------------------------
   Batch books and the public trade tape

   ── Why batch matters here ─────────────────────────────────────────────

   Every analytical surface in this feature needs BOTH outcome books at the
   same instant: a basket built from a YES book read at t and a NO book read
   at t+400ms can show a spread that never existed. `POST /books` returns them
   in one round trip, from one venue snapshot, which is the only way the
   cross-book integrity check below means anything.

   Verified against docs.polymarket.com/market-data/prices-order-books and a
   live call. The batch endpoints cap at 500 items.
--------------------------------------------------------------------------- */

const BATCH_LIMIT = 500;

function bookFrom(wire: WireBook, token: string): PredictionOrderbook {
  const bids = levels(wire.bids, "high");
  const asks = levels(wire.asks, "low");
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;

  return {
    marketId: wire.market ?? "",
    tokenId: token,
    bids,
    asks,
    midpoint: bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null,
    spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
    lastTradePrice: num(wire.last_trade_price),
    minOrderSize: num(wire.min_order_size),
    tickSize: num(wire.tick_size),
  };
}

/**
 * Books for several outcome tokens, from ONE venue snapshot.
 *
 * Returned keyed by token id rather than as an array: the response order is
 * not documented as positional, and a caller that zipped it against its
 * request would silently attach the YES book to the NO outcome the first time
 * the venue reordered. The key is `asset_id`, which the venue itself sets.
 */
export async function polymarketBooks(
  tokenIds: string[],
): Promise<ToolResult<Map<string, PredictionOrderbook>>> {
  const tokens = [...new Set(tokenIds.map((id) => id.trim()))].filter((id) =>
    /^[0-9]{1,90}$/.test(id),
  );

  if (tokens.length === 0) {
    return fail<Map<string, PredictionOrderbook>>(
      "polymarket",
      "INVALID_REQUEST",
      "At least one CLOB token id is required.",
    );
  }
  if (tokens.length > BATCH_LIMIT) {
    return fail<Map<string, PredictionOrderbook>>(
      "polymarket",
      "INVALID_REQUEST",
      `Polymarket accepts at most ${BATCH_LIMIT} tokens per batch.`,
    );
  }

  return cached(`polymarket:books:${tokens.join(",")}`, BOOK_TTL_MS, async () => {
    const response = await providerFetch<WireBook[]>({
      provider: "polymarket",
      url: `${CLOB}/books`,
      method: "POST",
      body: tokens.map((token) => ({ token_id: token })),
      timeoutMs: 12_000,
    });

    if (!response.ok || !Array.isArray(response.data)) {
      return fail<Map<string, PredictionOrderbook>>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "The Polymarket order books did not answer.",
      );
    }

    const books = new Map<string, PredictionOrderbook>();
    for (const wire of response.data) {
      const token = wire.asset_id;
      if (typeof token !== "string" || !tokens.includes(token)) continue;
      books.set(token, bookFrom(wire, token));
    }

    const missing = tokens.filter((token) => !books.has(token));

    return ok(books, "polymarket", {
      partial: missing.length > 0,
      warnings:
        missing.length > 0
          ? [`No book returned for ${missing.length} of ${tokens.length} outcome token(s).`]
          : [],
    });
  });
}

interface WireTrade {
  asset?: string;
  conditionId?: string;
  side?: string;
  size?: number | string;
  price?: number | string;
  timestamp?: number | string;
  outcome?: string | null;
  transactionHash?: string | null;
}

/** Trades move the tape, not the clock. Short enough to be current. */
const TRADE_TTL_MS = 10_000;

/**
 * The public trade tape for one market.
 *
 * Read from the Data API. The CLOB's own `/trades` is authenticated — it
 * answers 401 without an API key, verified live — so this is the only keyless
 * source of executed prints, and the recent VWAP in the probability basket
 * depends on it.
 *
 * Keyed on the CONDITION id, which is the market, so a binary market returns
 * prints for both outcomes. Callers wanting one side filter on `tokenId`.
 */
export async function polymarketTrades(
  conditionId: string,
  limit = 100,
): Promise<ToolResult<PredictionTrade[]>> {
  const condition = conditionId.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(condition)) {
    return fail<PredictionTrade[]>(
      "polymarket",
      "INVALID_REQUEST",
      "A Polymarket condition id is a 32-byte hex string.",
    );
  }

  const size = Math.min(Math.max(limit, 1), 500);

  return cached(`polymarket:trades:${condition}:${size}`, TRADE_TTL_MS, async () => {
    const response = await providerFetch<WireTrade[]>({
      provider: "polymarket",
      url: `${DATA_API}/trades?market=${condition}&limit=${size}`,
      timeoutMs: 12_000,
    });

    if (!response.ok || !Array.isArray(response.data)) {
      return fail<PredictionTrade[]>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "The Polymarket trade tape did not answer.",
      );
    }

    const trades: PredictionTrade[] = [];
    for (const wire of response.data) {
      const price = num(wire.price ?? null);
      const shares = num(wire.size ?? null);
      const seconds = num(wire.timestamp ?? null);
      if (typeof wire.asset !== "string" || price === null || shares === null) continue;

      trades.push({
        tokenId: wire.asset,
        marketId: wire.conditionId ?? condition,
        side: String(wire.side).toUpperCase() === "SELL" ? "sell" : "buy",
        size: shares,
        /* Clamped for the same reason as everywhere else in this file: a
           price above 1 on a probability renders as 140% and destroys trust
           in every other figure beside it. */
        price: Math.min(1, Math.max(0, price)),
        /* Seconds, like the price history endpoint. Treating it as
           milliseconds dates every print to 1970. */
        at: new Date((seconds ?? 0) * 1000).toISOString(),
        outcome: wire.outcome ?? null,
        txHash: wire.transactionHash ?? null,
      });
    }

    /* Newest first, so "recent" means the head of the list regardless of the
       order the venue chose to return. */
    trades.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    return ok(trades, "polymarket");
  });
}

/* ---------------------------------------------------------------------------
   Bulk market sampling, for building a backtest universe

   ── Why this is not `polymarketTrending` with a bigger limit ───────────

   Gamma caps a page at 100 and a backtest universe needs several hundred
   candidates, because most markets are unusable for one of two reasons: they
   never had a book, or their history was never retained. Verified live —
   of four closed markets sampled at random, one served 327 price points and
   three served zero.

   So the sampler pages, and it samples CLOSED markets too. A settled market
   is the better backtest subject: its history runs all the way to resolution
   with no survivorship question about how it ends, whereas an open market's
   most recent bars are the ones a strategy has not yet been tested through.
--------------------------------------------------------------------------- */

const UNIVERSE_TTL_MS = 10 * 60_000;
const PAGE_SIZE = 100;

export interface UniverseQuery {
  /** Markets to gather. Paged internally. */
  limit?: number;
  /** Include settled markets, whose history runs to resolution. */
  includeClosed?: boolean;
  /** Minimum lifetime volume, in dollars. */
  minVolumeUsd?: number;
}

/**
 * A large sample of markets, for backtesting.
 *
 * Ordered by volume so the head of the list is the part most likely to have
 * retained history — an unavoidable bias, and one the caller states in the
 * universe label rather than hiding.
 */
export async function polymarketUniverse(
  query: UniverseQuery = {},
): Promise<ToolResult<PredictionMarket[]>> {
  const wanted = Math.min(Math.max(query.limit ?? 200, 1), 600);
  const minVolume = query.minVolumeUsd ?? 0;
  const includeClosed = query.includeClosed ?? true;

  const key = `polymarket:universe:${wanted}:${includeClosed}:${minVolume}`;

  return cached(key, UNIVERSE_TTL_MS, async () => {
    const markets: PredictionMarket[] = [];
    const seen = new Set<string>();
    const warnings: string[] = [];

    /* Open markets first, then settled ones. Both are needed: open markets
       carry current microstructure, settled ones carry complete histories. */
    const passes: Array<{ closed: boolean; order: string }> = includeClosed
      ? [
          { closed: false, order: "volume24hr" },
          { closed: true, order: "volume" },
        ]
      : [{ closed: false, order: "volume24hr" }];

    for (const pass of passes) {
      for (let offset = 0; offset < wanted; offset += PAGE_SIZE) {
        if (markets.length >= wanted) break;

        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
          closed: String(pass.closed),
          order: pass.order,
          ascending: "false",
        });
        if (!pass.closed) params.set("active", "true");

        const response = await providerFetch<WireMarket[]>({
          provider: "polymarket",
          url: `${GAMMA}/markets?${params.toString()}`,
          timeoutMs: 15_000,
        });

        if (!response.ok || !Array.isArray(response.data)) {
          warnings.push(
            `A universe page failed: ${response.error?.message ?? "unknown"}. The sample is smaller than requested.`,
          );
          break;
        }

        /* A short page is the end of the list, not an error. */
        if (response.data.length === 0) break;

        for (const wire of response.data) {
          const market = toMarket(wire);
          if (market === null) continue;
          if (seen.has(market.id)) continue;
          if ((market.volumeUsd ?? 0) < minVolume) continue;
          /* Binary only. Multi-outcome markets need the exclusivity checks
             in the signal engine and are not pooled into one win rate. */
          if (market.outcomes.length !== 2) continue;
          if ((market.tokenIds ?? []).length !== 2) continue;

          seen.add(market.id);
          markets.push(market);
          if (markets.length >= wanted) break;
        }

        if (response.data.length < PAGE_SIZE) break;
      }
    }

    return ok(markets, "polymarket", {
      partial: warnings.length > 0,
      warnings,
    });
  });
}
