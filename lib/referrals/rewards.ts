import "server-only";

import { referralConfig } from "@/lib/referrals/config";
import { serviceClient } from "@/lib/supabase/server";
import type { PointsEventType } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Paying out.

   Every award in this file goes through `credit`, and `credit` is idempotent
   because the ledger has a unique index on `source_id`. That is the whole
   duplicate-payment defence, and it is deliberately held by the database
   rather than by a check-then-insert in application code: a check-then-insert
   has a window between the two halves, and two concurrent activations of the
   same referral would both pass the check.

   Nothing here is reachable from the browser. Points are awarded only from
   server-evaluated state — see lib/referrals/activation.ts, which decides
   whether a referred account actually qualifies before any of this runs.
--------------------------------------------------------------------------- */

const UNIQUE_VIOLATION = "23505";

export interface CreditResult {
  /** False when this exact award had already been made. Not an error. */
  credited: boolean;
  ledgerId: string | null;
}

/**
 * One ledger row, at most once per `sourceId`, ever.
 *
 * A duplicate is a normal outcome — a retried webhook, a double-submitted
 * request, two tabs — and is reported as `credited: false` rather than thrown,
 * because the caller's desired end state has been reached either way.
 */
export async function credit(input: {
  userId: string;
  eventType: PointsEventType;
  points: number;
  sourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<CreditResult> {
  try {
    const { data, error } = await serviceClient()
      .from("points_ledger")
      .insert({
        user_id: input.userId,
        event_type: input.eventType,
        points: input.points,
        source_id: input.sourceId,
        metadata: input.metadata ?? {},
      })
      .select("id")
      .single();

    if (error !== null) {
      if (error.code === UNIQUE_VIOLATION) return { credited: false, ledgerId: null };
      console.error("[referrals] ledger write failed:", error.message);
      return { credited: false, ledgerId: null };
    }

    return { credited: true, ledgerId: data.id };
  } catch (error: unknown) {
    console.error("[referrals] ledger write threw:", error);
    return { credited: false, ledgerId: null };
  }
}

/** The idempotency keys, written once so both sides always agree. */
export const activationKey = (referredUserId: string): string =>
  `referral_activation:${referredUserId}`;

export const poolKey = (referrerUserId: string, poolNumber: number): string =>
  `referral_pool:${referrerUserId}:${poolNumber}`;

/* ---------------------------------------------------------------------------
   Pools
--------------------------------------------------------------------------- */

export interface PoolOutcome {
  /** Pools completed after this activation. */
  completedPools: number;
  /** Bonuses actually paid by this call — 0 when nothing new completed. */
  bonusesAwarded: number;
  bonusPoints: number;
}

/**
 * Settles any pool the activation count has newly filled.
 *
 * Driven by the count of ACTIVATED referrals rather than by an incrementing
 * counter: a counter can drift from the rows it is meant to summarise, and
 * this way the pool state is always exactly what the referrals table says.
 *
 * Loops because a backfill can cross several targets at once. Each iteration
 * is guarded by the unique index on (user_id, pool_number), so two concurrent
 * activations cannot both settle pool 3.
 */
export async function settlePools(referrerUserId: string): Promise<PoolOutcome> {
  const config = referralConfig();
  const db = serviceClient();

  const { count, error } = await db
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_user_id", referrerUserId)
    .eq("status", "activated");

  if (error !== null) {
    console.error("[referrals] could not count activations:", error.message);
    return { completedPools: 0, bonusesAwarded: 0, bonusPoints: 0 };
  }

  const activated = count ?? 0;
  const earned = Math.floor(activated / config.activationPoolTarget);

  const existing = await db
    .from("referral_pools")
    .select("pool_number")
    .eq("user_id", referrerUserId)
    .order("pool_number", { ascending: false })
    .limit(1);

  const settled = existing.data?.[0]?.pool_number ?? 0;

  let bonusesAwarded = 0;
  let bonusPoints = 0;

  for (let poolNumber = settled + 1; poolNumber <= earned; poolNumber += 1) {
    /* The ledger row first: if the pool row were written first and this
       failed, the pool would read as paid when it was not. In this order the
       worst case is a paid ledger row with no pool row, which the next run
       reconciles because `credit` refuses to pay the same key twice. */
    const payment = await credit({
      userId: referrerUserId,
      eventType: "REFERRAL_POOL_BONUS",
      points: config.poolCompletionBonusPoints,
      sourceId: poolKey(referrerUserId, poolNumber),
      metadata: { poolNumber, target: config.activationPoolTarget },
    });

    const { error: poolError } = await db.from("referral_pools").insert({
      user_id: referrerUserId,
      pool_number: poolNumber,
      /* The target as it is NOW, recorded permanently. Changing the target
         later must not rewrite what was already paid. */
      target: config.activationPoolTarget,
      bonus_points: config.poolCompletionBonusPoints,
      bonus_ledger_id: payment.ledgerId,
    });

    if (poolError !== null && poolError.code !== UNIQUE_VIOLATION) {
      console.error("[referrals] pool write failed:", poolError.message);
      break;
    }

    if (payment.credited) {
      bonusesAwarded += 1;
      bonusPoints += config.poolCompletionBonusPoints;
    }
  }

  return { completedPools: Math.max(earned, settled), bonusesAwarded, bonusPoints };
}

/* ---------------------------------------------------------------------------
   Activation
--------------------------------------------------------------------------- */

export interface ActivationOutcome {
  /** True only on the transition — a second call reports false. */
  activated: boolean;
  pointsAwarded: number;
  pool: PoolOutcome | null;
  reason: string | null;
}

const NOT_ACTIVATED: ActivationOutcome = {
  activated: false,
  pointsAwarded: 0,
  pool: null,
  reason: null,
};

/**
 * Marks a referral activated and pays for it, once.
 *
 * `referredUserId` is the account that did the qualifying thing; the referrer
 * is looked up from the referrals table rather than passed in, so a caller
 * cannot nominate who gets paid.
 *
 * Called only after `evaluateActivation` has confirmed the account qualifies.
 * This function does not re-check eligibility — it records and pays.
 */
export async function awardActivation(
  referredUserId: string,
): Promise<ActivationOutcome> {
  const config = referralConfig();
  const db = serviceClient();

  const { data: referral, error } = await db
    .from("referrals")
    .select("*")
    .eq("referred_user_id", referredUserId)
    .maybeSingle();

  if (error !== null || referral === null) {
    return { ...NOT_ACTIVATED, reason: "This account was not referred by anyone." };
  }

  if (referral.status === "activated") {
    return { ...NOT_ACTIVATED, reason: "Already activated." };
  }
  if (referral.status === "not_eligible") {
    return { ...NOT_ACTIVATED, reason: "This referral was marked not eligible." };
  }

  /* Defence in depth. The database rejects this too, but a self-referral that
     somehow reached here must not be paid. */
  if (referral.referrer_user_id === referral.referred_user_id) {
    return { ...NOT_ACTIVATED, reason: "Self-referral." };
  }

  const now = new Date().toISOString();

  /* Conditional on still being pending, so two concurrent evaluations cannot
     both transition it. The loser updates no rows. */
  const { data: updated, error: updateError } = await db
    .from("referrals")
    .update({ status: "activated", activated_at: now, rewarded_at: now, updated_at: now })
    .eq("id", referral.id)
    .eq("status", "pending")
    .select("id");

  if (updateError !== null) {
    console.error("[referrals] activation update failed:", updateError.message);
    return { ...NOT_ACTIVATED, reason: "Could not record the activation." };
  }

  if ((updated ?? []).length === 0) {
    /* Another request won. Its `settlePools` call covers the bonus. */
    return { ...NOT_ACTIVATED, reason: "Already activated." };
  }

  const payment = await credit({
    userId: referral.referrer_user_id,
    eventType: "REFERRAL_ACTIVATED",
    points: config.activationPoints,
    sourceId: activationKey(referredUserId),
    metadata: { referralId: referral.id, rule: config.activationRule },
  });

  const pool = await settlePools(referral.referrer_user_id);

  return {
    activated: true,
    pointsAwarded: payment.credited ? config.activationPoints : 0,
    pool,
    reason: null,
  };
}
