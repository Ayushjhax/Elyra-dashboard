import "server-only";

import { maxRunsPerDay } from "@/lib/env";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   The daily cap on model runs, per person.

   One counter for every surface that spends on a model for one person — the
   agent (web and Telegram) and Ask Elyra — so moving between them does not
   reset it. Durable and atomic in the database (`claim_agent_run`): an
   in-memory counter is per server instance and resets with it, which on a
   serverless host is no cap at all.
--------------------------------------------------------------------------- */

export class UsageLimitError extends Error {
  readonly runs: number;
  readonly limit: number;

  constructor(runs: number, limit: number) {
    super(
      `You have used all ${limit} agent runs for today. The counter resets at ` +
        "00:00 UTC.",
    );
    this.name = "UsageLimitError";
    this.runs = runs;
    this.limit = limit;
  }
}

/**
 * Claims one of the caller's model runs for today, or throws UsageLimitError.
 *
 * Atomic in the database, so two concurrent requests cannot both take the
 * last slot. Called before any model spend.
 */
export async function claimAgentRun(userId: string): Promise<void> {
  const limit = maxRunsPerDay();
  const claim = await serviceClient().rpc("claim_agent_run", {
    p_user_id: userId,
    p_limit: limit,
  });
  if (claim.error) throw claim.error;

  const claimed = claim.data?.[0];
  if (claimed && !claimed.allowed) {
    throw new UsageLimitError(claimed.runs, limit);
  }
}
