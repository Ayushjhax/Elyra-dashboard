import { isTwoSided, type BookLevel, type NormalizedBook } from "@/lib/prediction/book";

/* ---------------------------------------------------------------------------
   What an order would actually get.

   ── Why this exists at all ─────────────────────────────────────────────

   The midpoint is not a price anyone trades at. On a book quoting 61/63 with
   $400 at the touch, "the market is at 62¢" is true and useless: a $5,000 buy
   clears the 63¢ level, then 64¢, then 66¢, and fills at an average nearer
   65¢. Quoting an entry of 62¢ and a target of 70¢ implies eight points of
   reward when the reachable figure is five.

   That gap is the difference between a backtest that survives contact with a
   real book and one that does not, and it is the reason every entry and exit
   figure in this feature is walked through the ladder rather than read off
   the touch.

   ── Partial fills are reported, never hidden ───────────────────────────

   If the book cannot absorb the order, `unfilledUsd` is non-zero and
   `filled` is false. A caller that ignores those fields and uses the average
   price anyway is quoting the price of a smaller trade than the one asked
   about. The signal engine checks them.

   Client-safe: pure arithmetic over a plain object.
--------------------------------------------------------------------------- */

export interface ExecutionRequest {
  side: "buy" | "sell";
  /** Dollars to spend (buy) or to realise (sell). Exclusive with `shares`. */
  notionalUsd?: number;
  /** Shares to acquire or dispose of. Exclusive with `notionalUsd`. */
  shares?: number;
}

export interface ExecutionEstimate {
  side: "buy" | "sell";

  /** Volume-weighted average fill. Null when nothing could fill. */
  averagePrice: number | null;
  /** The last, worst price touched. What the tail of the order paid. */
  worstPrice: number | null;
  /** The touch this order started from, for the slippage comparison. */
  referencePrice: number | null;

  shares: number;
  notionalUsd: number;

  /** Average fill minus the touch, in probability points. Signed: + is worse. */
  slippagePoints: number | null;
  /** The same, relative to the touch, in basis points. */
  slippageBps: number | null;

  levelsConsumed: number;
  /** Dollars the book could not absorb. Zero on a complete fill. */
  unfilledUsd: number;
  unfilledShares: number;
  filled: boolean;

  warnings: string[];
}

function empty(side: "buy" | "sell", warning: string): ExecutionEstimate {
  return {
    side,
    averagePrice: null,
    worstPrice: null,
    referencePrice: null,
    shares: 0,
    notionalUsd: 0,
    slippagePoints: null,
    slippageBps: null,
    levelsConsumed: 0,
    unfilledUsd: 0,
    unfilledShares: 0,
    filled: false,
    warnings: [warning],
  };
}

/**
 * Walks the live book and reports what the order would actually get.
 *
 * A BUY consumes asks; a SELL consumes bids. Sizing by dollars and sizing by
 * shares are genuinely different walks — a dollar budget buys fewer shares as
 * it climbs the ladder, so the two cannot be converted into one another at a
 * single price without reintroducing the error this function exists to
 * remove.
 */
export function estimateExecution(
  book: NormalizedBook,
  request: ExecutionRequest,
): ExecutionEstimate {
  const { side } = request;
  const levels: BookLevel[] = side === "buy" ? book.asks : book.bids;

  if (levels.length === 0) {
    return empty(
      side,
      side === "buy"
        ? "No asks resting — nothing to buy at any price."
        : "No bids resting — nothing to sell into.",
    );
  }

  const wantShares = request.shares;
  const wantUsd = request.notionalUsd;

  if (
    (wantShares === undefined && wantUsd === undefined) ||
    (wantShares !== undefined && wantUsd !== undefined)
  ) {
    return empty(side, "Specify exactly one of shares or notional.");
  }
  if ((wantShares ?? 1) <= 0 || (wantUsd ?? 1) <= 0) {
    return empty(side, "Order size must be positive.");
  }

  const reference = levels[0].price;

  let filledShares = 0;
  let spent = 0;
  let levelsConsumed = 0;
  let worstPrice: number | null = null;

  let remainingShares = wantShares ?? Infinity;
  let remainingUsd = wantUsd ?? Infinity;

  for (const level of levels) {
    if (remainingShares <= 1e-9 || remainingUsd <= 1e-9) break;

    /* How much of THIS level the order can take, under whichever constraint
       binds first. A dollar budget converts to shares at this level's own
       price, which is the whole point — at 63¢ a dollar buys 1.587 shares,
       at 66¢ it buys 1.515. */
    const affordable = remainingUsd === Infinity ? Infinity : remainingUsd / level.price;
    const take = Math.min(level.size, remainingShares, affordable);
    if (take <= 1e-9) break;

    filledShares += take;
    spent += take * level.price;
    remainingShares -= take;
    if (remainingUsd !== Infinity) remainingUsd -= take * level.price;

    worstPrice = level.price;
    levelsConsumed += 1;
  }

  if (filledShares <= 1e-9) {
    return empty(side, "The order could not fill at any resting level.");
  }

  const averagePrice = spent / filledShares;

  /* Slippage is signed so that POSITIVE always means worse for the trader:
     a buy filling above the touch and a sell filling below it are the same
     complaint, and flipping the sign per side would make the two unreadable
     side by side. */
  const rawSlip = side === "buy" ? averagePrice - reference : reference - averagePrice;

  const unfilledShares = wantShares !== undefined ? Math.max(0, wantShares - filledShares) : 0;
  const unfilledUsd = wantUsd !== undefined ? Math.max(0, wantUsd - spent) : 0;
  const filled = unfilledShares <= 1e-6 && unfilledUsd <= 1e-6;

  const warnings: string[] = [];
  if (!filled) {
    warnings.push(
      wantUsd !== undefined
        ? `The book absorbed $${spent.toFixed(2)} of $${wantUsd.toFixed(2)} — $${unfilledUsd.toFixed(2)} could not fill.`
        : `The book absorbed ${filledShares.toFixed(2)} of ${(wantShares ?? 0).toFixed(2)} shares.`,
    );
  }
  if (levelsConsumed >= 5) {
    warnings.push(
      `This order clears ${levelsConsumed} price levels — execution is materially worse than the touch.`,
    );
  }

  return {
    side,
    averagePrice,
    worstPrice,
    referencePrice: reference,
    shares: filledShares,
    notionalUsd: spent,
    slippagePoints: rawSlip * 100,
    slippageBps: reference > 0 ? (rawSlip / reference) * 10_000 : null,
    levelsConsumed,
    unfilledUsd,
    unfilledShares,
    filled,
    warnings,
  };
}

/**
 * The price a given size can actually be entered at.
 *
 * This is what a signal's entry should be built from when the strategy sizes
 * in dollars. Returns null when the book cannot fill the size at all, which
 * the caller must treat as "no tradable entry" rather than falling back to
 * the touch.
 */
export function executableEntryPrice(
  book: NormalizedBook,
  notionalUsd: number,
): number | null {
  const estimate = estimateExecution(book, { side: "buy", notionalUsd });
  return estimate.filled ? estimate.averagePrice : null;
}

export interface ExitLadder {
  /** Fraction of the position, e.g. 0.25. */
  fraction: number;
  shares: number;
  estimate: ExecutionEstimate;
}

/**
 * What it would cost to get out of a position in tranches.
 *
 * Answers the question a holder actually has — "can I get out, and at what?"
 * — which the mark price cannot. A position marked at 62¢ whose full exit
 * averages 57¢ is worth knowing about before resolution day, not after.
 */
export function estimateExitLadder(
  book: NormalizedBook,
  shares: number,
  fractions: number[] = [0.25, 0.5, 1],
): ExitLadder[] {
  if (!isTwoSided(book) && book.bids.length === 0) return [];

  return fractions
    .filter((fraction) => fraction > 0 && fraction <= 1)
    .map((fraction) => {
      const tranche = shares * fraction;
      return {
        fraction,
        shares: tranche,
        estimate: estimateExecution(book, { side: "sell", shares: tranche }),
      };
    });
}
