import { validateMarketOrder, type MarketOrderInput } from "@/lib/autotrade/orders";
import { LIMITS, exitPrices, netPnl, paperExit, paperFill, type RuleMode, type Side } from "@/lib/autotrade/rules";
import type { Candle } from "@/lib/backtest/intervals";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Copy trading, as rules. Pure: the engine (lib/copy/engine.ts) and the
   routes (app/api/copy) hold every write to these.

   A leader is a rule set someone published, or one of Elyra's own
   (lib/copy/house.ts). A follower copies the set's new entries into their
   own account — their size, their mode, their account's limits — and the
   copy closes when the leader's position closes. The copy keeps the
   leader's take-profit and stop-loss as prices, so it plans the same trade;
   it is not sent if the price has already moved too far past the leader's
   entry, or past either exit.
--------------------------------------------------------------------------- */

export const COPY_LIMITS = {
  maxFollowsPerAccount: 5,
  maxSetsPerAccount: 5,
  /** The furthest past the leader's entry a copy may fill, against the follower. */
  minDriftPct: 0.2,
  maxDriftPct: 3,
  defaultDriftPct: 1,
  /**
   * How long after a leader's entry it may still be copied. Two ticks: the
   * pass copies in the same tick the leader enters, and once more if that
   * tick failed. Later than that the setup is not the leader's any more.
   */
  freshMs: 12 * 60_000,
  nameMax: 40,
  descriptionMax: 280,
} as const;

/** Ready-made copying terms: a person picks one, then adjusts it. */
export const COPY_PRESETS = [
  { id: "careful", label: msg("Careful"), sizeUsd: 25, maxLeverage: 1, maxDriftPct: 0.5 },
  { id: "standard", label: msg("Standard"), sizeUsd: 100, maxLeverage: 2, maxDriftPct: 1 },
  { id: "bold", label: msg("Bold"), sizeUsd: 250, maxLeverage: 3, maxDriftPct: 1.5 },
] as const;

export interface FollowTerms {
  sizeUsd: number;
  maxLeverage: number;
  mode: RuleMode;
  maxDriftPct: number;
}

const between = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

/** Copying terms as typed, checked, or what is wrong with them in words. Missing fields take `base`. */
export function validateFollow(input: Record<string, unknown>, base?: FollowTerms): { terms: FollowTerms } | { error: string } {
  const sizeUsd = input.sizeUsd ?? base?.sizeUsd;
  const maxLeverage = input.maxLeverage ?? base?.maxLeverage;
  const mode = input.mode ?? base?.mode ?? "paper";
  const maxDriftPct = input.maxDriftPct ?? base?.maxDriftPct ?? COPY_LIMITS.defaultDriftPct;

  if (!between(sizeUsd, LIMITS.minSizeUsd, LIMITS.maxSizeUsd)) {
    return { error: `Size per trade must be between $${LIMITS.minSizeUsd} and $${LIMITS.maxSizeUsd.toLocaleString("en-US")}.` };
  }
  if (!between(maxLeverage, 1, LIMITS.maxLeverage) || !Number.isInteger(maxLeverage)) {
    return { error: `Leverage must be a whole number from 1 to ${LIMITS.maxLeverage}.` };
  }
  if (mode !== "paper" && mode !== "live") return { error: "Choose paper or live." };
  if (!between(maxDriftPct, COPY_LIMITS.minDriftPct, COPY_LIMITS.maxDriftPct)) {
    return { error: `The price allowance must be between ${COPY_LIMITS.minDriftPct}% and ${COPY_LIMITS.maxDriftPct}%.` };
  }
  return { terms: { sizeUsd, maxLeverage, mode, maxDriftPct: Math.round(maxDriftPct * 100) / 100 } };
}

export interface SetInput {
  name: string;
  description: string;
  ruleIds: string[];
  published: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A rule set as typed, checked, or what is wrong with it in words. Missing fields take `base`. */
export function validateSet(input: Record<string, unknown>, base?: SetInput): { set: SetInput } | { error: string } {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : base?.name;
  const description = typeof input.description === "string" ? input.description.trim() : (base?.description ?? "");
  const ruleIds = input.ruleIds ?? base?.ruleIds ?? [];
  const published = input.published ?? base?.published ?? false;

  if (name === undefined || name.length < 2 || name.length > COPY_LIMITS.nameMax) {
    return { error: `Give the set a name of 2 to ${COPY_LIMITS.nameMax} characters.` };
  }
  if (description.length > COPY_LIMITS.descriptionMax) return { error: `Keep the description under ${COPY_LIMITS.descriptionMax} characters.` };
  if (!Array.isArray(ruleIds) || !ruleIds.every((id) => typeof id === "string" && UUID.test(id))) return { error: "Choose rules from your own." };
  if (new Set(ruleIds).size !== ruleIds.length) return { error: "A rule appears twice." };
  if (ruleIds.length > LIMITS.maxRulesPerAccount) return { error: `A set holds at most ${LIMITS.maxRulesPerAccount} rules.` };
  if (typeof published !== "boolean") return { error: "Choose whether the set is shared." };
  if (published && ruleIds.length === 0) return { error: "Add at least one rule before sharing the set." };
  return { set: { name, description, ruleIds: ruleIds as string[], published } };
}

/** A leader's entry, as the copy needs it. */
export interface LeaderEntry {
  coin: string;
  side: Side;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  /** Null for positions from before migration 0020. */
  leverage: number | null;
}

/** How far the mid has moved past the leader's entry, against a follower, in percent. Negative is a better price. */
export function driftPct(entry: Pick<LeaderEntry, "side" | "entryPrice">, mid: number): number {
  const moved = ((mid - entry.entryPrice) / entry.entryPrice) * 100;
  return entry.side === "long" ? moved : -moved;
}

/**
 * The order that copies a leader's entry, or why it is not sent.
 *
 * The take-profit and stop-loss are the leader's own prices, measured from
 * the mid now, so the copy exits where the leader does. The leverage is the
 * leader's, never above the follower's ceiling. The result is held to the
 * same limits as any market order (`validateMarketOrder`).
 */
export function copyOrderFor(entry: LeaderEntry, terms: FollowTerms, mid: number): { order: MarketOrderInput; driftPct: number } | { skip: string } {
  if (!(mid > 0) || !(entry.entryPrice > 0)) return { skip: "No price to copy at." };
  const drift = driftPct(entry, mid);
  if (drift > terms.maxDriftPct) {
    return { skip: `The price has moved ${drift.toFixed(2)}% past the leader's entry, more than the ${terms.maxDriftPct}% allowed.` };
  }
  const long = entry.side === "long";
  const toTarget = ((long ? entry.takeProfit - mid : mid - entry.takeProfit) / mid) * 100;
  const toStop = ((long ? mid - entry.stopLoss : entry.stopLoss - mid) / mid) * 100;
  if (toTarget <= 0) return { skip: "The price is already past the leader's take-profit." };
  if (toStop <= 0) return { skip: "The price is already past the leader's stop-loss." };
  if (toTarget < LIMITS.minTakeProfitPct) return { skip: "Too close to the leader's take-profit to be worth copying." };

  const round = (value: number) => Math.round(value * 100) / 100;
  const checked = validateMarketOrder({
    coin: entry.coin,
    side: entry.side,
    sizeUsd: terms.sizeUsd,
    leverage: Math.max(1, Math.min(entry.leverage ?? 1, terms.maxLeverage)),
    takeProfitPct: round(Math.min(toTarget, LIMITS.maxTakeProfitPct)),
    stopLossPct: round(Math.min(Math.max(toStop, LIMITS.minStopLossPct), LIMITS.maxStopLossPct)),
    mode: terms.mode,
  });
  if ("error" in checked) return { skip: checked.error };
  return { order: checked.order, driftPct: drift };
}

/* ---------------------------------------------------------------------------
   Records
--------------------------------------------------------------------------- */

/** A closed trade, as a record needs it. */
export interface ClosedTrade {
  realisedPnlUsd: number;
  /** What was put up: entry × size ÷ leverage. */
  marginUsd: number;
  closedAt: number;
}

export interface LeaderRecord {
  trades: number;
  wins: number;
  /** Each trade's result over its own margin, in percent, summed — no compounding. */
  totalReturnPct: number;
  avgReturnPct: number | null;
  bestReturnPct: number | null;
  worstReturnPct: number | null;
  /** The running sum after each trade, oldest first; the spark line. */
  curve: number[];
  lastClosedAt: number | null;
}

/** A trade's result over its margin, in percent; null when either is unknown. */
export function returnOnMargin(trade: Pick<ClosedTrade, "realisedPnlUsd" | "marginUsd">): number | null {
  if (!Number.isFinite(trade.realisedPnlUsd) || !(trade.marginUsd > 0)) return null;
  return (trade.realisedPnlUsd / trade.marginUsd) * 100;
}

/**
 * A record from closed trades. Sizes differ from trade to trade and from
 * person to person, so it is kept in returns on margin, never in dollars: a
 * leader's size is theirs, and a follower's result is their own size times
 * these.
 */
export function recordOf(trades: readonly ClosedTrade[]): LeaderRecord {
  const returns = [...trades]
    .sort((a, b) => a.closedAt - b.closedAt)
    .map((trade) => ({ at: trade.closedAt, pct: returnOnMargin(trade) }))
    .filter((entry): entry is { at: number; pct: number } => entry.pct !== null);
  let running = 0;
  const curve = returns.map((entry) => (running += entry.pct));
  const pcts = returns.map((entry) => entry.pct);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    trades: pcts.length,
    wins: pcts.filter((pct) => pct > 0).length,
    totalReturnPct: round(running),
    avgReturnPct: pcts.length === 0 ? null : round(running / pcts.length),
    bestReturnPct: pcts.length === 0 ? null : round(Math.max(...pcts)),
    worstReturnPct: pcts.length === 0 ? null : round(Math.min(...pcts)),
    curve: curve.map(round),
    lastClosedAt: returns.length === 0 ? null : returns[returns.length - 1].at,
  };
}

/* ---------------------------------------------------------------------------
   Backtest — a rule replayed on past bars, exactly as the pass would trade it
--------------------------------------------------------------------------- */

export interface SimulatedTrade {
  entryAt: number;
  exitAt: number;
  entryPrice: number;
  exitPrice: number;
  reason: "take_profit" | "stop_loss" | "exit_rule";
  realisedPnlUsd: number;
  marginUsd: number;
}

/**
 * A rule's trades over past bars, as the five-minute pass would have taken
 * them on paper: in at a bar's close when the strategy enters (paying
 * slippage), out at the stop or the target on any later bar — the stop
 * first when one bar touches both, as `paperExit` does — or at a bar's close
 * when the strategy's exit fires; both legs pay the taker fee. A short rule's
 * signals come from the mirrored chart and are passed in already mirrored;
 * its prices are the real ones. A trade still open at the end is left out.
 */
export function simulateRule(
  bars: readonly Candle[],
  signals: readonly { enterLong: boolean; exitLong: boolean }[],
  rule: { side: Side; sizeUsd: number; leverage: number; takeProfitPct: number; stopLossPct: number },
): SimulatedTrade[] {
  const trades: SimulatedTrade[] = [];
  if (signals.length !== bars.length) return trades;
  const margin = rule.sizeUsd / rule.leverage;
  let open: { entryAt: number; entryPrice: number; takeProfit: number; stopLoss: number; size: number } | null = null;

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (open !== null) {
      const hit = paperExit({ side: rule.side, entryPrice: open.entryPrice, takeProfit: open.takeProfit, stopLoss: open.stopLoss, openedAt: open.entryAt }, [bar]);
      const exit = hit !== null ? { price: paperFill(rule.side, "exit", hit.price), reason: hit.reason } : signals[index].exitLong ? { price: paperFill(rule.side, "exit", bar.close), reason: "exit_rule" as const } : null;
      if (exit !== null) {
        trades.push({
          entryAt: open.entryAt,
          exitAt: bar.closeTime,
          entryPrice: open.entryPrice,
          exitPrice: exit.price,
          reason: exit.reason,
          realisedPnlUsd: netPnl(rule.side, open.size, open.entryPrice, exit.price),
          marginUsd: margin,
        });
        open = null;
      }
      continue;
    }
    if (signals[index].enterLong) {
      const entryPrice = paperFill(rule.side, "entry", bar.close);
      const planned = exitPrices(rule.side, entryPrice, rule.takeProfitPct, rule.stopLossPct);
      open = { entryAt: bar.closeTime, entryPrice, takeProfit: planned.takeProfit, stopLoss: planned.stopLoss, size: rule.sizeUsd / entryPrice };
    }
  }
  return trades;
}
