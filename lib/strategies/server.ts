import "server-only";

import { downsample } from "@/lib/funds/accounting";
import { runDesigned } from "@/lib/backtest/run";
import { designStrategy } from "@/lib/strategies/interpret";
import type { StrategyDesign } from "@/lib/strategies/spec";
import type { DesignResult, DesignSource, SavedDesign } from "@/lib/strategies/types";
import { serviceClient } from "@/lib/supabase/server";
import type { StrategyDesignRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The strategy designer's server half: testing a design on real candles,
   and keeping the person's designs.

   A test is the backtest engine's own run (lib/backtest/run.ts
   `runDesigned`) on Binance spot candles, long-only, 10 bps fees and 10 bps
   slippage each way, signals acted on at the next bar's open, stops and
   targets inside the bar — the same rules as every backtest in Elyra.
--------------------------------------------------------------------------- */

export const MIGRATION = "Saved strategies need database migration 0030, which has not been applied.";
export const MAX_SAVED = 50;
export const TEST_DAYS = [90, 180, 365, 730, 1460] as const;

const SYMBOL = /^[A-Z0-9]{2,12}$/;

export function cleanSymbol(raw: unknown): string | null {
  const symbol = typeof raw === "string" ? raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  return SYMBOL.test(symbol) ? symbol : null;
}

export async function testDesign(
  design: StrategyDesign,
  input: { symbol: string; days: number; now?: number },
): Promise<{ ok: true; result: DesignResult } | { ok: false; error: string }> {
  const days = (TEST_DAYS as readonly number[]).includes(input.days) ? input.days : 365;
  const endAt = input.now ?? Date.now();
  const startAt = endAt - days * 86_400_000;
  const outcome = await runDesigned(
    { symbol: input.symbol, timeframe: design.timeframe, startAt, endAt },
    designStrategy(design),
    { stopLossPct: design.risk.stopLossPct, takeProfitPct: design.risk.takeProfitPct, maxBarsHeld: design.risk.maxBarsHeld },
  );
  if (!outcome.ok || outcome.metrics === undefined || outcome.config === undefined) {
    return { ok: false, error: outcome.error ?? "The backtest could not run." };
  }
  const metrics = outcome.metrics;
  return {
    ok: true,
    result: {
      symbol: input.symbol,
      timeframe: design.timeframe,
      days,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      metrics: {
        totalReturnPct: metrics.totalReturnPct,
        benchmarkReturnPct: metrics.benchmarkReturnPct,
        maxDrawdownPct: metrics.maxDrawdownPct,
        cagrPct: metrics.cagrPct,
        sharpe: metrics.sharpe,
        trades: metrics.trades,
        winRatePct: metrics.winRatePct,
        profitFactor: metrics.profitFactor,
        exposurePct: metrics.exposurePct,
        averageBarsHeld: metrics.averageBarsHeld,
        totalFees: metrics.totalFees,
      },
      quality: outcome.quality ?? { level: "valid", issues: [] },
      equity: downsample((outcome.equity ?? []).map((point) => ({ time: point.time, equity: point.equity })), 240),
      initialCapitalUsd: outcome.config.initialCapitalUsd,
      trades: (outcome.trades ?? [])
        .slice(-40)
        .reverse()
        .map((trade) => ({
          entryTime: trade.entryTime,
          exitTime: trade.exitTime,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice,
          returnPct: trade.returnPct,
          netPnl: trade.netPnl,
          exitReason: trade.exitReason,
        })),
      warnings: outcome.warnings ?? [],
      testedAt: new Date(endAt).toISOString(),
    },
  };
}

/* ---- the person's designs ---- */

/** A typed value as a JSON column takes it. */
const asJson = (value: object): Record<string, unknown> => value as unknown as Record<string, unknown>;

export function tablesMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return error !== null && error !== undefined && (error.code === "42P01" || error.code === "PGRST205" || /strategy_designs/.test(error.message ?? ""));
}

export function toSaved(row: StrategyDesignRow): SavedDesign {
  return {
    id: row.id,
    design: row.design as unknown as StrategyDesign,
    source: row.source,
    result: (row.result as unknown as DesignResult | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSaved(userId: string): Promise<{ saved: SavedDesign[]; error: string | null }> {
  const { data, error } = await serviceClient()
    .from("strategy_designs")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_SAVED);
  if (error !== null) return { saved: [], error: tablesMissing(error) ? MIGRATION : "Saved strategies could not be read." };
  return { saved: ((data ?? []) as StrategyDesignRow[]).map(toSaved), error: null };
}

export async function saveDesign(
  userId: string,
  input: { design: StrategyDesign; source: DesignSource; result: DesignResult | null },
): Promise<{ ok: true; saved: SavedDesign } | { ok: false; error: string; status: number }> {
  const db = serviceClient();
  const count = await db.from("strategy_designs").select("id").eq("user_id", userId);
  if (count.error !== null) return { ok: false, error: tablesMissing(count.error) ? MIGRATION : "Saved strategies could not be read.", status: 503 };
  if ((count.data ?? []).length >= MAX_SAVED) return { ok: false, error: `You can keep ${MAX_SAVED} strategies. Delete one first.`, status: 400 };
  const { data, error } = await db
    .from("strategy_designs")
    .insert({ user_id: userId, name: input.design.name, design: asJson(input.design), source: input.source, result: input.result === null ? null : asJson(input.result) })
    .select("*")
    .single();
  if (error !== null || data === null) return { ok: false, error: "The strategy could not be saved.", status: 503 };
  return { ok: true, saved: toSaved(data as StrategyDesignRow) };
}

export async function updateDesign(
  userId: string,
  id: string,
  input: { design: StrategyDesign; result: DesignResult | null },
): Promise<{ ok: true; saved: SavedDesign } | { ok: false; error: string; status: number }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "No such strategy.", status: 404 };
  const { data, error } = await serviceClient()
    .from("strategy_designs")
    .update({ name: input.design.name, design: asJson(input.design), result: input.result === null ? null : asJson(input.result), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error !== null) return { ok: false, error: "The strategy could not be saved.", status: 503 };
  if (data === null || data === undefined) return { ok: false, error: "No such strategy.", status: 404 };
  return { ok: true, saved: toSaved(data as StrategyDesignRow) };
}

export async function deleteDesign(userId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const { data } = await serviceClient().from("strategy_designs").delete().eq("id", id).eq("user_id", userId).select("id");
  return (data ?? []).length > 0;
}
