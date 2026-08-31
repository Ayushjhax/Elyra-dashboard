import "server-only";

import type { ExchangeId } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Portfolio data, normalised across venues.

   READ ONLY. Nothing in lib/exchange/ may call an endpoint that places,
   modifies or cancels an order. Binance's trading routes live under
   /fapi/v1/order and /api/v3/order; Hyperliquid's live at a different host
   entirely (/exchange, not /info). None of them appear anywhere in this
   directory, and none should be added here — order placement is a separate
   pass with its own confirmation flow.
--------------------------------------------------------------------------- */

export type PositionMarket = "spot" | "perp";

export interface LivePosition {
  exchange: ExchangeId;
  market: PositionMarket;
  /** Bare ticker, matching the rest of the app: SOL, not SOLUSDT. */
  symbol: string;
  /** How the venue names it, for display: "SOL-PERP", "SOL/USDT". */
  label: string;
  side: "long" | "short";
  /** Base units, always positive; direction is in `side`. */
  size: number;
  entryPrice: number | null;
  markPrice: number;
  liquidationPrice: number | null;
  unrealizedPnl: number | null;
  /** Quote currency, always positive. */
  notional: number;
  leverage: number | null;
}

export interface AccountEquity {
  exchange: ExchangeId;
  /** Total account value in quote currency. */
  equity: number;
  unrealizedPnl: number | null;
  /** Free collateral, where the venue reports it. */
  available: number | null;
}

/** A spot holding as the venue reports it, before it has been valued. */
export interface SpotBalance {
  symbol: string;
  size: number;
}

/**
 * What one connected exchange can answer.
 *
 * Perps and spot are separate calls because they are priced differently: a
 * venue supplies the mark for its own perp, but a spot balance is just a
 * quantity and has to be valued against market data. Folding both into one
 * method meant handing each source a price lookup before anything knew which
 * symbols needed pricing.
 */
export interface PortfolioSource {
  readonly id: ExchangeId;
  perpPositions(): Promise<LivePosition[]>;
  spotBalances(): Promise<SpotBalance[]>;
  equity(): Promise<AccountEquity>;
}

/**
 * Something that could not be read, and why — surfaced rather than hidden.
 *
 * `"market"` covers a gap that is not any one venue's fault, such as a spot
 * holding no price source lists. Attributing that to an exchange would name
 * the wrong culprit in the agent's reply.
 */
export interface SourceFailure {
  scope: ExchangeId | "market";
  reason: string;
}

export interface PortfolioResult {
  positions: LivePosition[];
  equities: AccountEquity[];
  /**
   * Venues that failed. The agent is required to say a venue was unreadable
   * rather than present a partial portfolio as a complete one.
   */
  failures: SourceFailure[];
}
