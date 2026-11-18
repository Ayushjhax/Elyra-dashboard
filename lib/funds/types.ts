/* ---------------------------------------------------------------------------
   Autonomous AI funds, as the website reads them. Pure.

   A fund is the person's own capital, run by an AI manager (an agent key)
   inside a charter the person wrote, administered by Elyra: every order held
   to the charter, the book marked to market, units and a high-water mark
   kept, the fund halted at its drawdown limit, every event in the ledger.
--------------------------------------------------------------------------- */

export type FundMode = "paper" | "live";
export type FundStatus = "active" | "paused" | "halted" | "winding_down" | "closed";
export type FundAction = "pause" | "resume" | "wind_down" | "graduate";

/** What the person sets, and the manager is held to. */
export interface FundCharter {
  name: string;
  /** The person's brief to the manager, in their own words. */
  objective: string;
  /** Hyperliquid perps it may trade (lib/autotrade/rules.ts PERP_MARKETS). */
  markets: string[];
  allowShorts: boolean;
  /** Largest single position, as a percentage of NAV. */
  maxPositionPct: number;
  /** Most total notional across positions, as a multiple of NAV. */
  maxGrossExposure: number;
  /** Most leverage on any one position. */
  maxLeverage: number;
  maxPositions: number;
  /** From the high-water mark: at this, Elyra halts the fund and closes every position. */
  maxDrawdownPct: number;
  /** In one UTC day: at this, no new positions until 00:00 UTC. */
  dailyLossPct: number;
}

/** The book, marked to market. Amounts in USD. */
export interface FundBook {
  navUsd: number;
  cashUsd: number;
  unrealisedUsd: number;
  realisedUsd: number;
  contributedUsd: number;
  withdrawnUsd: number;
  units: number;
  /** NAV per unit. Every fund starts at 100. */
  npu: number;
  /** Total notional of open positions at the mark. */
  grossUsd: number;
  /** Margin the open positions hold: notional at entry over leverage. */
  marginUsd: number;
  openPositions: number;
  /** A position had no live price, so it is marked at its entry. */
  stale: boolean;
}

export interface FundRisk {
  highWaterMark: number;
  /** Fall from the high-water mark, in percent; 0 at the high. */
  drawdownPct: number;
  /** Today's change per unit since 00:00 UTC, in percent; negative is a loss. */
  todayPct: number;
  /** Gross exposure as a multiple of NAV. */
  grossExposure: number;
  /** The largest new position the charter allows right now, in USD (0 when none). */
  maxNewPositionUsd: number;
  /** Why the manager cannot open a position right now; empty when it can. */
  blockers: string[];
}

export interface FundPositionView {
  id: string;
  coin: string;
  label: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  mark: number | null;
  notionalUsd: number;
  unrealisedUsd: number;
  takeProfit: number;
  stopLoss: number;
  leverage: number;
  status: "opening" | "open";
  openedAt: string;
}

export interface FundTradeView {
  id: string;
  coin: string;
  label: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number | null;
  realisedUsd: number;
  /** Elyra's words for why it closed. */
  exitReason: string;
  openedAt: string;
  closedAt: string;
}

export interface FundFlowView {
  id: string;
  kind: "subscribe" | "redeem";
  amountUsd: number;
  npu: number;
  units: number;
  at: string;
}

export interface FundNoteView {
  id: string;
  body: string;
  positionId: string | null;
  /** The manager's name, as the key is named. */
  author: string;
  at: string;
}

export interface FundMarkPoint {
  at: string;
  nav: number;
  npu: number;
}

export interface FundStats {
  /** Since launch, per unit, in percent. */
  returnPct: number;
  maxDrawdownPct: number;
  /** Annualised from daily closes; null with fewer than five. */
  volatilityPct: number | null;
  sharpe: number | null;
  days: number;
  trades: number;
  winRate: number | null;
  profitFactor: number | null;
  netPnlUsd: number;
  bestUsd: number | null;
  worstUsd: number | null;
}

export interface FundEventView {
  seq: number;
  at: string;
  actor: string;
  event: string;
  body: Record<string, unknown>;
  hash: string;
}

export interface FundSummary {
  id: string;
  name: string;
  mode: FundMode;
  status: FundStatus;
  navUsd: number | null;
  returnPct: number | null;
  drawdownPct: number | null;
  manager: { keyId: string; name: string; prefix: string } | null;
  managerSeenAt: string | null;
  haltReason: string | null;
  closedReason: "wound_down" | "graduated" | null;
  /** NAV per unit over the last week, oldest first, for a sparkline. */
  spark: number[];
  createdAt: string;
  closedAt: string | null;
}

export interface FundGraduation {
  ready: boolean;
  /** What is still missing, in words. Empty when ready. */
  reasons: string[];
  incubatedDays: number;
  closedTrades: number;
}

export interface FundDetail {
  summary: FundSummary;
  charter: FundCharter;
  book: FundBook;
  risk: FundRisk;
  stats: FundStats;
  positions: FundPositionView[];
  trades: FundTradeView[];
  flows: FundFlowView[];
  notes: FundNoteView[];
  marks: FundMarkPoint[];
  events: FundEventView[];
  /** Which lifecycle actions the person may take now. */
  actions: FundAction[];
  graduation: FundGraduation | null;
  predecessorId: string | null;
  successorId: string | null;
  finalReport: FundStats | null;
}

export interface FundManagerOption {
  keyId: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  /** The open fund it already manages, if any — a key manages one at a time. */
  managing: string | null;
}

export interface FundsResponse {
  funds: FundSummary[];
  managers: FundManagerOption[];
  live: { enabled: boolean; network: "mainnet" | "testnet"; keyApproved: boolean };
  error: string | null;
}
