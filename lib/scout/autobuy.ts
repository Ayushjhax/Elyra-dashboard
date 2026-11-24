import { LIMITS, PERP_MARKETS, type RuleMode } from "@/lib/autotrade/rules";

/* ---------------------------------------------------------------------------
   Auto-buys: a trade opened by a signal code detected, never by a model.

   Two triggers, both computed from public data:

     smart_money  at least `minWallets` of the smart-money cohort opened the
                  same side of a market in the last hour, and few opened the
                  other (lib/scout/flows.ts);
     listing      Bybit, OKX or Upbit announced, in its own feed, a listing of
                  a coin Hyperliquid trades (lib/scout/listings.ts) — the
                  official announcement, never a post about one.

   A read of a video, article or post never triggers anything: what a model
   took from a source is words for a person, not an order.

   The order itself is the chart ticket's market order: the same limits
   (`LIMITS`), the same account checks (`accountGate`), take-profit and
   stop-loss in the same request, paper unless the person chose live and the
   server is switched to live. A signal fires a rule once (unique on rule and
   signal key), and a rule fires at most `maxPerDay` times a UTC day.

   Pure.
--------------------------------------------------------------------------- */

export type Trigger = "smart_money" | "listing";
export type SideChoice = "long" | "short" | "both";

export const TRIGGERS: readonly Trigger[] = ["smart_money", "listing"];

export const AUTOBUY_LIMITS = {
  maxRules: 5,
  minWallets: 3,
  maxWallets: 10,
  maxPerDay: 5,
  maxName: 40,
  /** A smart-money signal counts opens inside this window. */
  flowWindowMs: 60 * 60_000,
  /** A listing older than this when first seen does not fire. */
  listingFreshMs: 2 * 60 * 60_000,
} as const;

export interface AutoBuyRule {
  name: string;
  trigger: Trigger;
  side: SideChoice;
  /** Markets the rule may trade; empty is every crypto market Elyra trades. */
  coins: string[];
  minWallets: number;
  sizeUsd: number;
  leverage: number;
  takeProfitPct: number;
  stopLossPct: number;
  maxPerDay: number;
  mode: RuleMode;
}

/** Crypto and memecoin perps: a listing or a cohort flow is about a coin, not a Nasdaq share. */
export const AUTOBUY_COINS: readonly string[] = PERP_MARKETS.filter((market) => market.group !== "nasdaq").map((market) => market.coin);

const between = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function validateRule(input: Record<string, unknown>): { rule: AutoBuyRule } | { error: string } {
  const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim() : "";
  if (name === "" || name.length > AUTOBUY_LIMITS.maxName) return { error: `Name the rule in at most ${AUTOBUY_LIMITS.maxName} characters.` };
  if (!TRIGGERS.includes(input.trigger as Trigger)) return { error: "Choose what triggers the rule." };
  const trigger = input.trigger as Trigger;
  const side: SideChoice = input.side === "short" || input.side === "both" ? input.side : "long";
  if (trigger === "listing" && side !== "long") return { error: "A listing rule only buys." };

  const coins = Array.isArray(input.coins) ? [...new Set(input.coins.filter((coin): coin is string => typeof coin === "string"))] : [];
  if (coins.some((coin) => !AUTOBUY_COINS.includes(coin))) return { error: "Choose markets from Elyra's crypto list." };

  const minWallets = trigger === "smart_money" ? input.minWallets : AUTOBUY_LIMITS.minWallets;
  if (!between(minWallets, AUTOBUY_LIMITS.minWallets, AUTOBUY_LIMITS.maxWallets) || !Number.isInteger(minWallets)) {
    return { error: `Wallets must be a whole number from ${AUTOBUY_LIMITS.minWallets} to ${AUTOBUY_LIMITS.maxWallets}.` };
  }
  const { sizeUsd, leverage, takeProfitPct, stopLossPct, maxPerDay } = input;
  if (!between(sizeUsd, LIMITS.minSizeUsd, LIMITS.maxSizeUsd)) {
    return { error: `Size must be between $${LIMITS.minSizeUsd} and $${LIMITS.maxSizeUsd.toLocaleString("en-US")}.` };
  }
  if (!between(leverage, 1, LIMITS.maxLeverage) || !Number.isInteger(leverage)) {
    return { error: `Leverage must be a whole number from 1 to ${LIMITS.maxLeverage}.` };
  }
  if (!between(takeProfitPct, LIMITS.minTakeProfitPct, LIMITS.maxTakeProfitPct)) {
    return { error: `Take-profit must be between ${LIMITS.minTakeProfitPct}% and ${LIMITS.maxTakeProfitPct}%.` };
  }
  if (!between(stopLossPct, LIMITS.minStopLossPct, LIMITS.maxStopLossPct)) {
    return { error: `Stop-loss must be between ${LIMITS.minStopLossPct}% and ${LIMITS.maxStopLossPct}%.` };
  }
  if (stopLossPct * leverage >= 80) return { error: "At that leverage the position would be liquidated before the stop-loss. Lower one of them." };
  if (!between(maxPerDay, 1, AUTOBUY_LIMITS.maxPerDay) || !Number.isInteger(maxPerDay)) {
    return { error: `Trades a day must be a whole number from 1 to ${AUTOBUY_LIMITS.maxPerDay}.` };
  }
  return {
    rule: { name, trigger, side, coins, minWallets, sizeUsd, leverage, takeProfitPct, stopLossPct, maxPerDay, mode: input.mode === "live" ? "live" : "paper" },
  };
}

/** A detected signal, as the tick sees it. */
export interface DetectedSignal {
  /** Unique per event: `sm:SOL:long:2026-11-25`, `listing:OKX:<id>:SOL`. */
  key: string;
  trigger: Trigger;
  coin: string;
  side: "long" | "short";
  /** Cohort wallets that opened this side (smart money only). */
  wallets: number | null;
  /** One line for the person's record, written by code. */
  reason: string;
  at: number;
}

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A smart-money signal fires a rule once per market, side and UTC day. */
export function flowKey(coin: string, side: "long" | "short", at: number): string {
  return `sm:${coin}:${side}:${utcDay(at)}`;
}

export function listingKey(exchange: string, id: string, coin: string): string {
  return `listing:${exchange}:${id}:${coin}`;
}

/** Whether a rule wants this signal. The day's count and the account's limits are checked by the caller. */
export function wants(rule: AutoBuyRule, signal: DetectedSignal): boolean {
  if (rule.trigger !== signal.trigger) return false;
  if (rule.coins.length > 0 && !rule.coins.includes(signal.coin)) return false;
  if (!AUTOBUY_COINS.includes(signal.coin)) return false;
  if (rule.side !== "both" && rule.side !== signal.side) return false;
  if (signal.trigger === "smart_money" && (signal.wallets ?? 0) < rule.minWallets) return false;
  return true;
}
