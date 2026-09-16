/* ---------------------------------------------------------------------------
   What changed that the operator should know about.

   Threshold detection in code, not by a model. A rule like "concentration
   crossed the saved limit" is a comparison; asking an LLM to notice it costs
   a round trip, is non-deterministic, and will occasionally miss. The model's
   job is to EXPLAIN an insight once this has found it.

   Every rule here is derived from figures the calculations module produced,
   so an insight cannot reference a number the rest of the page disagrees
   with. Rules that need inputs the account does not have simply do not fire —
   there is no "no data" insight, because an empty rail is quieter and more
   honest than a list of things that could not be measured.

   Pure, and exercised directly by unit tests.
--------------------------------------------------------------------------- */

import {
  change24h,
  contributions,
  exposures,
  largestExposure,
  stablecoinRatioPct,
  totalEquityUsd,
} from "@/lib/personalized/calculations";
import type { PersonalizedInsight, PersonalizedMemory } from "@/lib/personalized/types";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";

/** A day's move worth mentioning unprompted. */
const NOTABLE_MOVE_PCT = 2;

/** How close to liquidation before it leads the rail. */
const LIQUIDATION_WARN_PCT = 20;

/** Idle stablecoins past this share are worth naming. */
const IDLE_CAPITAL_PCT = 40;

function memoryNumber(memories: PersonalizedMemory[], type: string): number | null {
  const found = memories.find((memory) => memory.type === type);
  return typeof found?.value === "number" && Number.isFinite(found.value)
    ? found.value
    : null;
}

/**
 * Insights, most urgent first.
 *
 * Ordering is by consequence rather than by recency: a position near
 * liquidation outranks a pleasant day, because one of them can be acted on
 * and the other cannot.
 */
export function deriveInsights(
  snapshot: PortfolioSnapshot,
  memories: PersonalizedMemory[],
): PersonalizedInsight[] {
  const insights: PersonalizedInsight[] = [];
  const total = totalEquityUsd(snapshot);

  /* ---- Liquidation proximity: the only one that can be urgent ---- */
  const nearest = snapshot.perps
    .filter((p) => p.liquidationPrice !== null && p.markPrice !== null && p.markPrice > 0)
    .map((p) => ({
      market: p.market,
      pct: Math.abs((p.markPrice! - p.liquidationPrice!) / p.markPrice!) * 100,
    }))
    .sort((a, b) => a.pct - b.pct)[0];

  if (nearest !== undefined && nearest.pct <= LIQUIDATION_WARN_PCT) {
    insights.push({
      id: "liquidation",
      tone: "risk",
      title: `${nearest.market} is ${nearest.pct.toFixed(1)}% from liquidation`,
      detail: "Closest open position to its liquidation price.",
      prompt: `What happens to my ${nearest.market} position if price moves against me?`,
    });
  }

  /* ---- Concentration against a saved limit ---- */
  const limit = memoryNumber(memories, "concentration_limit");
  const largest = largestExposure(snapshot);
  if (largest !== null && limit !== null && largest.pct > limit) {
    insights.push({
      id: "concentration",
      tone: "risk",
      title: `${largest.symbol} is ${largest.pct.toFixed(1)}% of equity`,
      detail: `Above the ${limit}% single-asset limit you saved.`,
      prompt: `How do I bring ${largest.symbol} below ${limit}%?`,
    });
  } else if (largest !== null && limit === null && largest.pct >= 40) {
    /* No saved limit, but a concentration most operators would want to know
       about. Phrased as an observation, not as a breach of a rule they never
       set. */
    insights.push({
      id: "concentration-unset",
      tone: "neutral",
      title: `${largest.symbol} is ${largest.pct.toFixed(1)}% of equity`,
      detail: `Held across ${largest.venues.join(" and ")}. You have not set a concentration limit.`,
      prompt: "Am I too concentrated?",
    });
  }

  /* ---- Stablecoin buffer against a saved preference ---- */
  const buffer = memoryNumber(memories, "stablecoin_buffer");
  const stables = stablecoinRatioPct(snapshot);
  if (stables !== null && buffer !== null && stables < buffer) {
    insights.push({
      id: "buffer",
      tone: "negative",
      title: `Stablecoin reserve is ${stables.toFixed(1)}%`,
      detail: `Below the ${buffer}% buffer you asked to keep.`,
      prompt: "How do I rebuild my stablecoin buffer?",
    });
  }

  /* ---- The day, when it actually moved ---- */
  const change = change24h(snapshot);
  if (change !== null && Math.abs(change.pctChange) >= NOTABLE_MOVE_PCT) {
    const mover = contributions(snapshot)[0];
    insights.push({
      id: "today",
      tone: change.pctChange >= 0 ? "positive" : "negative",
      title: `Portfolio ${change.pctChange >= 0 ? "up" : "down"} ${Math.abs(change.pctChange).toFixed(2)}% today`,
      detail:
        mover === undefined
          ? "Across everything that carries a 24h price."
          : `${mover.symbol} is the largest contributor at ${mover.assetChangePct >= 0 ? "+" : ""}${mover.assetChangePct.toFixed(2)}%.`,
      prompt: change.pctChange >= 0 ? "What drove today's gain?" : "Why am I down today?",
    });
  }

  /* ---- Idle capital ---- */
  if (stables !== null && total !== null && total > 0 && stables >= IDLE_CAPITAL_PCT) {
    insights.push({
      id: "idle",
      tone: "neutral",
      title: `${stables.toFixed(0)}% of equity is in stablecoins`,
      detail: "Deployable capital that is not currently working.",
      prompt: "How much capital do I have available?",
    });
  }

  /* ---- A venue that could not be read ---- */
  const failed = snapshot.notes.filter((note) => note.kind === "failed");
  if (failed.length > 0) {
    insights.push({
      id: "partial",
      tone: "negative",
      title: "Some accounts could not be read",
      detail: `${failed.map((note) => note.scope).join(", ")} — totals exclude ${failed.length === 1 ? "it" : "them"}.`,
      prompt: null,
    });
  }

  return insights;
}

/**
 * The opening prompts, chosen from what this operator's state can answer.
 *
 * A suggestion that would return "you have no positions" is worse than no
 * suggestion: it advertises a capability and then demonstrates emptiness. So
 * every prompt below is gated on the data existing.
 */
export function suggestedPrompts(
  snapshot: PortfolioSnapshot,
  memories: PersonalizedMemory[],
): string[] {
  const prompts: string[] = [];
  const change = change24h(snapshot);
  const largest = largestExposure(snapshot);

  if (change !== null && Math.abs(change.pctChange) >= 0.25) {
    prompts.push(change.pctChange >= 0 ? "What drove today's gain?" : "Why am I down today?");
  }

  if (largest !== null && exposures(snapshot).length > 1) {
    prompts.push(`Am I too exposed to ${largest.symbol}?`);
  }

  if (snapshot.perps.length > 0) prompts.push("Review my open positions.");
  if (memories.length > 0) prompts.push("Am I within my saved limits?");
  prompts.push("Where is my biggest risk?");
  prompts.push("How much capital do I have available?");

  return [...new Set(prompts)].slice(0, 4);
}

/** The state-aware greeting. Every clause is gated on the figure existing. */
export function welcomeLines(snapshot: PortfolioSnapshot): string[] {
  const lines: string[] = [];
  const total = totalEquityUsd(snapshot);
  const largest = largestExposure(snapshot);

  if (total !== null) {
    lines.push(
      `Your tracked equity is $${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    );
  }

  if (largest !== null) {
    lines.push(
      `${largest.symbol} is your largest exposure at ${largest.pct.toFixed(1)}% of it.`,
    );
  }

  const positions = snapshot.perps.length;
  const available = snapshot.summary.availableCapitalUsd;
  if (positions > 0 && available !== null) {
    lines.push(
      `You have ${positions} open position${positions === 1 ? "" : "s"} and $${available.toLocaleString("en-US", { maximumFractionDigits: 0 })} available to deploy.`,
    );
  } else if (positions > 0) {
    lines.push(`You have ${positions} open position${positions === 1 ? "" : "s"}.`);
  } else if (available !== null) {
    lines.push(
      `You have $${available.toLocaleString("en-US", { maximumFractionDigits: 0 })} available to deploy.`,
    );
  }

  return lines;
}
