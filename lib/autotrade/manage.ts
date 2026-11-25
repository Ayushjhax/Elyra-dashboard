import { LIMITS, netPnl, type Side } from "@/lib/autotrade/rules";

/* ---------------------------------------------------------------------------
   Managing an open position by hand — closing part of it, moving its
   take-profit or stop-loss — as rules. Pure, so every bound is tested.

   The bounds are the ones every entry is held to (`LIMITS`), measured from
   the entry, so a moved exit can never be further away than an entry could
   have set it. And an exit must sit on the right side of the price NOW: a
   take-profit already passed, or a stop already crossed, would fill the
   moment it is placed — that is a close, and closing has its own button.
--------------------------------------------------------------------------- */

/** The parts of a position a person may close by hand. */
export const CLOSE_FRACTIONS = [0.25, 0.5, 0.75, 1] as const;

export function validateFraction(value: unknown): { fraction: number } | { error: string } {
  const fraction = value === undefined || value === null || value === "" ? 1 : Number(value);
  if (!CLOSE_FRACTIONS.includes(fraction as (typeof CLOSE_FRACTIONS)[number])) {
    return { error: "Close 25%, 50%, 75% or all of the position." };
  }
  return { fraction };
}

export interface PartialClose {
  at: string;
  size: number;
  price: number;
  pnlUsd: number;
  reason: string;
}

/**
 * What a partial close leaves: the size still open and the result so far.
 * It is full only when nothing is left. Dust is the caller's to decide
 * before the order is sent (`closeTrade` takes it all), never after: a
 * remainder the exchange still holds must stay on the books, with its exits.
 */
export function afterPartial(input: {
  side: Side;
  size: number;
  entryPrice: number;
  fraction: number;
  exitPrice: number;
  /** The closing fill's size where the exchange reported it. */
  filledSize?: number | null;
  realisedSoFar: number;
}): { closed: number; remaining: number; pnlUsd: number; realised: number; full: boolean } {
  const wanted = input.size * input.fraction;
  const closed = Math.min(input.size, input.filledSize ?? wanted);
  const remaining = input.size - closed;
  const full = input.fraction >= 1 || remaining <= input.size * 1e-9;
  const pnlUsd = netPnl(input.side, closed, input.entryPrice, input.exitPrice);
  return { closed, remaining: full ? 0 : remaining, pnlUsd, realised: input.realisedSoFar + pnlUsd, full };
}

export interface ExitPrices {
  takeProfit: number;
  stopLoss: number;
}

/** A moved take-profit and stop-loss, held to the limits and to the price now. */
export function validateExits(
  input: Record<string, unknown>,
  position: { side: Side; entryPrice: number },
  mark: number,
): { exits: ExitPrices } | { error: string } {
  const takeProfit = Number(input.takeProfit);
  const stopLoss = Number(input.stopLoss);
  if (!Number.isFinite(takeProfit) || takeProfit <= 0 || !Number.isFinite(stopLoss) || stopLoss <= 0) {
    return { error: "Enter a take-profit and a stop-loss price." };
  }
  const long = position.side === "long";
  const entry = position.entryPrice;
  const tpPct = ((long ? takeProfit - entry : entry - takeProfit) / entry) * 100;
  const slPct = ((long ? entry - stopLoss : stopLoss - entry) / entry) * 100;

  if (long ? takeProfit <= mark : takeProfit >= mark) {
    return { error: long ? "A long's take-profit must be above the current price." : "A short's take-profit must be below the current price." };
  }
  if (long ? stopLoss >= mark : stopLoss <= mark) {
    return { error: long ? "A long's stop-loss must be below the current price." : "A short's stop-loss must be above the current price." };
  }
  if (tpPct > LIMITS.maxTakeProfitPct) {
    return { error: `The take-profit can be at most ${LIMITS.maxTakeProfitPct}% from the entry.` };
  }
  /* A stop moved into profit is a trailing stop: allowed, it only protects. */
  if (slPct > LIMITS.maxStopLossPct) {
    return { error: `The stop-loss can be at most ${LIMITS.maxStopLossPct}% from the entry.` };
  }
  return { exits: { takeProfit, stopLoss } };
}

/**
 * What the entry cost against the price when it was sent, in basis points:
 * positive when the fill was worse than the mid, negative when better.
 */
export function slippageBps(side: Side, expected: number | null, filled: number): number | null {
  if (expected === null || !Number.isFinite(expected) || expected <= 0 || !Number.isFinite(filled)) return null;
  const worse = side === "long" ? filled - expected : expected - filled;
  return Number(((worse / expected) * 10_000).toFixed(1));
}
