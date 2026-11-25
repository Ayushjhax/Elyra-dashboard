import "server-only";

import { hyperliquidCandles } from "@/lib/autotrade/hyperliquid";
import { INTERVAL_MINUTES, closedBars, mirrorCandles, type AutotradeInterval } from "@/lib/autotrade/rules";
import { num } from "@/lib/autotrade/store";
import { getStrategy } from "@/lib/backtest/strategies";
import { recordOf, simulateRule, type ClosedTrade } from "@/lib/copy/rules";
import type { BacktestView } from "@/lib/copy/types";
import type { TradingRuleRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   A leader's rules, replayed on Hyperliquid's own past bars (`simulateRule`)
   — what they would have done, not what they did. A new set has no record
   yet; this is the only way to see how its rules have behaved, and the page
   labels it as hypothetical beside the real record.

   Each rule is replayed over its last 1,000 closed bars (about 10 days of
   15-minute bars, 42 of hourly, 167 of four-hour), with its own parameters,
   size, leverage, target and stop, paying `PAPER_COSTS`. Kept for half an
   hour per set and per server instance.
--------------------------------------------------------------------------- */

const BARS = 1_000;
const KEEP_MS = 30 * 60_000;
const cache = new Map<string, { at: number; key: string; value: Promise<BacktestView | null> }>();

async function compute(rules: TradingRuleRow[], now: number): Promise<BacktestView | null> {
  const perRule: BacktestView["perRule"] = [];
  const trades: ClosedTrade[] = [];
  for (const rule of rules) {
    const strategy = getStrategy(rule.strategy_id);
    const interval = rule.interval as AutotradeInterval;
    const minutes = INTERVAL_MINUTES[interval];
    if (strategy === null || minutes === undefined) continue;
    const span = minutes * 60_000;
    const bars = closedBars(await hyperliquidCandles(rule.coin, interval, now - BARS * span, now), now);
    if (bars.length < strategy.warmupFor(rule.params ?? {})) continue;
    const side = rule.side ?? "long";
    const signals = strategy.evaluate(side === "short" ? mirrorCandles(bars) : bars, rule.params ?? {});
    const simulated = simulateRule(bars, signals, {
      side,
      sizeUsd: num(rule.size_usd),
      leverage: rule.leverage,
      takeProfitPct: num(rule.take_profit_pct),
      stopLossPct: num(rule.stop_loss_pct),
    });
    const closed = simulated.map((trade) => ({ realisedPnlUsd: trade.realisedPnlUsd, marginUsd: trade.marginUsd, closedAt: trade.exitAt }));
    trades.push(...closed);
    perRule.push({
      coin: rule.coin,
      side,
      interval,
      days: Math.round((bars.length * span) / 86_400_000),
      trades: closed.length,
      totalReturnPct: recordOf(closed).totalReturnPct,
    });
  }
  if (perRule.length === 0) return null;
  return { days: Math.max(...perRule.map((entry) => entry.days)), record: recordOf(trades), perRule, computedAt: new Date(now).toISOString() };
}

export function backtestLeader(setId: string, rules: TradingRuleRow[], now: number = Date.now()): Promise<BacktestView | null> {
  /* A set whose rules changed is replayed afresh. */
  const key = rules
    .map((rule) => [rule.id, rule.strategy_id, rule.coin, rule.side, rule.interval, rule.size_usd, rule.leverage, rule.take_profit_pct, rule.stop_loss_pct, JSON.stringify(rule.params)].join(":"))
    .sort()
    .join("|");
  const held = cache.get(setId);
  if (held !== undefined && held.key === key && now - held.at < KEEP_MS) return held.value;
  const value = compute(rules, now).catch(() => null);
  cache.set(setId, { at: now, key, value });
  return value;
}
