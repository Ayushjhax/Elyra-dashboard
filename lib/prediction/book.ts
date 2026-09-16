import type { PredictionOrderbook } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   The normalised order book, and the tick it lives on.

   ── One fact that shapes this whole feature ────────────────────────────

   On Polymarket a NO share is the complement of a YES share in the SAME
   central limit order book. Buying NO at 0.90 and selling YES at 0.10 are the
   same trade, so the venue reports them as the same resting order seen from
   two sides. Verified live across twelve markets, negative-risk and plain:

     YES bid 0.10 size 157,261.48   ⇄   NO ask 0.90 size 157,261.48
     YES ask 0.11 size 229,205.14   ⇄   NO bid 0.89 size 229,205.14

   Exactly. Every level, both sides, every market checked.

   The consequence is not cosmetic. It means a "YES/NO normalised
   probability" — yes / (yes + no) — is arithmetically identical to the YES
   price, because no ≡ 1 − yes by construction. Treating it as a second,
   agreeing opinion would be counting one number twice and calling the
   duplicate corroboration. `lib/prediction/basket.ts` therefore uses the
   complement as an INTEGRITY CHECK and gives it zero weight.

   Where it still earns its keep: if the two sides ever stop mirroring, the
   book is crossed, one side is stale, or a genuine arbitrage is open. All
   three are worth saying out loud, and none of them is a probability.

   ── Client-safe ───────────────────────────────────────────────────────

   No `server-only`: the order-book panel renders these types in the browser.
   Nothing here reads the network or the environment.
--------------------------------------------------------------------------- */

export interface BookLevel {
  /** 0–1. A probability, and also a price in dollars per share. */
  price: number;
  /** Shares resting at this level. */
  size: number;
  /** price × size. What it would cost to take the whole level. */
  notional: number;
}

/** Where a book came from, and therefore how much it can be trusted. */
export type BookTransport =
  /** A REST snapshot. Correct at a point in time, with no update stream. */
  | "rest_snapshot"
  /** A live feed that has delivered at least one update since its snapshot. */
  | "realtime";

export interface NormalizedBook {
  marketId: string;
  /** The CLOB token — ONE OUTCOME of a market. YES and NO are separate ids. */
  tokenId: string;
  outcomeLabel: string | null;

  /** Best (highest) first. */
  bids: BookLevel[];
  /** Best (lowest) first. */
  asks: BookLevel[];

  bestBid: number | null;
  bestAsk: number | null;
  /** Null on a one-sided book. Half of one quote is not a midpoint. */
  midpoint: number | null;
  spread: number | null;

  /**
   * MARKET-level last trade, not this outcome's. See `PredictionOrderbook`.
   *
   * Retained for display of "what last traded in this market" and for nothing
   * else. Per-outcome last trade comes from the tape, filtered on `tokenId`.
   */
  lastTradePrice: number | null;
  tickSize: number | null;
  minOrderSize: number | null;

  /** The venue's own sequence marker, when it sends one. */
  sequence: string | null;
  /** When the venue stamped this book, not when we parsed it. */
  timestamp: string;
  transport: BookTransport;
  source: "polymarket";
}

/* ---------------------------------------------------------------------------
   Tick normalisation
--------------------------------------------------------------------------- */

/** Polymarket's coarsest tick. Used only when the venue states nothing. */
const FALLBACK_TICK = 0.01;

/**
 * Rounds a price onto the market's tick.
 *
 * `direction` decides which way an off-tick price moves, and the caller must
 * choose it deliberately rather than taking the nearest value:
 *
 *   - an ENTRY on a buy rounds UP, so the quoted entry is one a taker can
 *     actually get filled at;
 *   - a TARGET rounds DOWN, so the reward is not overstated by half a tick;
 *   - an INVALIDATION on a long rounds DOWN, so the level is not tripped by a
 *     rounding artefact that never traded.
 *
 * Rounding all three to "nearest" flatters every setup by up to half a tick
 * in the direction the reader wants, which on a 1¢ tick and a 3¢ range is a
 * material distortion of the risk/reward.
 */
export function roundToTick(
  price: number,
  tickSize: number | null,
  direction: "nearest" | "up" | "down" = "nearest",
): number {
  const tick = tickSize !== null && tickSize > 0 ? tickSize : FALLBACK_TICK;

  /* Work in tick units to keep the arithmetic in integers for as long as
     possible: 0.1 / 0.01 is 10.000000000000002 in binary floating point, and
     Math.floor of that is 10 — but Math.floor of the same expression for
     0.29 / 0.01 (28.999999999999996) is 28, which would silently move a
     price a whole tick. The epsilon nudge absorbs that representation error
     without being large enough to cross a real tick boundary. */
  const raw = price / tick;
  const units =
    direction === "up"
      ? Math.ceil(raw - 1e-9)
      : direction === "down"
        ? Math.floor(raw + 1e-9)
        : Math.round(raw);

  const rounded = units * tick;

  /* Re-round to the tick's own decimal precision. 3 * 0.01 is
     0.030000000000000002, and a price that prints as 3.0000000000000004¢ in
     a signal card reads as a bug even though it is arithmetically fine. */
  const decimals = decimalsOf(tick);
  const clean = Number(rounded.toFixed(decimals));

  return Math.min(1, Math.max(0, clean));
}

function decimalsOf(tick: number): number {
  const text = tick.toString();
  if (text.includes("e-")) return Number(text.split("e-")[1]);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** Whether a price already sits on the tick. */
export function isOnTick(price: number, tickSize: number | null): boolean {
  return Math.abs(roundToTick(price, tickSize, "nearest") - price) < 1e-9;
}

/* ---------------------------------------------------------------------------
   Normalisation
--------------------------------------------------------------------------- */

function toLevels(
  raw: Array<{ price: number; size: number }>,
  best: "high" | "low",
): BookLevel[] {
  const rows: BookLevel[] = [];
  for (const level of raw) {
    if (!Number.isFinite(level.price) || !Number.isFinite(level.size)) continue;
    /* A zero-size level is a REMOVAL in the delta protocol, not a resting
       order. Keeping it would put a phantom price in the depth ladder and
       make `bestBid` a level nobody is bidding at. */
    if (level.size <= 0) continue;
    if (level.price <= 0 || level.price >= 1) continue;
    rows.push({ price: level.price, size: level.size, notional: level.price * level.size });
  }

  rows.sort((a, b) => (best === "high" ? b.price - a.price : a.price - b.price));
  return rows;
}

/**
 * The provider envelope, reduced to the analytical model.
 *
 * The provider already sorts best-first — Polymarket returns both sides with
 * the best price LAST, which the adapter corrects — but this re-sorts anyway.
 * Depending on an upstream sort order that is not in any contract is how the
 * best bid quietly becomes the worst one.
 */
export function normalizeBook(
  book: PredictionOrderbook,
  options: {
    outcomeLabel?: string | null;
    transport?: BookTransport;
    timestamp?: string;
    sequence?: string | null;
  } = {},
): NormalizedBook {
  const bids = toLevels(book.bids, "high");
  const asks = toLevels(book.asks, "low");

  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;

  return {
    marketId: book.marketId,
    tokenId: book.tokenId,
    outcomeLabel: options.outcomeLabel ?? null,
    bids,
    asks,
    bestBid,
    bestAsk,
    midpoint: bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null,
    spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
    lastTradePrice: book.lastTradePrice,
    tickSize: book.tickSize,
    minOrderSize: book.minOrderSize,
    sequence: options.sequence ?? null,
    timestamp: options.timestamp ?? new Date().toISOString(),
    transport: options.transport ?? "rest_snapshot",
    source: "polymarket",
  };
}

/** A book with no resting orders on either side. */
export function isEmpty(book: NormalizedBook): boolean {
  return book.bids.length === 0 && book.asks.length === 0;
}

/**
 * A book whose best bid is at or above its best ask.
 *
 * Transient and real: two marketable orders can rest for a moment before the
 * matching engine clears them. Every analytic that divides by the spread must
 * check this first, because a crossed book yields a negative spread and a
 * midpoint outside the range the two sides actually bracket.
 */
export function isCrossed(book: NormalizedBook): boolean {
  return book.bestBid !== null && book.bestAsk !== null && book.bestBid >= book.bestAsk;
}

/** Whether both sides have resting orders. */
export function isTwoSided(book: NormalizedBook): boolean {
  return book.bids.length > 0 && book.asks.length > 0;
}

/** How old the venue says this book is, in milliseconds. */
export function ageMs(book: NormalizedBook, now = Date.now()): number {
  return Math.max(0, now - Date.parse(book.timestamp));
}
