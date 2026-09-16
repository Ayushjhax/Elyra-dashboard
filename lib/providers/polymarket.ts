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

/** Open markets matching a search term. */
export async function polymarketSearch(
  query: string,
  limit = 5,
): Promise<ToolResult<PredictionMarket[]>> {
  const term = query.trim();
  if (term.length === 0) {
    return fail<PredictionMarket[]>("polymarket", "INVALID_REQUEST", "A search term is required.");
  }

  const size = Math.min(Math.max(limit, 1), 20);
  const url =
    `${GAMMA}/markets?limit=${size}&closed=false&active=true` +
    `&order=volume24hr&ascending=false&search=${encodeURIComponent(term)}`;

  return cached(`polymarket:search:${term.toLowerCase()}:${size}`, MARKET_TTL_MS, async () => {
    const response = await providerFetch<WireMarket[]>({
      provider: "polymarket",
      url,
      timeoutMs: 10_000,
    });

    if (!response.ok || !Array.isArray(response.data)) {
      return fail<PredictionMarket[]>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket did not answer.",
      );
    }

    const markets = response.data
      .map((wire) => toMarket(wire))
      .filter((market): market is PredictionMarket => market !== null);

    return ok(markets, "polymarket");
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

/** Probability over time for one outcome token. */
export async function polymarketPriceHistory(
  tokenId: string,
  interval: "1h" | "6h" | "1d" | "1w" | "max" = "1d",
): Promise<ToolResult<PredictionPricePoint[]>> {
  const token = tokenId.trim();
  if (!/^[0-9]{1,90}$/.test(token)) {
    return fail<PredictionPricePoint[]>(
      "polymarket",
      "INVALID_REQUEST",
      "A CLOB token id is a long numeric string.",
    );
  }

  const fidelity = interval === "1h" ? 1 : interval === "6h" ? 10 : 60;

  return cached(`polymarket:history:${token}:${interval}`, HISTORY_TTL_MS, async () => {
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
