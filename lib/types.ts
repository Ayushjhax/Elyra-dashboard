/* ---------------------------------------------------------------------------
   The typed surface between the UI and its data.

   Every panel reads these shapes and nothing else. Swapping lib/mock/* for a
   real API means satisfying this file — no component has to change.
--------------------------------------------------------------------------- */

/** The four venues the ledger filters by. */
export type MarketType = "spot" | "perps" | "prediction" | "defi";

/** The three primary ledger tabs. */
export type LedgerTab = "positions" | "orders" | "history";

/** Chart intervals offered above the chart. */
export type Interval = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

/**
 * The panels the operator can compose their own column out of.
 *
 * The key is what is stored and dragged; everything a key means — its label,
 * icon, group and what it renders — lives in components/shell/panelRegistry.tsx.
 * The store holds keys and not components so a saved layout is plain JSON.
 */
export type PanelKey =
  | "activity"
  | "watchlist"
  | "automation"
  | "signals"
  | "chat";

export interface Asset {
  /** Ticker, and the key everything else joins on. */
  symbol: string;
  name: string;
  price: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  /** Quote-currency volume over 24h. */
  volume24h: number;
  openInterest: number;
  /** Percent per 8h. Negative means shorts pay longs. */
  fundingPct: number;
  markPrice: number;
  /** Decimal places for price and for size, so columns never jitter. */
  pricePrecision: number;
  qtyPrecision: number;
  /** Fractional step used by the mock random walk. */
  volatility: number;
}

export type PositionSide = "long" | "short";

export interface Position {
  id: string;
  market: MarketType;
  symbol: string;
  /** How the venue names it: "SOL-PERP", "SOL/USDC", a prediction question. */
  label: string;
  side: PositionSide;
  size: number;
  entryPrice: number;
  markPrice: number;
  /** Null on venues that cannot liquidate you. */
  liquidationPrice: number | null;
  margin: number;
  pnl: number;
  pnlPct: number;
}

export type OrderSide = "buy" | "sell";
export type OrderKind = "limit" | "market" | "stop" | "take profit" | "trigger";
export type OrderStatus = "open" | "partial" | "queued" | "resting";

export interface Order {
  id: string;
  market: MarketType;
  symbol: string;
  label: string;
  placedAt: string;
  kind: OrderKind;
  side: OrderSide;
  price: number;
  size: number;
  /** Fraction filled, 0–1. */
  filled: number;
  status: OrderStatus;
}

export interface Trade {
  id: string;
  market: MarketType;
  symbol: string;
  label: string;
  filledAt: string;
  side: OrderSide;
  price: number;
  size: number;
  fee: number;
  total: number;
  txHash: string;
}

export type SignalSource =
  | "momentum"
  | "funding"
  | "flow"
  | "liquidity"
  | "volatility"
  | "onchain";

/** A signal is live until it expires, then it stays on the list as a record. */
export type SignalStatus = "active" | "expired";

/** One row of the supporting-metrics table under a signal. */
export interface SignalMetric {
  label: string;
  value: string;
  /** Colours the value. Omit where the number is neutral. */
  tone?: "positive" | "negative";
}

export interface Signal {
  id: string;
  source: SignalSource;
  createdAt: string;
  symbol: string;
  /** One line, observational. Never a promise. */
  thesis: string;
  /** 0–1. */
  confidence: number;
  /** The longer reasoning behind "View setup". */
  setup: string;

  status: SignalStatus;
  /** Which way the setup leans. Not an instruction. */
  side: PositionSide;
  /** The level the setup is measured from. */
  entry: number;
  target: number;
  stop: number;
  /** When the setup stops being current. */
  expiresAt: string;
  /** Plain-language market state: "ranging", "trending up". */
  regime: string;
  /** How the same pattern has resolved historically, and over how many fires. */
  winRatePct: number;
  backtestFires: number;
  /** The numbers behind the thesis, shown under a disclosure. */
  metrics: SignalMetric[];
}

export type RuleStatus = "armed" | "paused" | "triggered";

export interface Rule {
  id: string;
  name: string;
  /** Plain language, not a query language. */
  condition: string;
  status: RuleStatus;
  enabled: boolean;
  lastRunAt: string | null;
  symbol: string;
}

export type ActivityKind =
  | "fill"
  | "order"
  | "cancel"
  | "agent"
  | "rule"
  | "deposit"
  | "withdrawal"
  | "liquidation";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  text: string;
  at: string;
  /** True when the agent caused it — these rows get the lime rail. */
  agent: boolean;
}

/** A tool the agent ran, collapsed by default and expanding to its result. */
export interface ToolCall {
  id: string;
  label: string;
  columns: string[];
  rows: string[][];
  note?: string;
}

export type ChatRole = "agent" | "user";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  at: string;
  toolCall?: ToolCall;
}
