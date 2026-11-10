import "server-only";

import { DEFAULT_SETTINGS, type AutotradeCoin, type AutotradeInterval, type TradingRule } from "@/lib/autotrade/rules";
import type { Network } from "@/lib/autotrade/wire";
import { serviceClient } from "@/lib/supabase/server";
import { analysePaperTrades, type PaperAnalysis } from "@/lib/autotrade/analysis";
import type { OrderView } from "@/lib/autotrade/types";
import type { TradingOrderRow, TradingPositionRow, TradingRuleRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Trading automation, stored. Every read and write is scoped by user_id; the
   trading key is decrypted only by the engine, at the moment it signs, and
   no function here returns it.
--------------------------------------------------------------------------- */

export const num = (value: string | number | null | undefined): number => (value === null || value === undefined ? NaN : Number(value));

/** Live orders are sent only when the deployment says so. Off unless AUTOTRADE_LIVE=1. */
export function liveEnabled(): boolean {
  return process.env.AUTOTRADE_LIVE?.trim() === "1";
}

/** Testnet unless HYPERLIQUID_NETWORK=mainnet: a misconfigured server trades play money. */
export function tradingNetwork(): Network {
  return process.env.HYPERLIQUID_NETWORK?.trim() === "mainnet" ? "mainnet" : "testnet";
}

export function toRule(row: TradingRuleRow): TradingRule & { lastCheckedAt: string | null; lastNote: string | null } {
  return {
    id: row.id,
    name: row.name,
    side: row.side ?? "long",
    coin: row.coin as AutotradeCoin,
    strategyId: row.strategy_id,
    params: row.params ?? {},
    interval: row.interval as AutotradeInterval,
    sizeUsd: num(row.size_usd),
    leverage: row.leverage,
    takeProfitPct: num(row.take_profit_pct),
    stopLossPct: num(row.stop_loss_pct),
    mode: row.mode,
    enabled: row.enabled,
    lastSignalAt: row.last_signal_at,
    lastCheckedAt: row.last_checked_at,
    lastNote: row.last_note,
  };
}

export interface PositionView {
  id: string;
  ruleId: string | null;
  ruleName: string;
  mode: "paper" | "live";
  network: string | null;
  side: "long" | "short";
  coin: string;
  size: number;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  status: TradingPositionRow["status"];
  entryReason: string | null;
  exitPrice: number | null;
  exitReason: string | null;
  realisedPnlUsd: number | null;
  error: string | null;
  openedAt: string;
  closedAt: string | null;
}

export function toPosition(row: TradingPositionRow): PositionView {
  const optional = (value: string | number | null) => (value === null ? null : Number(value));
  return {
    id: row.id,
    ruleId: row.rule_id,
    ruleName: row.rule_name,
    mode: row.mode,
    network: row.network,
    side: row.side ?? "long",
    coin: row.coin,
    size: num(row.size),
    entryPrice: num(row.entry_price),
    takeProfit: num(row.take_profit),
    stopLoss: num(row.stop_loss),
    status: row.status,
    entryReason: row.entry_reason,
    exitPrice: optional(row.exit_price),
    exitReason: row.exit_reason,
    realisedPnlUsd: optional(row.realised_pnl_usd),
    error: row.error,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  };
}

export interface SettingsView {
  paused: boolean;
  dailyLossLimitUsd: number;
  maxOpenPositions: number;
}

export async function readSettings(userId: string): Promise<SettingsView> {
  const { data } = await serviceClient().from("trading_settings").select("*").eq("user_id", userId).maybeSingle();
  if (data === null || data === undefined) return { ...DEFAULT_SETTINGS };
  return { paused: data.paused, dailyLossLimitUsd: num(data.daily_loss_limit_usd), maxOpenPositions: data.max_open_positions };
}

export interface AgentView {
  network: Network;
  accountAddress: string;
  agentAddress: string;
  approved: boolean;
  approvedAt: string | null;
}

export async function readAgent(userId: string): Promise<AgentView | null> {
  const { data } = await serviceClient()
    .from("trading_agents")
    .select("network, account_address, agent_address, approved_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (data === null || data === undefined) return null;
  return {
    network: data.network,
    accountAddress: data.account_address,
    agentAddress: data.agent_address,
    approved: data.approved_at !== null,
    approvedAt: data.approved_at,
  };
}

export async function listRules(userId: string) {
  const { data, error } = await serviceClient().from("trading_rules").select("*").eq("user_id", userId).order("created_at", { ascending: true });
  if (error !== null) throw new Error(error.message);
  return (data ?? []).map(toRule);
}

export async function listPositions(userId: string, limit = 50): Promise<PositionView[]> {
  const { data, error } = await serviceClient()
    .from("trading_positions")
    .select("*")
    .eq("user_id", userId)
    .order("opened_at", { ascending: false })
    .limit(limit);
  if (error !== null) throw new Error(error.message);
  return (data ?? []).map(toPosition);
}

/** Whether a Supabase error is migration 0018 not having been applied. */
export function tablesMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return error !== null && error !== undefined && (error.code === "42P01" || error.code === "PGRST205" || /trading_/.test(error.message ?? ""));
}

export function toOrder(row: TradingOrderRow): OrderView {
  return {
    id: row.id,
    mode: row.mode,
    network: row.network,
    coin: row.coin,
    side: row.side,
    price: num(row.limit_price),
    sizeUsd: num(row.size_usd),
    leverage: row.leverage,
    takeProfit: num(row.take_profit),
    stopLoss: num(row.stop_loss),
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    filledAt: row.filled_at,
    cancelledAt: row.cancelled_at,
  };
}

/** Open orders and recent history. Empty, not an error, before migration 0020. */
export async function listOrders(userId: string, limit = 30): Promise<OrderView[]> {
  const { data, error } = await serviceClient()
    .from("trading_orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error !== null) return [];
  return (data ?? []).map(toOrder);
}

/**
 * Every closed paper trade, analysed. Leverage comes from the position (0020
 * onward), else from its rule's current setting, else it is "Not recorded".
 */
export async function paperAnalysis(userId: string, rules: { id: string; leverage: number }[]): Promise<PaperAnalysis | null> {
  const { data, error } = await serviceClient()
    .from("trading_positions")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", "paper")
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(2000);
  if (error !== null || data === null || data.length === 0) return null;
  const ruleLeverage = new Map(rules.map((rule) => [rule.id, rule.leverage]));
  return analysePaperTrades(
    data
      .filter((row) => row.closed_at !== null && row.realised_pnl_usd !== null)
      .map((row) => ({
        side: row.side === "short" ? "short" : "long",
        leverage: row.leverage ?? (row.rule_id !== null ? (ruleLeverage.get(row.rule_id) ?? null) : null),
        coin: row.coin,
        pnlUsd: num(row.realised_pnl_usd),
        exitReason: row.exit_reason,
        openedAt: row.opened_at,
        closedAt: row.closed_at as string,
      })),
  );
}
