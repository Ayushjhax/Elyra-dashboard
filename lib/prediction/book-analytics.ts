import {
  isCrossed,
  isTwoSided,
  type BookLevel,
  type NormalizedBook,
} from "@/lib/prediction/book";

/* ---------------------------------------------------------------------------
   Order-book analytics.

   Every number here is arithmetic on a book that was read from the venue.
   Nothing is estimated, smoothed, or filled in. A metric that cannot be
   computed from the book in hand is `null`, and `null` travels all the way to
   the screen as "unavailable" rather than being replaced with a default —
   a depth of 0 and a depth we could not measure are opposite claims.

   ── Why the window is part of the number ───────────────────────────────

   "Imbalance +0.31" is meaningless alone. Imbalance over the top 1 level, the
   top 5, or everything within 2¢ of the touch are three different statistics
   that move differently and disagree routinely: a single large order at the
   touch dominates a top-1 reading and barely registers within 2¢.

   So every depth and imbalance figure is returned WITH the window that
   produced it, and `lib/prediction/signal-engine.ts` records that window in
   the signal's evidence. Comparing two imbalances from different windows is
   then visibly wrong rather than invisibly wrong.

   Client-safe: pure functions over a plain object.
--------------------------------------------------------------------------- */

/** How a depth figure was measured. Travels with the figure, always. */
export type DepthWindow =
  | { kind: "levels"; levels: number }
  | { kind: "price_distance"; cents: number };

export const TOP_1: DepthWindow = { kind: "levels", levels: 1 };
export const TOP_5: DepthWindow = { kind: "levels", levels: 5 };
export const TOP_10: DepthWindow = { kind: "levels", levels: 10 };
export const WITHIN_1C: DepthWindow = { kind: "price_distance", cents: 1 };
export const WITHIN_2C: DepthWindow = { kind: "price_distance", cents: 2 };

export function describeWindow(window: DepthWindow): string {
  return window.kind === "levels"
    ? `top ${window.levels} level${window.levels === 1 ? "" : "s"}`
    : `within ${window.cents}¢ of the touch`;
}

export interface DepthReading {
  /** Dollars resting in the window. price × size, summed. */
  bidUsd: number;
  askUsd: number;
  /** Shares resting in the window. */
  bidShares: number;
  askShares: number;
  /** (bid − ask) / (bid + ask) on notional. −1..+1, or null if both empty. */
  imbalance: number | null;
  window: DepthWindow;
}

export interface LiquidityZone {
  price: number;
  /** Dollars resting at this level right now. */
  notionalUsd: number;
  /** How many consecutive observations this level has held its size. */
  persistenceCount: number;
  /** How long it has been observed, in milliseconds. */
  lifetimeMs: number;
  side: "bid" | "ask";
}

export interface BookAnalytics {
  tokenId: string;
  marketId: string;

  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  spread: number | null;
  spreadBps: number | null;
  /** Spread in probability POINTS, which is how a prediction trader reads it. */
  spreadPoints: number | null;

  microprice: number | null;

  depth: {
    top1: DepthReading;
    top5: DepthReading;
    top10: DepthReading;
    within1c: DepthReading;
    within2c: DepthReading;
  };

  /** Notional-weighted imbalance across the whole book, distance-discounted. */
  weightedImbalance: number | null;

  /** Levels that have persisted. Empty until the tracker has seen repeats. */
  bidWalls: LiquidityZone[];
  askWalls: LiquidityZone[];

  /** Dollars per probability point moving away from the touch. */
  bidSlope: number | null;
  askSlope: number | null;

  /**
   * A gap in the ladder wide enough that a modest order jumps it.
   *
   * Reported per side as the width of the largest empty price gap within the
   * top ten levels, in ticks. Null when the ladder is contiguous.
   */
  bidVacuumTicks: number | null;
  askVacuumTicks: number | null;

  crossed: boolean;
  oneSided: boolean;

  timestamp: string;
  transport: NormalizedBook["transport"];
}

/* ---------------------------------------------------------------------------
   Depth
--------------------------------------------------------------------------- */

function levelsInWindow(
  levels: BookLevel[],
  window: DepthWindow,
  touch: number | null,
): BookLevel[] {
  if (window.kind === "levels") return levels.slice(0, window.levels);

  /* A price-distance window needs a reference. Without a touch on this side
     there is no "near", and returning the whole ladder would silently answer
     a different question than the one asked. */
  if (touch === null) return [];

  const span = window.cents / 100;
  return levels.filter((level) => Math.abs(level.price - touch) <= span + 1e-9);
}

function sum(levels: BookLevel[], field: "notional" | "size"): number {
  let total = 0;
  for (const level of levels) total += level[field];
  return total;
}

/**
 * Depth on both sides over one window, with the imbalance it implies.
 *
 * ── The canonical form, and why notional ───────────────────────────────
 *
 *     (BidDepth − AskDepth) / (BidDepth + AskDepth)
 *
 * measured in DOLLARS, not shares. On a prediction market the two sides sit
 * at different prices — a 0.10 bid and a 0.90 ask — so equal share counts are
 * nine-to-one in money. Share-weighted imbalance on a market trading at 10¢
 * reads as balanced when the real capital is overwhelmingly one-sided.
 */
export function depthOver(
  book: NormalizedBook,
  window: DepthWindow,
): DepthReading {
  const bids = levelsInWindow(book.bids, window, book.bestBid);
  const asks = levelsInWindow(book.asks, window, book.bestAsk);

  const bidUsd = sum(bids, "notional");
  const askUsd = sum(asks, "notional");
  const total = bidUsd + askUsd;

  return {
    bidUsd,
    askUsd,
    bidShares: sum(bids, "size"),
    askShares: sum(asks, "size"),
    imbalance: total > 0 ? (bidUsd - askUsd) / total : null,
    window,
  };
}

/* ---------------------------------------------------------------------------
   Microprice
--------------------------------------------------------------------------- */

/**
 * The size-weighted touch price.
 *
 *     microprice = (bestBid × askSize + bestAsk × bidSize) / (bidSize + askSize)
 *
 * The sizes are CROSSED deliberately: heavy size resting on the bid means
 * buyers are queued and the next trade is more likely to happen at the ask,
 * so the microprice leans toward the ask. Weighting each price by its own
 * size gives exactly the wrong answer, and gives it plausibly — it still
 * sits between the quotes.
 *
 * This is a short-horizon estimate of where the next print lands. It is NOT
 * the probability of the event, and nothing in this codebase may label it so.
 */
export function microprice(book: NormalizedBook): number | null {
  if (!isTwoSided(book) || isCrossed(book)) return null;

  const bid = book.bids[0];
  const ask = book.asks[0];
  const total = bid.size + ask.size;
  if (total <= 0) return null;

  const value = (bid.price * ask.size + ask.price * bid.size) / total;
  return Math.min(1, Math.max(0, value));
}

/* ---------------------------------------------------------------------------
   Weighted imbalance, slope and vacuums
--------------------------------------------------------------------------- */

/**
 * Imbalance across the whole ladder, discounting distance from the touch.
 *
 * A wall twenty ticks away is real money but it is not what the next trade
 * interacts with. Each level's notional is divided by (1 + ticks from the
 * touch), so the touch counts fully and distant size contributes with
 * declining weight instead of either dominating the number or being ignored.
 */
export function weightedImbalance(book: NormalizedBook): number | null {
  if (!isTwoSided(book)) return null;
  const tick = book.tickSize !== null && book.tickSize > 0 ? book.tickSize : 0.01;

  const weigh = (levels: BookLevel[], touch: number): number => {
    let total = 0;
    for (const level of levels) {
      const ticks = Math.abs(level.price - touch) / tick;
      total += level.notional / (1 + ticks);
    }
    return total;
  };

  const bid = weigh(book.bids, book.bids[0].price);
  const ask = weigh(book.asks, book.asks[0].price);
  const total = bid + ask;

  return total > 0 ? (bid - ask) / total : null;
}

/**
 * Dollars of resting depth per probability point away from the touch.
 *
 * A steep side absorbs size without moving; a shallow one gaps. Measured over
 * the top ten levels, and null when the side does not span a measurable price
 * range (every level at one price, or only one level).
 */
function slopeOf(levels: BookLevel[]): number | null {
  const window = levels.slice(0, 10);
  if (window.length < 2) return null;

  const span = Math.abs(window[window.length - 1].price - window[0].price);
  if (span < 1e-9) return null;

  return sum(window, "notional") / (span * 100);
}

/**
 * The widest empty gap in the top of the ladder, in ticks.
 *
 * Two ticks apart is contiguous-enough; a six-tick hole means a market order
 * that clears the near level lands six ticks away. Null when the ladder has
 * no gap wider than one tick.
 */
function vacuumOf(levels: BookLevel[], tickSize: number | null): number | null {
  const tick = tickSize !== null && tickSize > 0 ? tickSize : 0.01;
  const window = levels.slice(0, 10);
  if (window.length < 2) return null;

  let widest = 0;
  for (let index = 1; index < window.length; index += 1) {
    const gap = Math.abs(window[index].price - window[index - 1].price) / tick;
    if (gap > widest) widest = gap;
  }

  /* One tick apart is adjacent, not a gap. */
  return widest > 1.5 ? Math.round(widest) : null;
}

/* ---------------------------------------------------------------------------
   Persistent liquidity zones

   A wall that is present in one frame is not support. It may be a spoof, a
   fleeting quote, or an order that fills in the next second. Persistence is
   the only thing that separates a level worth naming from a screenshot, and
   it cannot be computed from a single book — it needs a history of books.

   `LiquidityTracker` holds that history per token, in memory, bounded.
--------------------------------------------------------------------------- */

interface TrackedLevel {
  firstSeenAt: number;
  lastSeenAt: number;
  observations: number;
  /** The smallest size seen, so a level that shrank is judged on what remains. */
  minNotional: number;
}

/** Observations a level must survive before it may be called a wall. */
export const WALL_MIN_OBSERVATIONS = 3;

/* ---- What separates a wall from a ladder ----------------------------

   Three independent conditions, because each alone admits an obvious
   counter-example:

     SHARE alone — a side reduced to one $6 order holds 100% of itself, and
     a book of seven even levels holds 14.3% each, so any threshold near
     that turns ordinary flat depth into "support".

     ABSOLUTE alone — a $300 level is meaningless beside $200k of depth.

     OUTLIER alone — with two levels, the larger inflates the average it is
     compared against, so a level holding 99.98% of its side can fail. The
     comparison is therefore against the OTHER levels, excluding the
     candidate itself.

   A level must clear all three.
------------------------------------------------------------------------ */

/** Minimum share of its own side. */
const WALL_SHARE_OF_SIDE = 0.25;

/** Minimum in dollars, so a thin side cannot manufacture support. */
const WALL_MIN_USD = 250;

/** Minimum multiple of the average of the OTHER levels on that side. */
const WALL_OUTLIER_MULTIPLE = 1.5;

/** Levels tracked per side. Bounds memory on a deep ladder. */
const TRACK_DEPTH = 15;

export class LiquidityTracker {
  private readonly levels = new Map<string, Map<number, TrackedLevel>>();

  /**
   * Folds one book into the history.
   *
   * Levels absent from this observation are dropped, not decayed: an order
   * that is gone is gone, and letting it linger for a few frames would mean
   * reporting support at a price with nothing resting on it.
   */
  observe(book: NormalizedBook, now = Date.now()): void {
    for (const side of ["bid", "ask"] as const) {
      const key = `${book.tokenId}:${side}`;
      const incoming = (side === "bid" ? book.bids : book.asks).slice(0, TRACK_DEPTH);
      const previous = this.levels.get(key) ?? new Map<number, TrackedLevel>();
      const next = new Map<number, TrackedLevel>();

      for (const level of incoming) {
        const before = previous.get(level.price);
        next.set(level.price, {
          firstSeenAt: before?.firstSeenAt ?? now,
          lastSeenAt: now,
          observations: (before?.observations ?? 0) + 1,
          minNotional: before === undefined
            ? level.notional
            : Math.min(before.minNotional, level.notional),
        });
      }

      this.levels.set(key, next);
    }
  }

  /** Levels that have persisted and are large relative to their side. */
  walls(book: NormalizedBook, side: "bid" | "ask"): LiquidityZone[] {
    const tracked = this.levels.get(`${book.tokenId}:${side}`);
    if (tracked === undefined) return [];

    const levels = side === "bid" ? book.bids : book.asks;
    const sideTotal = sum(levels, "notional");
    if (sideTotal <= 0) return [];

    const zones: LiquidityZone[] = [];
    const now = Date.now();

    for (const level of levels) {
      const history = tracked.get(level.price);
      if (history === undefined) continue;
      if (history.observations < WALL_MIN_OBSERVATIONS) continue;

      if (level.notional < WALL_MIN_USD) continue;
      if (level.notional / sideTotal < WALL_SHARE_OF_SIDE) continue;

      /* Against the other levels, not against a mean this level dominates. */
      const others = levels.length - 1;
      if (others > 0) {
        const otherAverage = (sideTotal - level.notional) / others;
        if (level.notional < otherAverage * WALL_OUTLIER_MULTIPLE) continue;
      }

      zones.push({
        price: level.price,
        notionalUsd: level.notional,
        persistenceCount: history.observations,
        lifetimeMs: Math.max(0, now - history.firstSeenAt),
        side,
      });
    }

    /* Largest first — the wall that matters is the one with the most behind
       it, not the nearest one. */
    zones.sort((a, b) => b.notionalUsd - a.notionalUsd);
    return zones;
  }

  /** Drops a token's history. Called when the last subscriber goes away. */
  forget(tokenId: string): void {
    this.levels.delete(`${tokenId}:bid`);
    this.levels.delete(`${tokenId}:ask`);
  }

  /** Tokens currently tracked. For health reporting. */
  size(): number {
    return this.levels.size;
  }
}

/* ---------------------------------------------------------------------------
   The analytics pass
--------------------------------------------------------------------------- */

/**
 * Every deterministic metric this system knows how to take from one book.
 *
 * `tracker` is optional because a one-shot REST read has no history and
 * therefore cannot honestly report a persistent wall. Without it the wall
 * lists come back empty — which is correct, and is not the same as "no walls
 * exist".
 */
export function analyseBook(
  book: NormalizedBook,
  tracker?: LiquidityTracker,
): BookAnalytics {
  const crossed = isCrossed(book);
  const twoSided = isTwoSided(book);

  /* A crossed book has a negative spread and a midpoint that sits outside
     the quotes. Both are reported as unavailable rather than as numbers,
     because a negative spread rendered in a UI reads as a data-entry error
     and a midpoint outside the touch is simply wrong. */
  const spread = twoSided && !crossed ? book.spread : null;
  const midpoint = twoSided && !crossed ? book.midpoint : null;

  return {
    tokenId: book.tokenId,
    marketId: book.marketId,

    bestBid: book.bestBid,
    bestAsk: book.bestAsk,
    midpoint,
    spread,
    /* Basis points OF THE MIDPOINT. A 1¢ spread is worth far more at 5¢ than
       at 50¢, and the points figure alone hides that entirely. */
    spreadBps:
      spread !== null && midpoint !== null && midpoint > 0
        ? (spread / midpoint) * 10_000
        : null,
    spreadPoints: spread !== null ? spread * 100 : null,

    microprice: microprice(book),

    depth: {
      top1: depthOver(book, TOP_1),
      top5: depthOver(book, TOP_5),
      top10: depthOver(book, TOP_10),
      within1c: depthOver(book, WITHIN_1C),
      within2c: depthOver(book, WITHIN_2C),
    },

    weightedImbalance: weightedImbalance(book),

    bidWalls: tracker?.walls(book, "bid") ?? [],
    askWalls: tracker?.walls(book, "ask") ?? [],

    bidSlope: slopeOf(book.bids),
    askSlope: slopeOf(book.asks),

    bidVacuumTicks: vacuumOf(book.bids, book.tickSize),
    askVacuumTicks: vacuumOf(book.asks, book.tickSize),

    crossed,
    oneSided: !twoSided,

    timestamp: book.timestamp,
    transport: book.transport,
  };
}

/* ---------------------------------------------------------------------------
   Support and resistance
--------------------------------------------------------------------------- */

/**
 * The nearest persistent wall below (support) or above (resistance) a price.
 *
 * Used for target and invalidation placement. Returns null when no level has
 * persisted long enough to be worth naming — in which case the strategy that
 * asked must fall back to a method that does not need one, or decline to
 * produce a signal. It must not invent a level.
 */
export function nearestZone(
  analytics: BookAnalytics,
  price: number,
  direction: "support" | "resistance",
): LiquidityZone | null {
  const candidates =
    direction === "support"
      ? analytics.bidWalls.filter((zone) => zone.price < price)
      : analytics.askWalls.filter((zone) => zone.price > price);

  if (candidates.length === 0) return null;

  /* Nearest, not largest: the first wall the price meets is the one that
     stops it, whatever is stacked behind it. */
  return candidates.reduce((closest, zone) =>
    Math.abs(zone.price - price) < Math.abs(closest.price - price) ? zone : closest,
  );
}
