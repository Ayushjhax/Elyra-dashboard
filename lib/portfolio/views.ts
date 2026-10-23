/* ---------------------------------------------------------------------------
   The detail views' payloads — what /api/app/views returns for each view,
   which is exactly what the agent's tools return (lib/agent/tools/elyra.ts)
   and the Telegram Mini App and chat views rendered. Typed here once, so the
   Android app reads the same fields the assistant is told about.

   A tool answers with `error` (and a `note` for the model) when it cannot
   read; every view type carries that possibility.
--------------------------------------------------------------------------- */

export interface ViewFailure {
  error: string;
  note?: string;
}

export interface RiskView {
  asOf: string;
  equityUsd: number | null;
  /** Spot and perp exposure to the same asset counted together, largest first. */
  largestExposures: { asset: string; exposureUsd: number | null; pctOfEquity: number | null }[];
  grossPerpExposureUsd: number | null;
  perpLeverageVsEquity: number | null;
  incomplete: boolean;
  note: string;
}

export interface DefiView {
  asOf: string;
  source: string;
  incomplete: boolean;
  /** Protocol sections the provider has not indexed — never read as "no positions". */
  warnings: string[];
  positions: {
    protocol: string;
    kind: string;
    label: string;
    netUsd: number | null;
    suppliedUsd: number | null;
    borrowedUsd: number | null;
    ltv: number | null;
    liquidationLtv: number | null;
    leverage: number | null;
    /** Null when the protocol publishes no liquidation threshold — never estimated. */
    pctFromLiquidation: number | null;
  }[];
  note: string;
}

export interface OrdersView {
  asOf: string;
  orders: {
    venue: string;
    symbol: string;
    side: string;
    size: number;
    limitPrice: number | null;
    orderType: string;
    reduceOnly: boolean;
    triggerPrice: number | null;
    placedAt: string;
  }[];
  /** Venues Elyra cannot read orders from — not the same as having none there. */
  unreadable: string[];
}

export interface FillsView {
  asOf: string;
  fills: {
    venue: string;
    symbol: string;
    side: string;
    direction: string;
    price: number;
    size: number;
    /** Null when the venue reported none (an opening fill). */
    realisedPnl: number | null;
    fee: number | null;
    feeToken: string | null;
    at: string;
  }[];
  unreadable: string[];
}

export type AppViewName = "risk" | "defi" | "orders" | "fills";

export interface AppViewResponse<T> {
  view: string;
  ok: boolean;
  data: T | ViewFailure;
}

/** Whether a view's data is the tool saying it could not read. */
export function isViewFailure<T extends object>(data: T | ViewFailure): data is ViewFailure {
  return typeof (data as ViewFailure).error === "string";
}

/** Realised PnL over a set of fills, and the fees paid — what the Fills screen totals. */
export function fillTotals(fills: FillsView["fills"]): { realisedPnl: number; fees: number; feeTokens: string[] } {
  let realisedPnl = 0;
  let fees = 0;
  const tokens = new Set<string>();
  for (const fill of fills) {
    realisedPnl += fill.realisedPnl ?? 0;
    fees += fill.fee ?? 0;
    if (fill.feeToken) tokens.add(fill.feeToken);
  }
  return { realisedPnl, fees, feeTokens: [...tokens] };
}
