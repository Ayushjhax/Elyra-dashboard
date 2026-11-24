/* ---------------------------------------------------------------------------
   Poly baskets: several Polymarket outcomes held together, on paper.

   Elyra places no Polymarket orders. A basket records what its outcomes
   would have cost and tracks them honestly:

     - each leg's entry is the order book walked for its share of the stake
       (lib/prediction/execution.ts), not the midpoint — a $500 buy into a
       thin book pays more than the top of it, and the basket says so;
     - each leg is valued at what selling its shares into the bids would
       raise now, not at the last trade;
     - a leg whose market has resolved is worth $1 a share if its outcome won
       and nothing if it lost, and stops moving.

   Pure.
--------------------------------------------------------------------------- */

export const BASKET_LIMITS = {
  minLegs: 2,
  maxLegs: 8,
  minStakeUsd: 10,
  maxStakeUsd: 10_000,
  maxBaskets: 10,
  maxName: 40,
} as const;

export interface LegChoice {
  conditionId: string;
  tokenId: string;
  outcome: string;
  question: string;
  slug: string | null;
  eventSlug: string | null;
}

export interface BasketInput {
  name: string;
  stakeUsd: number;
  legs: LegChoice[];
}

const str = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function validateBasket(input: Record<string, unknown>): { basket: BasketInput } | { error: string } {
  const name = str(input.name, 200);
  if (name === "" || name.length > BASKET_LIMITS.maxName) return { error: `Name the basket in at most ${BASKET_LIMITS.maxName} characters.` };
  const stake = input.stakeUsd;
  if (typeof stake !== "number" || !Number.isFinite(stake) || stake < BASKET_LIMITS.minStakeUsd || stake > BASKET_LIMITS.maxStakeUsd) {
    return { error: `Stake between $${BASKET_LIMITS.minStakeUsd} and $${BASKET_LIMITS.maxStakeUsd.toLocaleString("en-US")} of paper money.` };
  }
  const raw = Array.isArray(input.legs) ? input.legs : [];
  const legs: LegChoice[] = [];
  const tokens = new Set<string>();
  const markets = new Set<string>();
  for (const item of raw) {
    if (item === null || typeof item !== "object") return { error: "A basket leg is malformed." };
    const leg = item as Record<string, unknown>;
    const conditionId = str(leg.conditionId, 80);
    const tokenId = str(leg.tokenId, 100);
    if (!/^0x[0-9a-fA-F]{64}$/.test(conditionId) || !/^\d{1,90}$/.test(tokenId)) return { error: "A basket leg does not name a Polymarket outcome." };
    if (tokens.has(tokenId)) continue;
    if (markets.has(conditionId)) return { error: "A basket holds one outcome per market." };
    tokens.add(tokenId);
    markets.add(conditionId);
    legs.push({ conditionId, tokenId, outcome: str(leg.outcome, 80) || "Yes", question: str(leg.question, 300), slug: str(leg.slug, 200) || null, eventSlug: str(leg.eventSlug, 200) || null });
  }
  if (legs.length < BASKET_LIMITS.minLegs || legs.length > BASKET_LIMITS.maxLegs) {
    return { error: `A basket holds ${BASKET_LIMITS.minLegs} to ${BASKET_LIMITS.maxLegs} outcomes.` };
  }
  return { basket: { name, stakeUsd: Math.round(stake * 100) / 100, legs } };
}

/** The stake split evenly, in cents, the remainder to the first legs. */
export function splitStake(stakeUsd: number, legs: number): number[] {
  const cents = Math.round(stakeUsd * 100);
  const base = Math.floor(cents / legs);
  return Array.from({ length: legs }, (_, index) => (base + (index < cents - base * legs ? 1 : 0)) / 100);
}

export interface LegMark {
  costUsd: number;
  shares: number;
  /** What selling the shares into the bids raises now; null when the book cannot say. */
  valueUsd: number | null;
  /** 1 won, 0 lost, null unresolved. */
  settled: number | null;
}

export function legValue(leg: LegMark): number | null {
  if (leg.settled !== null) return Math.round(leg.shares * leg.settled * 100) / 100;
  return leg.valueUsd;
}

export interface BasketTotals {
  costUsd: number;
  valueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  settledLegs: number;
}

export function basketTotals(legs: readonly LegMark[]): BasketTotals {
  const cost = legs.reduce((sum, leg) => sum + leg.costUsd, 0);
  const values = legs.map(legValue);
  const value = values.every((entry) => entry !== null) ? values.reduce((sum: number, entry) => sum + (entry as number), 0) : null;
  return {
    costUsd: Math.round(cost * 100) / 100,
    valueUsd: value === null ? null : Math.round(value * 100) / 100,
    pnlUsd: value === null ? null : Math.round((value - cost) * 100) / 100,
    pnlPct: value === null || cost === 0 ? null : Math.round(((value - cost) / cost) * 10_000) / 100,
    settledLegs: legs.filter((leg) => leg.settled !== null).length,
  };
}

/** A resolved market's payout for an outcome: 1, 0, or null while it is not cleanly resolved. */
export function payoutOf(prices: readonly number[], outcomeIndex: number, closed: boolean): number | null {
  if (!closed) return null;
  const price = prices[outcomeIndex];
  if (!Number.isFinite(price)) return null;
  if (price >= 0.99) return 1;
  if (price <= 0.01) return 0;
  return null;
}
