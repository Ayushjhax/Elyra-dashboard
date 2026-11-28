import type { PaperAnalysis } from "@/lib/autotrade/analysis";
import type { AutotradeCoin, AutotradeInterval, RuleMode, Side } from "@/lib/autotrade/rules";
import type { PartialClose } from "@/lib/autotrade/manage";

/* ---------------------------------------------------------------------------
   /api/automation, as the website (and later the app) reads it. Pure.
--------------------------------------------------------------------------- */

export interface RuleView {
  id: string;
  name: string;
  side: Side;
  coin: AutotradeCoin;
  strategyId: string;
  params: Record<string, number>;
  interval: AutotradeInterval;
  sizeUsd: number;
  leverage: number;
  takeProfitPct: number;
  stopLossPct: number;
  mode: RuleMode;
  enabled: boolean;
  lastSignalAt: string | null;
  lastCheckedAt: string | null;
  /** What Elyra saw on this rule's last check, in words. */
  lastNote: string | null;
}

export interface TradeView {
  id: string;
  ruleId: string | null;
  ruleName: string;
  mode: RuleMode;
  network: string | null;
  side: Side;
  coin: string;
  size: number;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  status: "opening" | "open" | "closed" | "failed";
  entryReason: string | null;
  exitPrice: number | null;
  exitReason: string | null;
  realisedPnlUsd: number | null;
  error: string | null;
  openedAt: string;
  closedAt: string | null;
  /** 0028: the mid when the entry was sent; null for older positions. */
  expectedPrice?: number | null;
  /** What the entry cost against that mid, in basis points; positive is worse. */
  slippageBps?: number | null;
  /** The size it opened at; `size` is what is still open. */
  originalSize?: number;
  partialCloses?: PartialClose[];
  realisedPartialUsd?: number;
  /** An AI fund's position: closed whole only, its exits its manager's. */
  fund?: boolean;
  /** As entered; null for positions recorded before leverage was stored. */
  leverage?: number | null;
}

export interface OrderView {
  id: string;
  mode: RuleMode;
  network: string | null;
  coin: string;
  side: Side;
  price: number;
  sizeUsd: number;
  leverage: number;
  takeProfit: number;
  stopLoss: number;
  status: "open" | "filled" | "cancelled" | "failed";
  error: string | null;
  createdAt: string;
  filledAt: string | null;
  cancelledAt: string | null;
  /** The position a filled order opened (the engine records it as it fills). */
  positionId?: string | null;
}

export interface StrategyOption {
  id: string;
  name: string;
  category: string;
  rules: { entry: string; exit: string };
  parameters: { key: string; label: string; default: number; min?: number; max?: number; step?: number; description: string }[];
  intradayOnly: boolean;
}

export interface AutomationResponse {
  settings: { paused: boolean; dailyLossLimitUsd: number; maxOpenPositions: number };
  /** Elyra's trading key on Hyperliquid, without the key. */
  agent: { network: "mainnet" | "testnet"; accountAddress: string; agentAddress: string; approved: boolean; approvedAt: string | null } | null;
  /** Whether this deployment sends live orders, and to which network. */
  live: { enabled: boolean; network: "mainnet" | "testnet" };
  /** The person's EVM wallet: their Hyperliquid account. */
  accountAddress: string | null;
  rules: RuleView[];
  trades: TradeView[];
  /** Limit orders, newest first: open ones and recent history. */
  orders: OrderView[];
  /** From every closed paper trade; null when there are none. */
  analysis: PaperAnalysis | null;
  strategies: StrategyOption[];
  error: string | null;
}
