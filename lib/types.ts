/* ---------------------------------------------------------------------------
   The typed surface between the UI and its data.

   The workspace's own vocabulary: venue filters, tabs, widgets, chart
   settings and the conversation. Account data has its own typed surface in
   lib/portfolio/types.ts; market data in lib/market/.
--------------------------------------------------------------------------- */

/** The four venues the ledger filters by. */
export type MarketType = "spot" | "perps" | "prediction" | "defi";

/** What the trading table is filtered to: one venue type, or every one. */
export type MarketFilter = MarketType | "all";

/** The three primary ledger tabs. */
export type LedgerTab = "positions" | "orders" | "history";

/** Chart intervals offered above the chart. */
export type Interval = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

/**
 * The three widgets in the workspace's left column.
 *
 * Their order and which are collapsed belong to the operator and persist, so
 * the store holds these keys rather than components — a saved layout is plain
 * JSON. What each key renders lives in components/shell/WidgetColumn.tsx.
 */
export type WidgetKey = "activity" | "watchlist" | "signals";

/** How the main series is drawn. Both are TradingView's own. */
export type ChartStyle = "candles" | "line";

/** The studies the chart toolbar can switch on and off. */
export interface ChartIndicators {
  ema: boolean;
  volume: boolean;
  /** Prior-day pivot levels, listed under the toolbar. */
  levels: boolean;
}

/** The agent panel's views. */
export type AgentTab = "ask" | "signals" | "research";

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
  /** What the agent is reading right now, while the reply is being written. */
  activity?: string;
  /** Where the reply's figures came from, from the tools that ran. */
  sources?: string[];
}
