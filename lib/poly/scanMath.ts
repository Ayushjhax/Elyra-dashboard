/* ---------------------------------------------------------------------------
   Poly scan's arithmetic. Three reads of Polymarket, all public, all code:

     smart money  the open positions of Polymarket's most profitable wallets
                  over 30 days (its own leaderboard), grouped by outcome: an
                  outcome where at least three of them hold the same side,
                  and two thirds of those in the market agree;
     movers       the liquid markets whose price moved most in a day;
     book sums    in an event whose outcomes exclude each other (one
                  winner), the YES asks should sum to about $1. Under $1, every
                  outcome could be bought for less than the one that pays;
                  over $1 on the bids, every outcome could be sold for more.
                  Shown before fees and depth, as a gap, not a profit.

   Nothing here is a forecast. Pure.
--------------------------------------------------------------------------- */

export interface PolyPosition {
  wallet: string;
  conditionId: string;
  tokenId: string;
  outcome: string;
  outcomeIndex: number;
  title: string;
  slug: string | null;
  eventSlug: string | null;
  endDate: string | null;
  avgPrice: number;
  price: number;
  valueUsd: number;
  redeemable: boolean;
}

export interface PolyConsensus {
  conditionId: string;
  tokenId: string;
  outcome: string;
  title: string;
  slug: string | null;
  eventSlug: string | null;
  endDate: string | null;
  /** Top wallets holding this outcome. */
  wallets: number;
  /** Top wallets in the same market holding another outcome. */
  against: number;
  valueUsd: number;
  /** Value-weighted average entry of the wallets on this side. */
  avgEntry: number;
  price: number;
}

export const POLY_RULES = {
  minWallets: 3,
  minShare: 2 / 3,
  /** A position smaller than this is dust, not a view. */
  minPositionUsd: 100,
  /** Past these the market is all but decided. */
  minPrice: 0.03,
  maxPrice: 0.97,
} as const;

export function polyConsensus(positions: readonly PolyPosition[], now: number, rules = POLY_RULES): PolyConsensus[] {
  const byMarket = new Map<string, PolyPosition[]>();
  for (const position of positions) {
    if (position.redeemable || position.valueUsd < rules.minPositionUsd) continue;
    if (position.price < rules.minPrice || position.price > rules.maxPrice) continue;
    if (position.endDate !== null && Date.parse(position.endDate) + 86_400_000 < now) continue;
    const list = byMarket.get(position.conditionId) ?? [];
    list.push(position);
    byMarket.set(position.conditionId, list);
  }
  const out: PolyConsensus[] = [];
  for (const list of byMarket.values()) {
    const walletsBySide = new Map<number, Map<string, PolyPosition>>();
    for (const position of list) {
      const side = walletsBySide.get(position.outcomeIndex) ?? new Map<string, PolyPosition>();
      const prior = side.get(position.wallet);
      if (prior === undefined || prior.valueUsd < position.valueUsd) side.set(position.wallet, position);
      walletsBySide.set(position.outcomeIndex, side);
    }
    const everyone = new Set(list.map((position) => position.wallet));
    const sides = [...walletsBySide.entries()].sort((a, b) => b[1].size - a[1].size);
    const [, best] = sides[0];
    if (best.size < rules.minWallets || best.size / everyone.size < rules.minShare) continue;
    const held = [...best.values()];
    const value = held.reduce((sum, position) => sum + position.valueUsd, 0);
    const head = held[0];
    out.push({
      conditionId: head.conditionId,
      tokenId: head.tokenId,
      outcome: head.outcome,
      title: head.title,
      slug: head.slug,
      eventSlug: head.eventSlug,
      endDate: head.endDate,
      wallets: best.size,
      against: everyone.size - best.size,
      valueUsd: Math.round(value),
      avgEntry: value > 0 ? Math.round((held.reduce((sum, position) => sum + position.avgPrice * position.valueUsd, 0) / value) * 1000) / 1000 : head.avgPrice,
      price: head.price,
    });
  }
  return out.sort((a, b) => b.wallets - a.wallets || b.valueUsd - a.valueUsd);
}

export interface GammaMarketLite {
  id: string;
  conditionId: string;
  question: string;
  slug: string | null;
  eventSlug: string | null;
  outcomes: string[];
  tokenIds: string[];
  prices: number[];
  bestBid: number | null;
  bestAsk: number | null;
  dayChange: number | null;
  volume24h: number;
  endDate: string | null;
  closed: boolean;
  label: string | null;
}

export interface Mover {
  market: GammaMarketLite;
  /** Change in the first outcome's price over a day, in points (0–100). */
  changePts: number;
}

export function movers(markets: readonly GammaMarketLite[], { minVolume = 25_000, minPts = 4, max = 15 } = {}): Mover[] {
  return markets
    .filter((market) => !market.closed && market.dayChange !== null && market.volume24h >= minVolume)
    .map((market) => ({ market, changePts: Math.round((market.dayChange as number) * 1000) / 10 }))
    .filter((mover) => Math.abs(mover.changePts) >= minPts)
    .sort((a, b) => Math.abs(b.changePts) - Math.abs(a.changePts))
    .slice(0, max);
}

export interface BookSum {
  eventSlug: string;
  title: string;
  outcomes: number;
  /** What buying YES on every outcome costs at the best asks, per $1 of payout. */
  askSum: number;
  /** What selling YES on every outcome raises at the best bids. */
  bidSum: number;
  /** Points under $1 on the asks (positive) — the buy-everything gap. */
  buyGapPts: number;
  /** Points over $1 on the bids (positive) — the sell-everything gap. */
  sellGapPts: number;
}

export interface GammaEventLite {
  slug: string;
  title: string;
  negRisk: boolean;
  markets: GammaMarketLite[];
}

/**
 * Book sums for one-winner events. An event with a market that has no quote
 * on a side is left out for that side: a sum with a missing term is not a sum.
 */
export function bookSums(events: readonly GammaEventLite[], { minGapPts = 0.5, max = 12 } = {}): BookSum[] {
  const out: BookSum[] = [];
  for (const event of events) {
    if (!event.negRisk) continue;
    const live = event.markets.filter((market) => !market.closed);
    if (live.length < 3) continue;
    const asks = live.map((market) => market.bestAsk);
    const bids = live.map((market) => market.bestBid);
    const askSum = asks.every((ask) => ask !== null && ask > 0) ? asks.reduce((sum: number, ask) => sum + (ask as number), 0) : NaN;
    const bidSum = bids.every((bid) => bid !== null) ? bids.reduce((sum: number, bid) => sum + (bid as number), 0) : NaN;
    const buyGapPts = Number.isFinite(askSum) ? Math.round((1 - askSum) * 1000) / 10 : 0;
    const sellGapPts = Number.isFinite(bidSum) ? Math.round((bidSum - 1) * 1000) / 10 : 0;
    if (buyGapPts < minGapPts && sellGapPts < minGapPts) continue;
    out.push({
      eventSlug: event.slug,
      title: event.title,
      outcomes: live.length,
      askSum: Math.round(askSum * 1000) / 1000,
      bidSum: Math.round(bidSum * 1000) / 1000,
      buyGapPts: Math.max(0, buyGapPts),
      sellGapPts: Math.max(0, sellGapPts),
    });
  }
  return out.sort((a, b) => Math.max(b.buyGapPts, b.sellGapPts) - Math.max(a.buyGapPts, a.sellGapPts)).slice(0, max);
}

const jsonList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const numberOrNull = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** One Gamma market, kept to what the scan uses. */
export function toLite(wire: Record<string, unknown>, eventSlug: string | null = null): GammaMarketLite | null {
  if (typeof wire.id !== "string" && typeof wire.id !== "number") return null;
  if (typeof wire.question !== "string" || typeof wire.conditionId !== "string") return null;
  const events = Array.isArray(wire.events) ? (wire.events as Array<{ slug?: unknown }>) : [];
  return {
    id: String(wire.id),
    conditionId: wire.conditionId,
    question: wire.question,
    slug: typeof wire.slug === "string" ? wire.slug : null,
    eventSlug: eventSlug ?? (typeof events[0]?.slug === "string" ? (events[0].slug as string) : null),
    outcomes: jsonList(wire.outcomes).map(String),
    tokenIds: jsonList(wire.clobTokenIds).map(String),
    prices: jsonList(wire.outcomePrices).map((price) => numberOrNull(price) ?? NaN),
    bestBid: numberOrNull(wire.bestBid),
    bestAsk: numberOrNull(wire.bestAsk),
    dayChange: numberOrNull(wire.oneDayPriceChange),
    volume24h: numberOrNull(wire.volume24hr) ?? 0,
    endDate: typeof wire.endDate === "string" ? wire.endDate : null,
    closed: wire.closed === true,
    label: typeof wire.groupItemTitle === "string" && wire.groupItemTitle !== "" ? wire.groupItemTitle : null,
  };
}

/** One data-api v2 position row. */
export function toPosition(wire: Record<string, unknown>): PolyPosition | null {
  const value = numberOrNull(wire.current_value);
  const price = numberOrNull(wire.current_price);
  if (typeof wire.proxy_wallet !== "string" || typeof wire.condition_id !== "string" || typeof wire.token_id !== "string") return null;
  if (value === null || price === null || typeof wire.title !== "string") return null;
  return {
    wallet: wire.proxy_wallet.toLowerCase(),
    conditionId: wire.condition_id,
    tokenId: wire.token_id,
    outcome: typeof wire.outcome === "string" ? wire.outcome : "",
    outcomeIndex: numberOrNull(wire.outcome_index) ?? 0,
    title: wire.title,
    slug: typeof wire.slug === "string" ? wire.slug : null,
    eventSlug: typeof wire.event_slug === "string" ? wire.event_slug : null,
    endDate: typeof wire.end_date === "string" && wire.end_date !== "" ? wire.end_date : null,
    avgPrice: numberOrNull(wire.avg_price) ?? price,
    price,
    valueUsd: value,
    redeemable: wire.redeemable === true,
  };
}
