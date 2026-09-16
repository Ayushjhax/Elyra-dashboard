import "server-only";

import { composePortfolio } from "@/lib/portfolio/compose";
import { referralConfig, type ActivationRule } from "@/lib/referrals/config";
import { awardActivation, type ActivationOutcome } from "@/lib/referrals/rewards";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Does this account count as activated?

   The ONE place the question is answered. The spec is emphatic that the rule
   must not be scattered, and the reason is concrete: a rule duplicated into
   the UI eventually disagrees with the rule that pays, and the user sees a
   filled pool slot that earned nothing.

   ── Why evaluation is pulled, not pushed ───────────────────────────────

   Elyra has no event bus, no webhook fan-out and no job runner — the audit
   found none. So there is nothing to subscribe to, and activation is
   evaluated when the REFERRED user is themselves signed in and reading their
   own account. That is the right side of the transaction to evaluate on:

   - the data needed is the referred user's own portfolio, which their session
     is already entitled to read;
   - it costs one aggregation the page was doing anyway, rather than N reads
     of other people's accounts on the referrer's page load;
   - and it cannot be triggered by the referrer, so nobody can force
     evaluation of an account they do not control.

   The cost is latency: a referral shows as activated the next time the
   referred user opens Elyra, not the instant they fund. For a points
   programme that is an acceptable trade, and it is stated on the page.

   When an event system exists, `evaluateActivation` is what it calls.
--------------------------------------------------------------------------- */

export interface ActivationCheck {
  qualifies: boolean;
  /** Written for a human — shown to the referred user, never to the referrer. */
  reason: string;
  rule: ActivationRule;
}

export interface EvaluateInput {
  userId: string;
  solanaAddress: string | null;
  sessionWallet: string | null;
}

/**
 * Whether this account meets the configured requirement, right now.
 *
 * Read-only. It awards nothing — `runActivationCheck` below does that once
 * this has said yes.
 */
export async function evaluateActivation(
  input: EvaluateInput,
): Promise<ActivationCheck> {
  const config = referralConfig();
  const rule = config.activationRule;

  if (rule === "profile_created") {
    return { qualifies: true, reason: "Account created.", rule };
  }

  if (input.solanaAddress === null) {
    return { qualifies: false, reason: "Connect a Solana wallet to activate.", rule };
  }

  if (rule === "wallet_connected") {
    return { qualifies: true, reason: "Wallet connected.", rule };
  }

  /* wallet_funded — the default. Reuses the same aggregation Portfolio and
     Assets read, so "funded" means exactly what those pages show and cannot
     drift from them. */
  try {
    const portfolio = await composePortfolio({
      solanaAddress: input.solanaAddress,
      sessionWallet: input.sessionWallet,
      userId: input.userId,
    });

    const total = portfolio.summary.totalValueUsd;

    /* A partial read must never fail an activation: a venue being down is
       not the user's doing, and telling someone they are not activated
       because Hyperliquid timed out would be wrong in the expensive
       direction. Unknown is treated as "not yet", and the next visit
       re-evaluates. */
    if (total === null) {
      return {
        qualifies: false,
        reason: "Your balances could not be read just now. This will re-check.",
        rule,
      };
    }

    if (total < config.activationMinValueUsd) {
      return {
        qualifies: false,
        reason: `Hold at least $${config.activationMinValueUsd} to activate.`,
        rule,
      };
    }

    return { qualifies: true, reason: "Wallet funded.", rule };
  } catch {
    return {
      qualifies: false,
      reason: "Your balances could not be read just now. This will re-check.",
      rule,
    };
  }
}

export interface ActivationCheckResult extends ActivationCheck {
  /** Null when this account was never referred, so nothing was owed. */
  outcome: ActivationOutcome | null;
}

/**
 * Evaluate, and pay if it just became true.
 *
 * Cheap on the common path: accounts with no pending referral return before
 * any portfolio read, so the overwhelming majority of sessions — everyone who
 * was not referred, and everyone already activated — cost one indexed lookup.
 */
export async function runActivationCheck(
  input: EvaluateInput,
): Promise<ActivationCheckResult> {
  const config = referralConfig();

  let pending = false;
  try {
    const { data } = await serviceClient()
      .from("referrals")
      .select("status")
      .eq("referred_user_id", input.userId)
      .maybeSingle();
    pending = data?.status === "pending";
  } catch {
    pending = false;
  }

  if (!pending) {
    return {
      qualifies: false,
      reason: "No pending referral for this account.",
      rule: config.activationRule,
      outcome: null,
    };
  }

  const check = await evaluateActivation(input);
  if (!check.qualifies) return { ...check, outcome: null };

  return { ...check, outcome: await awardActivation(input.userId) };
}
