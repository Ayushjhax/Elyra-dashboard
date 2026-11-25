import { AUTOTRADE_INTERVALS, marketFor, type AutotradeInterval } from "@/lib/autotrade/rules";

/* ---------------------------------------------------------------------------
   From a backtest to a paper rule. A backtest that ran on a market Elyra
   can trade, on a timeframe a rule can run, offers to start the same
   strategy — with the same parameters — as a paper rule on /automation.
   The link only fills the New rule form; nothing is created until the
   person adds it, and every rule still starts on paper and passes
   `validateRule`. Pure.
--------------------------------------------------------------------------- */

export interface RuleHandoff {
  strategyId: string;
  coin: string;
  interval: AutotradeInterval;
  params: Record<string, number>;
}

const STRATEGY_ID = /^[A-Z0-9_]{1,64}$/;
const PARAM_KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const MAX_PARAMS = 12;

/** The handoff a backtest offers, or null when its market or timeframe cannot run as a rule. */
export function handoffFor(input: { strategyId: string; symbol: string; timeframe: string; params?: Record<string, number> }): RuleHandoff | null {
  const market = marketFor(input.symbol);
  if (market === null || !STRATEGY_ID.test(input.strategyId)) return null;
  if (!(AUTOTRADE_INTERVALS as readonly string[]).includes(input.timeframe)) return null;
  const params: Record<string, number> = {};
  for (const [key, value] of Object.entries(input.params ?? {}).slice(0, MAX_PARAMS)) {
    if (PARAM_KEY.test(key) && Number.isFinite(value)) params[key] = value;
  }
  return { strategyId: input.strategyId, coin: market.coin, interval: input.timeframe as AutotradeInterval, params };
}

/** The /automation link for a handoff. */
export function handoffHref(handoff: RuleHandoff): string {
  const query = new URLSearchParams({ strategy: handoff.strategyId, coin: handoff.coin, interval: handoff.interval });
  for (const [key, value] of Object.entries(handoff.params)) query.set(`p.${key}`, String(value));
  return `/automation?${query.toString()}`;
}

/** A handoff read back from /automation's query, or null when it does not hold one. */
export function readHandoff(query: Record<string, string | string[] | undefined>): RuleHandoff | null {
  const one = (key: string) => {
    const value = query[key];
    return typeof value === "string" ? value : null;
  };
  const strategyId = one("strategy");
  const coin = one("coin");
  const interval = one("interval");
  if (strategyId === null || coin === null || interval === null) return null;
  const params: Record<string, number> = {};
  for (const key of Object.keys(query)) {
    if (!key.startsWith("p.")) continue;
    const value = Number(one(key));
    if (Number.isFinite(value)) params[key.slice(2)] = value;
  }
  return handoffFor({ strategyId, symbol: coin, timeframe: interval, params });
}
