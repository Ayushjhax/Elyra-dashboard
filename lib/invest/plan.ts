import { fromBaseUnits, toBaseUnits } from "@/lib/solana/amount";
import type { ModelPortfolio, PositionUnits, PricedPortfolio } from "@/lib/invest/types";

/* ---------------------------------------------------------------------------
   The arithmetic of an Intelligent Portfolio: splitting a purchase, valuing a
   position, measuring drift, and planning the trades that correct it.

   Pure, and listed in lib/core.ts, so the website and the app plan the same
   trades from the same numbers.

   ── Money is split in base units, not floats ───────────────────────────

   A purchase is USDC, six decimals. It is divided across the holdings as an
   integer number of micro-dollars with the largest-remainder method, so the
   legs always add up to exactly what the person typed — never a cent over
   (a leg the wallet cannot fund) and never a cent quietly left behind.

   ── The drift rule: 5/25 ───────────────────────────────────────────────

   A holding is out of band when it sits more than 5 percentage points from
   its target, or more than a quarter of its target away — whichever is
   tighter. A 40% holding may wander to 35–45%; a 4% one to 3–5%. That is a
   common rule for model portfolios, chosen because it ignores the noise of
   a normal day and still catches a holding that has doubled.

   ── What is planned is a proposal ──────────────────────────────────────

   Nothing here trades. Each leg becomes one swap that the person reviews and
   signs; a leg the market refuses (an Ondo token outside its trading window)
   leaves the rest of the plan valid, and the next drift reading picks up
   what is missing.
--------------------------------------------------------------------------- */

export const USDC_DECIMALS = 6;

/**
 * The smallest swap a leg may be, in dollars.
 *
 * Ondo's market maker refuses orders under $1; two leaves room for a price
 * that moves while the dialog is open, and keeps a leg from costing more in
 * network fees than it is worth.
 */
export const MIN_LEG_USD = 2;

export const DRIFT_ABSOLUTE_BPS = 500;
export const DRIFT_RELATIVE = 0.25;

/**
 * Buys in a rebalance spend this share of what its sales are expected to
 * raise. A sale fills a little under its quote as often as over it, and a buy
 * sized to the quote would then be short of USDC and fail at the last step.
 */
export const REBALANCE_SPEND = 0.99;

function pow10(decimals: number): bigint {
  return BigInt(`1${"0".repeat(decimals)}`);
}

/** The smallest purchase whose smallest holding still clears `MIN_LEG_USD`. */
export function minimumInvestmentUsd(portfolio: Pick<ModelPortfolio, "holdings">): number {
  const smallest = Math.min(...portfolio.holdings.map((holding) => holding.weightBps));
  return Math.ceil((MIN_LEG_USD * 10_000) / smallest);
}

/**
 * `total` divided by basis-point weights, exactly.
 *
 * Each share is floored, then the micro-units left over go one each to the
 * shares that lost the most to flooring, so the parts always sum to `total`.
 */
export function splitByWeight(total: bigint, weightsBps: readonly number[]): bigint[] {
  const weights = weightsBps.map((weight) => BigInt(weight));
  const weightSum = weights.reduce((sum, weight) => sum + weight, BigInt(0));
  if (weightSum === BigInt(0)) return weights.map(() => BigInt(0));

  const floors = weights.map((weight) => (total * weight) / weightSum);
  const remainders = weights.map((weight, index) => total * weight - floors[index] * weightSum);
  let left = total - floors.reduce((sum, part) => sum + part, BigInt(0));

  const order = remainders
    .map((remainder, index) => ({ remainder, index }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));

  const parts = [...floors];
  for (const { index } of order) {
    if (left <= BigInt(0)) break;
    parts[index] += BigInt(1);
    left -= BigInt(1);
  }
  return parts;
}

export interface BuyLeg {
  side: "buy";
  symbol: string;
  ticker: string;
  /** USDC to spend, as an exact decimal string. */
  amount: string;
  usd: number;
}

export interface SellLeg {
  side: "sell";
  symbol: string;
  ticker: string;
  /** Units of the holding to sell, as an exact decimal string. */
  amount: string;
  usd: number;
}

export type Leg = BuyLeg | SellLeg;

/** One buy leg per holding, splitting `amountText` USDC by target weight. */
export function planBuy(
  portfolio: Pick<ModelPortfolio, "holdings">,
  amountText: string,
): { legs: BuyLeg[] } | { error: string } {
  const base = toBaseUnits(amountText, USDC_DECIMALS);
  if (base === null) return { error: "Enter an amount in USDC." };

  const total = BigInt(base);
  const minimum = minimumInvestmentUsd(portfolio);
  if (total < BigInt(minimum) * pow10(USDC_DECIMALS)) {
    return {
      error: `The smallest amount for this portfolio is $${minimum} — below that, its smallest holding would be under the $${MIN_LEG_USD} a swap needs.`,
    };
  }

  const parts = splitByWeight(
    total,
    portfolio.holdings.map((holding) => holding.weightBps),
  );

  return {
    legs: portfolio.holdings.map((holding, index) => ({
      side: "buy",
      symbol: holding.symbol,
      ticker: holding.ticker,
      amount: fromBaseUnits(parts[index], USDC_DECIMALS),
      usd: Number(parts[index]) / 10 ** USDC_DECIMALS,
    })),
  };
}

/** Whether a holding at `currentBps` is outside the 5/25 band around `targetBps`. */
export function isOutOfBand(targetBps: number, currentBps: number): boolean {
  const drift = Math.abs(currentBps - targetBps);
  return drift > DRIFT_ABSOLUTE_BPS || drift > targetBps * DRIFT_RELATIVE;
}

/**
 * A float truncated — never rounded — to `decimals`, as an exact string.
 *
 * Rounding up would ask to sell a unit more than is held. Null when the
 * result is zero, which is not a trade.
 */
export function truncateToDecimals(value: number, decimals: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const scaled = Math.floor(value * 10 ** decimals);
  if (!Number.isSafeInteger(scaled) || scaled <= 0) return null;
  return fromBaseUnits(BigInt(scaled), decimals);
}

/**
 * Recorded units, held to what the wallet actually has.
 *
 * Fills are recorded per portfolio, but the tokens all sit in one wallet,
 * and a person can sell some from anywhere. When the wallet holds less of a
 * token than the portfolios together recorded, each portfolio's share is
 * scaled down by the same proportion — the shortfall is shared, rather than
 * landing on whichever portfolio happened to be read first. A wallet holding
 * more than was recorded changes nothing: the extra was bought outside a
 * portfolio and is not one's to claim.
 *
 * `wallet` is symbol → whole units. Pass null when the wallet could not be
 * read, and the recorded units are returned as they are.
 */
export function heldUnits(
  positions: Record<string, PositionUnits>,
  wallet: Record<string, number> | null,
): Record<string, PositionUnits> {
  const recorded: Record<string, number> = {};
  for (const units of Object.values(positions)) {
    for (const [symbol, quantity] of Object.entries(units)) {
      recorded[symbol] = (recorded[symbol] ?? 0) + Math.max(0, quantity);
    }
  }

  const result: Record<string, PositionUnits> = {};
  for (const [id, units] of Object.entries(positions)) {
    const scaled: PositionUnits = {};
    for (const [symbol, quantity] of Object.entries(units)) {
      const own = Math.max(0, quantity);
      if (own === 0) continue;
      const held = wallet === null ? null : (wallet[symbol] ?? 0);
      const total = recorded[symbol] ?? 0;
      const scale = held === null || total <= held ? 1 : total > 0 ? held / total : 0;
      if (own * scale > 0) scaled[symbol] = own * scale;
    }
    result[id] = scaled;
  }
  return result;
}

export interface DriftRow {
  symbol: string;
  ticker: string;
  name: string;
  role: string;
  targetBps: number;
  units: number;
  priceUsd: number | null;
  change24hPct: number | null;
  /** Null only when units are held and the price is unknown. */
  valueUsd: number | null;
  /** Null when the total cannot be computed or nothing is held. */
  currentBps: number | null;
  outOfBand: boolean;
}

export interface DriftReport {
  rows: DriftRow[];
  /** Null when a held holding cannot be priced: a partial total is not the value. */
  totalUsd: number | null;
  /** Tickers held but unpriced. */
  unpriced: string[];
  held: boolean;
  outOfBand: boolean;
}

/** The position's value and each holding's share of it, against target. */
export function driftOf(portfolio: PricedPortfolio, units: PositionUnits): DriftReport {
  const unpriced: string[] = [];
  const valued = portfolio.holdings.map((holding) => {
    const held = Math.max(0, units[holding.symbol] ?? 0);
    const value = held === 0 ? 0 : holding.priceUsd === null ? null : held * holding.priceUsd;
    if (value === null) unpriced.push(holding.ticker);
    return { holding, held, value };
  });

  const held = valued.some((entry) => entry.held > 0);
  const totalUsd = unpriced.length > 0 ? null : valued.reduce((sum, entry) => sum + (entry.value ?? 0), 0);
  const countable = held && totalUsd !== null && totalUsd > 0;

  const rows: DriftRow[] = valued.map(({ holding, held: quantity, value }) => {
    const currentBps = countable && value !== null ? (value / (totalUsd as number)) * 10_000 : null;
    return {
      symbol: holding.symbol,
      ticker: holding.ticker,
      name: holding.name,
      role: holding.role,
      targetBps: holding.weightBps,
      units: quantity,
      priceUsd: holding.priceUsd,
      change24hPct: holding.change24hPct,
      valueUsd: value,
      currentBps,
      outOfBand: currentBps !== null && isOutOfBand(holding.weightBps, currentBps),
    };
  });

  return { rows, totalUsd, unpriced, held, outOfBand: rows.some((row) => row.outOfBand) };
}

export interface RebalancePlan {
  sells: SellLeg[];
  buys: BuyLeg[];
  /** Expected USDC the sells raise, before `REBALANCE_SPEND`. */
  raisedUsd: number;
}

/**
 * The trades that bring a position back to its targets.
 *
 * Sales first, into USDC; buys after, sized to what the sales are expected
 * to raise plus any new USDC added. Differences smaller than a leg's minimum
 * are left alone — a two-dollar correction costs more in fees than the drift
 * it fixes. With `addUsd`, the same plan finishes a purchase that stopped
 * part-way, or adds money in proportion.
 */
export function planRebalance(
  portfolio: PricedPortfolio,
  units: PositionUnits,
  addUsd = 0,
): RebalancePlan | { error: string } {
  const unpriced = portfolio.holdings.filter((holding) => holding.priceUsd === null);
  if (unpriced.length > 0) {
    return {
      error: `There is no price for ${unpriced.map((holding) => holding.ticker).join(", ")} right now, so the trades cannot be sized. Try again shortly.`,
    };
  }

  const values = portfolio.holdings.map(
    (holding) => Math.max(0, units[holding.symbol] ?? 0) * (holding.priceUsd as number),
  );
  const total = values.reduce((sum, value) => sum + value, 0) + Math.max(0, addUsd);
  if (total <= 0) return { sells: [], buys: [], raisedUsd: 0 };

  const sells: SellLeg[] = [];
  const wants: { index: number; usd: number }[] = [];

  portfolio.holdings.forEach((holding, index) => {
    const difference = total * (holding.weightBps / 10_000) - values[index];
    if (difference < -MIN_LEG_USD) {
      const price = holding.priceUsd as number;
      const heldQuantity = Math.max(0, units[holding.symbol] ?? 0);
      const quantity = Math.min(-difference / price, heldQuantity);
      const amount = truncateToDecimals(quantity, holding.decimals);
      if (amount !== null) {
        sells.push({ side: "sell", symbol: holding.symbol, ticker: holding.ticker, amount, usd: Number(amount) * price });
      }
    } else if (difference > MIN_LEG_USD) {
      wants.push({ index, usd: difference });
    }
  });

  const raisedUsd = sells.reduce((sum, leg) => sum + leg.usd, 0);
  const budget = raisedUsd * REBALANCE_SPEND + Math.max(0, addUsd);
  const wanted = wants.reduce((sum, want) => sum + want.usd, 0);
  const scale = wanted > budget ? budget / wanted : 1;

  const buys: BuyLeg[] = [];
  for (const want of wants) {
    const usd = want.usd * scale;
    if (usd < MIN_LEG_USD) continue;
    const amount = truncateToDecimals(usd, USDC_DECIMALS);
    if (amount === null) continue;
    const holding = portfolio.holdings[want.index];
    buys.push({ side: "buy", symbol: holding.symbol, ticker: holding.ticker, amount, usd: Number(amount) });
  }

  return { sells, buys, raisedUsd };
}

/**
 * The portfolio's 24-hour move, weighted by target, over the holdings that
 * report one.
 *
 * `coveredBps` says how much of the portfolio the figure stands for; the
 * surface says so when it is not all of it, rather than presenting a move
 * computed from half the holdings as the portfolio's.
 */
export function weightedMove(portfolio: PricedPortfolio): { pct: number | null; coveredBps: number } {
  let covered = 0;
  let weighted = 0;
  for (const holding of portfolio.holdings) {
    if (holding.change24hPct === null) continue;
    covered += holding.weightBps;
    weighted += holding.weightBps * holding.change24hPct;
  }
  return { pct: covered === 0 ? null : weighted / covered, coveredBps: covered };
}
