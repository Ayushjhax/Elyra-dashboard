import type { BenchmarkKind, MarketRegion } from "@/lib/markets/exchanges";
import type { SessionStatus } from "@/lib/markets/schedule";

/* /api/markets and its parts, as the page reads them. Pure. */

export interface Quote {
  pythSymbol: string;
  /** The Pyth feed id; usable on the chart only when `chartable`. */
  feedId: number;
  ticker: string;
  name: string;
  /** What the price is quoted in: "USD", "JPY", … For FX, the quote currency. */
  currency: string;
  price: number | null;
  /** Against the previous session's close; null when no source gives it. */
  changePct: number | null;
  publishedAt: string | null;
  /** Dollar-priced feeds are in Elyra's chart catalogue; local-currency ones are not yet. */
  chartable: boolean;
}

export interface BenchmarkQuote extends Quote {
  label: string;
  kind: BenchmarkKind;
}

export interface ExchangeView {
  id: string;
  city: string;
  venue: string;
  country: string;
  region: MarketRegion;
  currency: string;
  /** Null when Pyth's schedule for this exchange could not be read. */
  session: SessionStatus | null;
  holidays: Array<{ date: string; closed: boolean }>;
  benchmarks: BenchmarkQuote[];
  /** Live local listings Pyth prices today. */
  liveListings: number;
  /** Local listings Pyth publishes but has not switched on yet. */
  comingSoon: number;
}

export interface RegionView {
  region: MarketRegion;
  label: string;
  openCount: number;
  exchangeIds: string[];
  benchmarks: BenchmarkQuote[];
  /** The region's companies listed in New York that belong to no exchange shown. */
  viaNewYork: Quote[];
}

export interface MarketsOverview {
  generatedAt: string;
  exchanges: ExchangeView[];
  regions: RegionView[];
  global: BenchmarkQuote[];
  fx: Quote[];
  error: string | null;
}

export interface Breadth {
  up: number;
  down: number;
  flat: number;
  unknown: number;
}

export interface ExchangeListings {
  exchangeId: string;
  generatedAt: string;
  /** The market's own listings, live on Pyth. */
  listings: Quote[];
  /** Its companies listed in New York (for Europe, while local feeds are not live). */
  viaNewYork: Quote[];
  breadth: Breadth;
  gainers: Quote[];
  losers: Quote[];
  comingSoon: number;
  error: string | null;
}

export interface MarketsBrief {
  generatedAt: string;
  text: string;
  /** "fallback" when written by code rather than the model. */
  model: string;
  facts: string[];
}
