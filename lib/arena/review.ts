import { LIMITS, PAPER_COSTS, type Side } from "@/lib/autotrade/rules";

/* ---------------------------------------------------------------------------
   Trade Review — Game Review for trades. Pure.

   A closed trade is judged on how it was played against its own plan, not on
   whether it made money: a loss taken exactly at the planned stop is a good
   move, and a winner given back from the top is not. The facts come from the
   position as recorded and the bars it lived through; the label comes from
   `labelTrade`, never from a model. The model only writes coaching around
   these facts (lib/arena/writer.ts), and is held to their numbers.

   ── The label, in order (first match wins) ────────────────────────────

   R is the result in units of the planned risk: realised PnL ÷ (size ×
   distance from entry to stop). Held to plan means it closed by its
   take-profit, its stop-loss or its rule's exit — not closed by hand.

     Blunder     lost more than 1.5R, or abandoned the plan and lost over 1R
     Mistake     lost more than 1.1R (the stop slipped or was gapped), or
                 abandoned the plan into any loss
     Brilliant   held to plan, won 2R or more, kept ≥ 70% of the best move
     Great       held to plan and won 1R or more
     Inaccuracy  won, but kept under 30% of the best move it saw
     Good        held to plan and won, or took the planned loss at its stop
     Inaccuracy  anything else (a small loss on an exit, a scratch)
--------------------------------------------------------------------------- */

export type ReviewLabel = "brilliant" | "great" | "good" | "inaccuracy" | "mistake" | "blunder";

export const REVIEW_LABELS: readonly ReviewLabel[] = ["brilliant", "great", "good", "inaccuracy", "mistake", "blunder"];

export const LABEL_TEXT: Record<ReviewLabel, string> = {
  brilliant: "Brilliant",
  great: "Great",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

export const THRESHOLDS = {
  blunderR: -1.5,
  abandonedBlunderR: -1,
  mistakeR: -1.1,
  brilliantR: 2,
  brilliantCapture: 0.7,
  greatR: 1,
  gaveBackCapture: 0.3,
} as const;

const PLAN_EXITS = new Set(["take_profit", "stop_loss", "exit_rule"]);

export interface ReviewInput {
  side: Side;
  coin: string;
  mode: "paper" | "live";
  size: number;
  entryPrice: number;
  exitPrice: number;
  takeProfit: number;
  stopLoss: number;
  leverage: number | null;
  exitReason: string | null;
  realisedPnlUsd: number;
  openedAt: string;
  closedAt: string;
}

export interface ReviewFacts {
  side: Side;
  coin: string;
  mode: "paper" | "live";
  entryPrice: number;
  exitPrice: number;
  takeProfit: number;
  stopLoss: number;
  exitReason: string | null;
  sizeUsd: number;
  /** Share of the largest size a rule may take, percent. */
  sizeOfMaxPct: number;
  leverage: number | null;
  plannedRiskUsd: number;
  /** Planned reward ÷ planned risk. */
  plannedRewardRisk: number | null;
  pnlUsd: number;
  /** Null when the plan had no risk to measure against. */
  rMultiple: number | null;
  heldToPlan: boolean;
  /** Best and worst price while the trade was open, from bars; null when none were read. */
  bestPrice: number | null;
  worstPrice: number | null;
  /** Share of the best favourable move the exit kept, 0–1; null when there was none. */
  capture: number | null;
  /** Deepest adverse move from entry while open, percent. */
  heatPct: number | null;
  /** Paper fees are estimated from PAPER_COSTS; live fees are inside the realised result. */
  feesUsd: number | null;
  holdMinutes: number;
}

export function reviewFacts(input: ReviewInput, bars: readonly { high: number; low: number }[]): ReviewFacts {
  const long = input.side === "long";
  const sizeUsd = input.size * input.entryPrice;
  const plannedRisk = input.size * Math.abs(input.entryPrice - input.stopLoss);
  const plannedReward = input.size * Math.abs(input.takeProfit - input.entryPrice);
  const best = bars.length === 0 ? null : long ? Math.max(...bars.map((bar) => bar.high)) : Math.min(...bars.map((bar) => bar.low));
  const worst = bars.length === 0 ? null : long ? Math.min(...bars.map((bar) => bar.low)) : Math.max(...bars.map((bar) => bar.high));
  const favourable = best === null ? 0 : long ? best - input.entryPrice : input.entryPrice - best;
  const kept = long ? input.exitPrice - input.entryPrice : input.entryPrice - input.exitPrice;
  const adverse = worst === null ? null : long ? input.entryPrice - worst : worst - input.entryPrice;

  return {
    side: input.side,
    coin: input.coin,
    mode: input.mode,
    entryPrice: input.entryPrice,
    exitPrice: input.exitPrice,
    takeProfit: input.takeProfit,
    stopLoss: input.stopLoss,
    exitReason: input.exitReason,
    sizeUsd,
    sizeOfMaxPct: (sizeUsd / LIMITS.maxSizeUsd) * 100,
    leverage: input.leverage,
    plannedRiskUsd: plannedRisk,
    plannedRewardRisk: plannedRisk > 0 ? plannedReward / plannedRisk : null,
    pnlUsd: input.realisedPnlUsd,
    rMultiple: plannedRisk > 0 ? input.realisedPnlUsd / plannedRisk : null,
    heldToPlan: input.exitReason !== null && PLAN_EXITS.has(input.exitReason),
    bestPrice: best,
    worstPrice: worst,
    capture: favourable > 0 ? Math.max(0, Math.min(1, kept / favourable)) : null,
    heatPct: adverse === null ? null : Math.max(0, (adverse / input.entryPrice) * 100),
    feesUsd: input.mode === "paper" ? (input.size * (input.entryPrice + input.exitPrice) * PAPER_COSTS.takerFeePct) / 100 : null,
    holdMinutes: Math.max(0, (Date.parse(input.closedAt) - Date.parse(input.openedAt)) / 60_000),
  };
}

export function labelTrade(facts: ReviewFacts): ReviewLabel {
  const r = facts.rMultiple;
  if (r === null) return facts.pnlUsd > 0 ? "good" : "inaccuracy";
  const capture = facts.capture;
  if (r < THRESHOLDS.blunderR || (!facts.heldToPlan && r < THRESHOLDS.abandonedBlunderR)) return "blunder";
  if (r < THRESHOLDS.mistakeR || (!facts.heldToPlan && r < 0)) return "mistake";
  if (facts.heldToPlan && r >= THRESHOLDS.brilliantR && capture !== null && capture >= THRESHOLDS.brilliantCapture) return "brilliant";
  if (facts.heldToPlan && r >= THRESHOLDS.greatR) return "great";
  if (r > 0 && capture !== null && capture < THRESHOLDS.gaveBackCapture) return "inaccuracy";
  if (facts.heldToPlan && (r > 0 || facts.exitReason === "stop_loss")) return "good";
  return "inaccuracy";
}

const money = (value: number) => `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
const price = (value: number) => `$${Number(value.toPrecision(6))}`;

/**
 * The facts as lines of text — what the model is given, and the only
 * numbers it may repeat (lib/arena/writer.ts checks).
 */
export function factLines(facts: ReviewFacts, label: ReviewLabel): string[] {
  const exit =
    facts.exitReason === "take_profit"
      ? "at its take-profit"
      : facts.exitReason === "stop_loss"
        ? "at its stop-loss"
        : facts.exitReason === "exit_rule"
          ? "by its rule's exit"
          : "outside its plan";
  const lines = [
    `Label: ${LABEL_TEXT[label]}`,
    `Trade: ${facts.side} ${facts.coin} on ${facts.mode}`,
    `Entry ${price(facts.entryPrice)}, exit ${price(facts.exitPrice)}, closed ${exit}`,
    `Plan: take-profit ${price(facts.takeProfit)}, stop-loss ${price(facts.stopLoss)}`,
    `Result: ${money(facts.pnlUsd)}${facts.rMultiple === null ? "" : ` (${facts.rMultiple.toFixed(1)}R)`}`,
    `Size ${money(facts.sizeUsd)}${facts.leverage === null ? "" : ` at ${facts.leverage}x`}`,
  ];
  if (facts.plannedRewardRisk !== null) lines.push(`Planned reward to risk: ${facts.plannedRewardRisk.toFixed(1)}`);
  if (facts.capture !== null) lines.push(`Kept ${Math.round(facts.capture * 100)}% of the best move`);
  if (facts.bestPrice !== null) lines.push(`Best price while open ${price(facts.bestPrice)}`);
  if (facts.heatPct !== null) lines.push(`Deepest move against it ${facts.heatPct.toFixed(1)}%`);
  if (facts.feesUsd !== null) lines.push(`Estimated fees ${money(facts.feesUsd)}`);
  return lines;
}

/** Coaching written by code, used when the model is unavailable or strays from the facts. */
export function fallbackCoaching(facts: ReviewFacts, label: ReviewLabel): string {
  const plan = facts.heldToPlan ? "It closed on its plan" : "It was closed outside its plan";
  const r = facts.rMultiple === null ? "" : ` for ${facts.rMultiple.toFixed(1)}R`;
  const capture =
    facts.capture === null ? "" : ` It kept ${Math.round(facts.capture * 100)}% of the best move it saw.`;
  const lesson: Record<ReviewLabel, string> = {
    brilliant: "This is the trade to repeat: plan, patience and exit all lined up.",
    great: "A clean execution of the plan.",
    good: facts.pnlUsd < 0 ? "Taking the planned loss is the right move, even when it stings." : "The plan worked as written.",
    inaccuracy: facts.pnlUsd > 0 ? "Most of the move was given back; look at where the exit sat." : "A small cost; check whether the setup matched the rule.",
    mistake: "The loss ran past what the plan allowed.",
    blunder: "The loss went well beyond the plan; this is the habit to break.",
  };
  return `${plan}${r}.${capture} ${lesson[label]}`;
}
