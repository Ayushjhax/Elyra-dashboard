import type { PredictionAlertRule } from "@/lib/prediction/alertTypes";
import type { ProbabilityBasket } from "@/lib/prediction/basket";
import type { BookLevel, BookTransport } from "@/lib/prediction/book";
import type { BookAnalytics } from "@/lib/prediction/book-analytics";
import type { ForwardRecord, PredictionSignalRecord, PredictionTechnicalSignal } from "@/lib/prediction/signal-types";
import type { PredictionMarket, PredictionTrade } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   What the prediction-market routes return — search, a market's live state,
   its order book and basket, the signal, the account link, alerts, the
   watchlist, and the app's exposure views — apart from the services that
   compute them, which are server-only, so the website, the Mini App and the
   Android app read one definition of each.

   Read-only throughout. Probabilities are prices set by traders, not Elyra
   forecasts, and nothing here places an order.
--------------------------------------------------------------------------- */

export type MarketPhase =
  | "disconnected"
  | "connecting"
  | "snapshot"
  | "live"
  | "stale"
  | "reconnecting";

/** /api/prediction/markets?q= */
export interface MarketsResponse {
  markets: PredictionMarket[];
  asOf: string;
  stale: boolean;
  warnings: string[];
}

export interface LiveOutcome {
  tokenId: string;
  label: string | null;
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  spread: number | null;
  tickSize: number | null;
  transport: BookTransport;
  timestamp: string | null;
}

/** /api/prediction/markets/[id]/live */
export interface LiveResponse {
  market: PredictionMarket;
  phase: MarketPhase;
  lastUpdateAt: string | null;
  outcomes: LiveOutcome[];
  recentTrades: PredictionTrade[];
  warnings: string[];
}

/** /api/prediction/markets/[id]/orderbook */
export interface BookResponse {
  market: { id: string; question: string };
  outcome: string | null;
  tokenId: string;
  bids: BookLevel[];
  asks: BookLevel[];
  analytics: BookAnalytics | null;
  transport: BookTransport;
  timestamp: string | null;
}

/** /api/prediction/markets/[id]/basket */
export interface BasketResponse {
  market: { id: string; question: string };
  outcome: string | null;
  basket: ProbabilityBasket;
  label: string;
  disclaimer: string;
}

/** /api/prediction/markets/[id]/signal — a quiet book is `signal: null` with its reason. */
export interface SignalResponse {
  signal: PredictionTechnicalSignal | null;
  reason?: string;
  storedSignalId?: string | null;
  skipped: Array<{ strategyId: string; reason: string }>;
  analytics?: BookAnalytics | null;
  basket: ProbabilityBasket | null;
  phase: MarketPhase | null;
}

/** /api/prediction/signals — the caller's own signal history. */
export interface SignalHistoryResponse {
  signals: PredictionSignalRecord[];
  forwardTrackRecord: ForwardRecord;
}

/** /api/prediction/alerts */
export interface PredictionAlertsResponse {
  alerts: PredictionAlertRule[];
}

/** /api/prediction/account (GET) */
export interface PredictionAccountResponse {
  connected: boolean;
  address: string | null;
  verifiedAt: string | null;
  /** The signed-in EVM wallet, offered as a starting point — not assumed. */
  suggestion: string | null;
}

/** What an address holds, read live before anything is linked. */
export interface FoundAccount {
  address: string;
  positionCount: number;
  valueUsd: number;
  activityCount: number;
  sample: Array<{ market: string; outcome: string; valueUsd: number | null }>;
}

/** /api/prediction/account (POST): a preview, a link, or a detection. */
export interface PredictionLinkResponse {
  preview?: boolean;
  connected?: boolean;
  verified?: boolean;
  detected?: boolean;
  found?: FoundAccount;
  candidates?: Array<FoundAccount & { kind: string; label: string }>;
  reason?: string;
}

/** One market on the caller's prediction watchlist. */
export interface WatchedMarket {
  marketId: string;
  tokenId: string | null;
  question: string | null;
  addedAt: string;
}

/** /api/prediction/watchlist */
export interface PredictionWatchlistResponse {
  markets: WatchedMarket[];
}

/* ---- the app's views (/api/app/prediction), as the agent's tools return them ---- */

export interface ToolMarketRow {
  marketId: string;
  question: string;
  outcomes: Array<{ label: string; impliedProbabilityPct: number }>;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  endsAt: string | null;
  status?: string;
  url?: string | null;
}

export interface TrendingView {
  asOf: string;
  source: string;
  markets: ToolMarketRow[];
  note: string;
}

export interface EventsView {
  asOf: string;
  source: string;
  category: string | null;
  events: Array<{
    eventId: string;
    title: string;
    categories: string[];
    endsAt: string | null;
    volumeUsd: number | null;
    liquidityUsd: number | null;
    url: string | null;
    markets: ToolMarketRow[];
  }>;
}

/** A position as the tools report it. Probabilities in percent, money in dollars. */
export interface PositionRow {
  positionId: string;
  marketId: string;
  market: string;
  outcome: string;
  shares: number;
  entryProbabilityPct: number | null;
  currentProbabilityPct: number | null;
  costBasisUsd: number | null;
  currentValueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  maxLossUsd: number | null;
  maxPayoutUsd: number | null;
  endsAt: string | null;
  status: string;
}

/** Every personal view says when no account is linked — not connected is not zero. */
export interface NotConnected {
  connected: false;
  error: string;
}

export interface SummaryView {
  connected: true;
  asOf: string;
  currentValueUsd: number | null;
  costBasisUsd: number | null;
  unrealisedPnlUsd: number | null;
  capitalAtRiskUsd: number | null;
  maxPayoutUsd: number | null;
  maxProfitUsd: number | null;
  activeMarkets: number;
  claimable: { count: number; valueUsd: number | null };
  largestPosition: PositionRow | null;
  bestPerformer: PositionRow | null;
  worstPerformer: PositionRow | null;
  nextResolution: PositionRow | null;
  resolvingWithin24h: number;
  resolvingWithin7d: number;
  warnings?: string[];
}

export interface PositionsView {
  connected: true;
  asOf: string;
  positions: PositionRow[];
  note?: string;
  withinHours?: number;
}

export interface ActivityView {
  connected: true;
  asOf: string;
  activity: Array<{
    kind: string;
    market: string;
    outcome: string | null;
    shares: number | null;
    probabilityPct: number | null;
    usdValue: number | null;
    at: string;
  }>;
}

/** Resting orders need a trading session Elyra does not hold: always said, never zero. */
export interface OrdersView {
  available: false;
  error: string;
}

export interface ExecutionView {
  market: string;
  outcome: string | null;
  side: "buy" | "sell";
  touchPct: number | null;
  averageFillPct: number | null;
  worstFillPct: number | null;
  shares: number;
  notionalUsd: number;
  slippagePoints: number;
  levelsConsumed: number;
  filled: boolean;
  unfilledUsd: number;
  warnings: string[];
}

export interface ExitView {
  market: string;
  outcome: string | null;
  markPct: number | null;
  tranches: Array<{
    fraction: number;
    shares: number;
    averagePct: number | null;
    proceedsUsd: number;
    slippagePoints: number;
    levelsConsumed: number;
    filled: boolean;
  }>;
}

export interface HistoryView {
  asOf: string;
  interval: string;
  openProbabilityPct?: number;
  currentProbabilityPct?: number;
  changePoints?: number;
  highPct?: number;
  lowPct?: number;
  samples?: number;
  points?: [];
  note?: string;
}

/** A tool that could not answer says why, in its own words. */
export interface ViewFailure {
  error: string;
  code?: string;
}

/** /api/app/prediction */
export interface PredictionViewResponse<T> {
  view: string;
  ok: boolean;
  data: T | NotConnected | ViewFailure;
}

/** Whether a view's answer is a refusal rather than data. */
export function isPredictionFailure<T>(data: T | NotConnected | ViewFailure): data is NotConnected | ViewFailure {
  /* No view's data carries `error`; a refusal always does. */
  return typeof data === "object" && data !== null && typeof (data as { error?: unknown }).error === "string";
}

/** Whether a personal view refused because no account is linked. */
export function isNotConnected(data: unknown): data is NotConnected {
  return typeof data === "object" && data !== null && (data as { connected?: unknown }).connected === false;
}
