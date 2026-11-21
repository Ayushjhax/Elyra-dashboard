/* ---------------------------------------------------------------------------
   An order book, read for what it means to a trader. Pure.

   - The spread and the depth on each side within a band of the mid — how
     much could be bought or sold before the price moves that far.
   - A fill estimate: walking the book level by level for an order's size,
     what it would fill at on average, and what that costs against the mid
     in basis points. A market order on Hyperliquid is an aggressive limit
     with a slippage cap (LIMITS.entrySlippagePct), so an estimate beyond
     the cap says the order would not fill in full.

   An estimate is the book as it was read, a moment ago: a thin book moves.
--------------------------------------------------------------------------- */

export interface BookLevel {
  price: number;
  size: number;
}

export interface Book {
  coin: string;
  /** Best first. */
  bids: BookLevel[];
  asks: BookLevel[];
  at: string;
}

export interface BookStats {
  mid: number;
  bestBid: number;
  bestAsk: number;
  spreadBps: number;
  depth: Array<{ pct: number; bidUsd: number; askUsd: number }>;
}

export const DEPTH_BANDS = [0.5, 1, 2] as const;

export function bookStats(book: Book): BookStats | null {
  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  if (bestBid === undefined || bestAsk === undefined || bestAsk <= bestBid) return null;
  const mid = (bestBid + bestAsk) / 2;
  const notional = (levels: BookLevel[], within: (price: number) => boolean) =>
    levels.filter((level) => within(level.price)).reduce((sum, level) => sum + level.price * level.size, 0);
  return {
    mid,
    bestBid,
    bestAsk,
    spreadBps: ((bestAsk - bestBid) / mid) * 10_000,
    depth: DEPTH_BANDS.map((pct) => ({
      pct,
      bidUsd: notional(book.bids, (price) => price >= mid * (1 - pct / 100)),
      askUsd: notional(book.asks, (price) => price <= mid * (1 + pct / 100)),
    })),
  };
}

export interface FillEstimate {
  /** Average price over what the book could fill. */
  avgPrice: number;
  /** Against the mid; positive is worse for the trader. */
  slippageBps: number;
  filledUsd: number;
  /** The book held the whole size within what was read. */
  complete: boolean;
  /** The price of the last level the order reached. */
  worstPrice: number;
  levels: number;
}

/** A buy walks the asks; a sell walks the bids. */
export function estimateFill(book: Book, side: "buy" | "sell", sizeUsd: number): FillEstimate | null {
  const stats = bookStats(book);
  if (stats === null || !(sizeUsd > 0)) return null;
  const levels = side === "buy" ? book.asks : book.bids;
  let remaining = sizeUsd;
  let units = 0;
  let spent = 0;
  let worstPrice = levels[0].price;
  let used = 0;
  for (const level of levels) {
    if (remaining <= 0) break;
    const available = level.price * level.size;
    const take = Math.min(available, remaining);
    spent += take;
    units += take / level.price;
    remaining -= take;
    worstPrice = level.price;
    used += 1;
  }
  if (units === 0) return null;
  const avgPrice = spent / units;
  const worse = side === "buy" ? avgPrice - stats.mid : stats.mid - avgPrice;
  return {
    avgPrice,
    slippageBps: (worse / stats.mid) * 10_000,
    filledUsd: spent,
    complete: remaining <= sizeUsd * 1e-9,
    worstPrice,
    levels: used,
  };
}

/** Hyperliquid's l2Book: `levels` is [bids, asks], each `{ px, sz, n }` as strings. */
export function parseHyperliquidBook(coin: string, body: unknown): Book | null {
  if (typeof body !== "object" || body === null) return null;
  const levels = (body as { levels?: unknown }).levels;
  if (!Array.isArray(levels) || levels.length !== 2) return null;
  const side = (rows: unknown): BookLevel[] =>
    (Array.isArray(rows) ? rows : [])
      .map((row) => ({ price: Number((row as { px?: unknown }).px), size: Number((row as { sz?: unknown }).sz) }))
      .filter((level) => Number.isFinite(level.price) && level.price > 0 && Number.isFinite(level.size) && level.size > 0);
  const time = Number((body as { time?: unknown }).time);
  return { coin, bids: side(levels[0]), asks: side(levels[1]), at: new Date(Number.isFinite(time) ? time : Date.now()).toISOString() };
}
