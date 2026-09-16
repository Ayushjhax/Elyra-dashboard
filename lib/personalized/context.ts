import "server-only";

import { composePortfolio } from "@/lib/portfolio/compose";
import {
  availableCapitalUsd,
  change24h,
  exposures,
  largestExposure,
  riskMetrics,
  todayRows,
  totalEquityUsd,
} from "@/lib/personalized/calculations";
import { listMemories } from "@/lib/personalized/memory";
import type {
  ContextFacet,
  Intent,
  PersonalizedContext,
} from "@/lib/personalized/types";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   What Elyra knows about this operator, right now.

   One aggregation, reused. `composePortfolio` is the same function the
   Portfolio and Assets pages read through `/api/portfolio`; calling it here
   rather than re-reading the RPC and the venues means one fan-out per turn
   and figures that cannot disagree with what the other two pages are showing.

   Retrieval is intent-aware, and the reason is not only cost. A model handed
   the operator's entire account answers less precisely than one handed the
   six rows the question was about: irrelevant context is not neutral, it
   competes for attention with the relevant kind. So "am I too exposed to SOL"
   gets exposure, positions, risk limits — and not last month's BTC orders.

   Failures are carried, never dropped. `unavailable` reaches the prompt, and
   the prompt requires the model to say the picture is incomplete rather than
   answering as if the missing venue held nothing.
--------------------------------------------------------------------------- */

export interface ContextInput {
  userId: string | null;
  solanaAddress: string | null;
  sessionWallet: string | null;
  intent?: Intent;
}

export interface BuiltContext {
  context: PersonalizedContext;
  /** Kept for the action validator, which must re-resolve against live state. */
  snapshot: PortfolioSnapshot | null;
}

/** Facets always loaded — equity is the denominator for everything else. */
const ALWAYS: ContextFacet[] = ["equity"];

export async function buildContext(input: ContextInput): Promise<BuiltContext> {
  const facets = new Set<ContextFacet>([...ALWAYS, ...(input.intent?.facets ?? [])]);

  /* The portfolio read and the memory read are independent, so they overlap.
     Memory is cheap and is always loaded: a risk limit changes how every
     other figure should be described, and skipping it to save a query would
     let the assistant state a 34% concentration without noticing it breaches
     a saved 30% limit. */
  const [portfolio, memories] = await Promise.all([
    composePortfolio({
      solanaAddress: input.solanaAddress,
      sessionWallet: input.sessionWallet,
      userId: input.userId,
    }).catch((error: unknown) => {
      console.error("[personalized context] portfolio read failed:", error);
      return null;
    }),
    input.userId === null ? Promise.resolve([]) : listMemories(input.userId),
  ]);

  if (portfolio === null) {
    return {
      snapshot: null,
      context: {
        asOf: new Date().toISOString(),
        totalEquityUsd: null,
        availableCapitalUsd: null,
        change24h: null,
        exposures: [],
        largestExposure: null,
        positionCount: 0,
        openOrderCount: 0,
        risk: [],
        today: [],
        memories,
        unavailable: [
          {
            scope: "portfolio",
            reason: "The account aggregation could not be read at all.",
          },
        ],
        empty: false,
      },
    };
  }

  const total = totalEquityUsd(portfolio);

  /* "Empty" is a real state with its own answer — an operator with nothing
     to analyse should be told that plainly rather than shown zeroes. */
  const empty =
    portfolio.spot.length === 0 &&
    portfolio.perps.length === 0 &&
    !portfolio.partial;

  const wantsAllocation = facets.has("allocation") || facets.has("risk") || facets.has("change");
  const wantsRisk = facets.has("risk");
  const wantsChange = facets.has("change") || facets.has("equity");

  return {
    snapshot: portfolio,
    context: {
      asOf: portfolio.asOf,
      totalEquityUsd: total,
      availableCapitalUsd: availableCapitalUsd(portfolio),
      change24h: wantsChange ? change24h(portfolio) : null,
      /* Capped: a wallet with two hundred dust tokens would otherwise fill
         the prompt with rows that cannot move any conclusion. */
      exposures: wantsAllocation ? exposures(portfolio).slice(0, 12) : [],
      largestExposure: largestExposure(portfolio),
      positionCount: portfolio.perps.length,
      openOrderCount: portfolio.orders.length,
      risk: wantsRisk ? riskMetrics(portfolio, memories) : [],
      today: todayRows(portfolio),
      memories,
      unavailable: portfolio.notes
        .filter((note) => note.kind === "failed")
        .map((note) => ({ scope: note.scope, reason: note.reason })),
      empty,
    },
  };
}

/* ---------------------------------------------------------------------------
   The prompt's view of it

   Rendered as compact labelled lines rather than raw JSON. Two reasons: it
   is markedly cheaper in tokens, and a model reads "SOL 34.2% of equity
   ($8,405) — Spot, Hyperliquid" more reliably than the equivalent nested
   object. Nulls are written as the word "unknown", never omitted, so the
   model can see the difference between a zero and a gap.
--------------------------------------------------------------------------- */

function usd(value: number | null): string {
  return value === null ? "unknown" : `$${value.toFixed(2)}`;
}

export function renderContext(context: PersonalizedContext): string {
  const lines: string[] = [];

  lines.push(`As of: ${context.asOf}`);
  lines.push(`Total equity: ${usd(context.totalEquityUsd)}`);
  lines.push(`Available to deploy: ${usd(context.availableCapitalUsd)}`);

  if (context.change24h === null) {
    lines.push("24h change: unknown (nothing held carries a 24h price)");
  } else {
    const change = context.change24h;
    lines.push(
      `24h change: ${change.pctChange >= 0 ? "+" : ""}${change.pctChange.toFixed(2)}% ` +
        `(${change.usdChange >= 0 ? "+" : "-"}$${Math.abs(change.usdChange).toFixed(2)}), ` +
        `computed over ${change.coveragePct.toFixed(0)}% of value`,
    );
  }

  lines.push(`Open positions: ${context.positionCount}`);
  lines.push(`Open orders: ${context.openOrderCount}`);

  if (context.exposures.length > 0) {
    lines.push("", "Exposure by symbol (margin for perps, not notional):");
    for (const row of context.exposures) {
      lines.push(
        `- ${row.symbol}: ${row.pct.toFixed(1)}% of equity ($${row.valueUsd.toFixed(2)}) ` +
          `via ${row.venues.join(" + ")}`,
      );
    }
  }

  if (context.risk.length > 0) {
    lines.push("", "Risk:");
    for (const metric of context.risk) {
      lines.push(
        `- ${metric.label}: ${metric.value}` +
          (metric.limit === null ? "" : ` (their saved limit: ${metric.limit})`) +
          (metric.breached ? " — BREACHED" : "") +
          ` — ${metric.detail}`,
      );
    }
  }

  if (context.memories.length > 0) {
    lines.push("", "Saved preferences (standing instructions):");
    for (const memory of context.memories) {
      lines.push(`- ${memory.label}`);
    }
  } else {
    lines.push("", "Saved preferences: none yet.");
  }

  if (context.unavailable.length > 0) {
    lines.push("", "COULD NOT BE READ — the figures above exclude these:");
    for (const entry of context.unavailable) {
      lines.push(`- ${entry.scope}: ${entry.reason}`);
    }
  }

  if (context.empty) {
    lines.push("", "This account holds nothing yet.");
  }

  return lines.join("\n");
}
