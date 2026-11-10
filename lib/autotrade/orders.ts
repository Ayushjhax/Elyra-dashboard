import { LIMITS, marketFor, type RuleMode, type Side } from "@/lib/autotrade/rules";

/* ---------------------------------------------------------------------------
   Limit orders: open a long or a short when the price reaches a level, with
   a take-profit and a stop-loss attached. Pure.

   A limit order waits for a BETTER price than now: a long below the market,
   a short above it. One placed on the wrong side would fill at once, at the
   market — which is a market order with a misleading name — so it is refused
   with the current price in the message, rather than placed.

   Live orders rest on Hyperliquid's book with their exits attached
   (lib/autotrade/hyperliquid.ts `placeLimitOrder`), so they fill whether or
   not Elyra is open. Paper orders are filled by the five-minute check when a
   bar trades through the level.
--------------------------------------------------------------------------- */

export interface LimitOrderInput {
  coin: string;
  side: Side;
  price: number;
  sizeUsd: number;
  leverage: number;
  takeProfit: number;
  stopLoss: number;
  mode: RuleMode;
}

/** How far from the market a limit may sit — beyond this it is a typo more often than a plan. */
export const MAX_DISTANCE_PCT = 50;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * A limit order as typed, checked against the market and the limits, or
 * what is wrong with it in words. `mid` is the live price; null refuses,
 * because a level cannot be judged against a price nobody has.
 */
export function validateLimitOrder(input: Record<string, unknown>, mid: number | null): { order: LimitOrderInput } | { error: string } {
  const market = marketFor(input.coin);
  if (market === null) return { error: "Choose one of Elyra's markets." };
  if (input.side !== "long" && input.side !== "short") return { error: "Choose long or short." };
  const side = input.side;
  const { price, sizeUsd, leverage, takeProfit, stopLoss } = input;

  if (!finite(price)) return { error: "Enter the price to open at." };
  if (!finite(takeProfit) || !finite(stopLoss)) return { error: "Set both a take-profit and a stop-loss price." };
  if (!finite(sizeUsd) || sizeUsd < LIMITS.minSizeUsd || sizeUsd > LIMITS.maxSizeUsd) {
    return { error: `Size must be between $${LIMITS.minSizeUsd} and $${LIMITS.maxSizeUsd.toLocaleString("en-US")}.` };
  }
  if (typeof leverage !== "number" || !Number.isInteger(leverage) || leverage < 1 || leverage > LIMITS.maxLeverage) {
    return { error: `Leverage must be a whole number from 1 to ${LIMITS.maxLeverage}.` };
  }

  if (side === "long" ? !(stopLoss < price && price < takeProfit) : !(takeProfit < price && price < stopLoss)) {
    return {
      error:
        side === "long"
          ? "For a long, the stop-loss must be below the entry and the take-profit above it."
          : "For a short, the take-profit must be below the entry and the stop-loss above it.",
    };
  }
  const stopPct = (Math.abs(price - stopLoss) / price) * 100;
  if (stopPct * leverage >= 80) {
    return { error: "At that leverage the position would be liquidated before the stop-loss. Lower one of them." };
  }

  if (mid === null) return { error: "There is no live price for this market right now, so the level cannot be checked. Try again shortly." };
  const fmt = (value: number) => `$${Number(value.toPrecision(6))}`;
  if (side === "long" && price >= mid) {
    return { error: `${market.label} is at ${fmt(mid)}. A long limit must be below it — at or above, it would fill now.` };
  }
  if (side === "short" && price <= mid) {
    return { error: `${market.label} is at ${fmt(mid)}. A short limit must be above it — at or below, it would fill now.` };
  }
  if ((Math.abs(price - mid) / mid) * 100 > MAX_DISTANCE_PCT) {
    return { error: `That level is more than ${MAX_DISTANCE_PCT}% from ${fmt(mid)}. Check the price.` };
  }

  return {
    order: { coin: market.coin, side, price, sizeUsd, leverage, takeProfit, stopLoss, mode: input.mode === "live" ? "live" : "paper" },
  };
}

/**
 * Whether a paper limit was reached by a bar: a long fills when the price
 * trades down to it, a short when it trades up to it. Returns the bar the
 * fill happened in, so its time is the fill's.
 */
export function paperLimitFill<T extends { closeTime: number; low: number; high: number }>(
  order: { side: Side; price: number; createdAt: number },
  bars: readonly T[],
): T | null {
  for (const bar of bars) {
    if (bar.closeTime <= order.createdAt) continue;
    if (order.side === "long" ? bar.low <= order.price : bar.high >= order.price) return bar;
  }
  return null;
}
