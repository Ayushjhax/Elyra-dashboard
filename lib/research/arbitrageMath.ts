/* ---------------------------------------------------------------------------
   Arbitrage, as arithmetic. Pure.

   Two gaps between venues, each measured net of what closing it would cost
   in taker fees at the venues' base tiers:

   - Basis: Hyperliquid's perp against Binance's spot. A perp above spot
     can be sold against spot bought (cash-and-carry); below, the reverse,
     where shorting spot is possible. Four legs — open and close on each
     venue — pay the round trip.
   - Funding: the same perp's funding on Hyperliquid against Binance's,
     annualised. Long the venue that pays less, short the one that pays
     more, and the difference accrues while it lasts; the fees are paid
     once, so it is shown as the days the spread takes to cover them.

   Observations, never orders: prices move between legs, funding resets
   every hour on Hyperliquid and every eight on Binance, and the fee tiers
   here are the base ones. Nothing in Elyra trades these.

   Two venues sharing a ticker are not always quoting one asset. A ticker
   can name a different token on each (LIT), and Binance keeps answering
   with the last price of a pair it delisted (XMR). Either reads as a gap of
   thousands of basis points that no one could trade. So a Binance price is
   compared only when it is plausibly the same live market: its spot traded
   in the last day, and each Binance price is within SAME_ASSET_MAX_GAP_PCT
   of Hyperliquid's. A side that fails is left out of the row, not shown.
--------------------------------------------------------------------------- */

/** Further apart than this, two prices are not one asset (or one is stale). */
export const SAME_ASSET_MAX_GAP_PCT = 10;
/** A spot pair that traded less than this in a day is not a live price. */
export const MIN_SPOT_VOLUME_USD = 100_000;

/** Base-tier taker fees, percent per leg. Hyperliquid's is PAPER_COSTS.takerFeePct. */
export const TAKER_FEE_PCT = { hyperliquid: 0.045, binanceSpot: 0.1, binancePerp: 0.05 } as const;

/** Open and close on both venues. */
export const BASIS_ROUND_TRIP_BPS = 2 * (TAKER_FEE_PCT.hyperliquid + TAKER_FEE_PCT.binanceSpot) * 100;
export const FUNDING_ROUND_TRIP_BPS = 2 * (TAKER_FEE_PCT.hyperliquid + TAKER_FEE_PCT.binancePerp) * 100;

export interface ArbitrageInput {
  symbol: string;
  hyperliquid: { mark: number | null; fundingRate: number | null; fundingIntervalHours: number | null; volume24hUsd: number | null };
  binanceSpot: number | null;
  /** The spot pair's 24h quote volume, in dollars. */
  binanceSpotVolumeUsd: number | null;
  binancePerp: { mark: number | null; fundingRate: number | null; fundingIntervalHours: number | null };
}

export interface ArbitrageRow {
  symbol: string;
  hyperliquidMark: number | null;
  binanceSpot: number | null;
  /** Hyperliquid perp over Binance spot, basis points. */
  basisBps: number | null;
  /** |basis| left after the round trip's fees; negative when fees eat it. */
  netBasisBps: number | null;
  hyperliquidFundingApr: number | null;
  binanceFundingApr: number | null;
  /** Hyperliquid's APR minus Binance's, percentage points. */
  fundingSpreadApr: number | null;
  /** Days the spread takes to pay the fees, at today's rates. */
  breakEvenDays: number | null;
  volume24hUsd: number | null;
  /** Which way each gap points, in words the page translates. */
  basisSide: "perp-rich" | "perp-cheap" | null;
  fundingSide: "hyperliquid-pays-more" | "binance-pays-more" | null;
  /** A Binance price was left out: a different asset under the same ticker, or not a live market. */
  excluded: boolean;
}

/** Whether two prices plausibly quote the same asset. */
export function sameAsset(a: number | null, b: number | null): boolean {
  if (a === null || b === null || !(a > 0) || !(b > 0)) return false;
  /* Larger over smaller, so the answer does not depend on the order. */
  return (Math.max(a, b) / Math.min(a, b) - 1) * 100 <= SAME_ASSET_MAX_GAP_PCT;
}

/** A per-interval funding rate as an annual percentage. */
export function annualise(rate: number | null, intervalHours: number | null): number | null {
  if (rate === null || !Number.isFinite(rate)) return null;
  const hours = intervalHours !== null && intervalHours > 0 ? intervalHours : 8;
  return rate * (24 / hours) * 365 * 100;
}

export function arbitrageRow(input: ArbitrageInput): ArbitrageRow {
  const mark = input.hyperliquid.mark;
  const liveSpot = input.binanceSpot !== null && (input.binanceSpotVolumeUsd ?? 0) >= MIN_SPOT_VOLUME_USD;
  const spot = liveSpot && sameAsset(mark, input.binanceSpot) ? input.binanceSpot : null;
  const perpMatches = sameAsset(mark, input.binancePerp.mark);
  const excluded = (input.binanceSpot !== null && spot === null) || (input.binancePerp.mark !== null && !perpMatches);
  const basisBps = mark !== null && spot !== null && spot > 0 ? ((mark - spot) / spot) * 10_000 : null;
  const hyperliquidFundingApr = annualise(input.hyperliquid.fundingRate, input.hyperliquid.fundingIntervalHours ?? 1);
  const binanceFundingApr = perpMatches ? annualise(input.binancePerp.fundingRate, input.binancePerp.fundingIntervalHours ?? 8) : null;
  const fundingSpreadApr = hyperliquidFundingApr !== null && binanceFundingApr !== null ? hyperliquidFundingApr - binanceFundingApr : null;
  const dailyBps = fundingSpreadApr === null ? null : (Math.abs(fundingSpreadApr) * 100) / 365;
  return {
    symbol: input.symbol,
    hyperliquidMark: mark,
    binanceSpot: spot,
    basisBps,
    netBasisBps: basisBps === null ? null : Math.abs(basisBps) - BASIS_ROUND_TRIP_BPS,
    hyperliquidFundingApr,
    binanceFundingApr,
    fundingSpreadApr,
    breakEvenDays: dailyBps === null || dailyBps === 0 ? null : FUNDING_ROUND_TRIP_BPS / dailyBps,
    volume24hUsd: input.hyperliquid.volume24hUsd,
    basisSide: basisBps === null ? null : basisBps >= 0 ? "perp-rich" : "perp-cheap",
    fundingSide: fundingSpreadApr === null ? null : fundingSpreadApr >= 0 ? "hyperliquid-pays-more" : "binance-pays-more",
    excluded,
  };
}

/**
 * The rows worth reading first: any basis that clears its fees, then the
 * widest funding spreads that pay for themselves within a fortnight.
 */
export function rankArbitrage(rows: readonly ArbitrageRow[]): ArbitrageRow[] {
  const score = (row: ArbitrageRow) => {
    const basis = row.netBasisBps !== null && row.netBasisBps > 0 ? row.netBasisBps : 0;
    const funding = row.breakEvenDays !== null && row.breakEvenDays <= 14 && row.fundingSpreadApr !== null ? Math.abs(row.fundingSpreadApr) : 0;
    return basis * 10 + funding;
  };
  return [...rows].sort((a, b) => score(b) - score(a) || Math.abs(b.fundingSpreadApr ?? 0) - Math.abs(a.fundingSpreadApr ?? 0));
}

/** Whether a row clears its costs: a basis net of fees, or a funding spread that pays back within a fortnight. */
export function clearsCosts(row: ArbitrageRow): boolean {
  return (row.netBasisBps !== null && row.netBasisBps > 0) || (row.breakEvenDays !== null && row.breakEvenDays <= 14);
}
