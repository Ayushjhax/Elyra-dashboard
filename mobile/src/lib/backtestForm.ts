import type { CatalogueStrategy } from "@/lib/backtest/types";

/* ---------------------------------------------------------------------------
   The strategy builder's inputs, checked before anything is sent — the
   catalogue's own bounds for each parameter, the cost range the API
   accepts, and a strategy that only runs on intraday bars. A typed value is
   never changed to make it pass; it is named in the error instead.
--------------------------------------------------------------------------- */

export const MAX_COST_BPS = 1000;

/** "12" → 12; "" or "abc" → NaN. A comma is read as the decimal point. */
export function numberOr(value: string): number {
  const text = value.trim().replace(",", ".");
  return text === "" || !/^-?(\d+\.?\d*|\.\d+)$/.test(text) ? Number.NaN : Number(text);
}

export interface BuilderInput {
  strategy: CatalogueStrategy | null;
  /** Typed values by parameter key; a missing key means the default. */
  params: Record<string, string>;
  fee: string;
  slippage: string;
  timeframe: string;
}

export type BuilderCheck =
  | { ok: true; params: Record<string, number>; feeBps: number; slippageBps: number }
  | { ok: false; error: string };

export function checkBuilder(input: BuilderInput): BuilderCheck {
  const feeBps = numberOr(input.fee);
  const slippageBps = numberOr(input.slippage);
  if (!Number.isFinite(feeBps) || feeBps < 0 || feeBps > MAX_COST_BPS) return { ok: false, error: `Fee must be between 0 and ${MAX_COST_BPS.toLocaleString("en-US")} bps.` };
  if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > MAX_COST_BPS) {
    return { ok: false, error: `Slippage must be between 0 and ${MAX_COST_BPS.toLocaleString("en-US")} bps.` };
  }
  const params: Record<string, number> = {};
  for (const parameter of input.strategy?.parameters ?? []) {
    const typed = input.params[parameter.key];
    const value = typed === undefined ? parameter.default : numberOr(typed);
    if (!Number.isFinite(value)) return { ok: false, error: `${parameter.label} needs a number.` };
    if (parameter.min !== undefined && value < parameter.min) return { ok: false, error: `${parameter.label} must be at least ${parameter.min}.` };
    if (parameter.max !== undefined && value > parameter.max) return { ok: false, error: `${parameter.label} must be at most ${parameter.max}.` };
    params[parameter.key] = value;
  }
  if (input.strategy?.intradayOnly === true && input.timeframe === "1d") {
    return { ok: false, error: `${input.strategy.name} runs on intraday bars only. Choose 15m, 1h or 4h.` };
  }
  return { ok: true, params, feeBps, slippageBps };
}
