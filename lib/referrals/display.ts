import { activationsToNextBonus } from "@/lib/referrals/pool";

/* ---------------------------------------------------------------------------
   The referral page's words and figures, from the server's own numbers.

   Every reward the page promises is read from the stats the API sends —
   which come from lib/referrals/config.ts, the same config the evaluator and
   the ledger use — so the copy cannot promise a rule the backend does not
   pay. Pure, and tested.
--------------------------------------------------------------------------- */

export interface ProgrammeFigures {
  activationPoints: number;
  activationRequirement: string;
  pool: { target: number; progress: number; nextBonusPoints: number; completedPools: number; lifetimeActivations: number };
}

/**
 * Step 03, in the imperative the page uses: the server writes the rule as a
 * sentence about the referred person ("They connect a wallet and hold at
 * least $10 in it."); the step speaks to them ("Connect a wallet and hold at
 * least $10.").
 */
export function activationStep(requirement: string): string {
  const sentence = requirement
    .trim()
    .replace(/^They\s+/i, "")
    .replace(/\s+in it\.?$/i, ".")
    .replace(/([^.])$/, "$1.");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** "62.5%", or an em dash when there is nothing to divide by. */
export function activationRateText(rate: number | null): string {
  return rate === null ? "—" : `${Number.isInteger(rate) ? rate : rate.toFixed(1)}%`;
}

/** Where the current pool stands — its filled slots, and what is still needed. */
export function poolProgress(figures: ProgrammeFigures["pool"]): { filled: number; remaining: number } {
  const filled = Math.min(Math.max(0, figures.progress), figures.target);
  return { filled, remaining: activationsToNextBonus(figures.lifetimeActivations, figures.target) };
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
