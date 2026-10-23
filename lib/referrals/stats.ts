import "server-only";

import { ensureReferralCode } from "@/lib/referrals/codes";
import { referralConfig } from "@/lib/referrals/config";
import { referralUrlFor } from "@/lib/referrals/url";
import { serviceClient } from "@/lib/supabase/server";
import type { ReferralStatus } from "@/lib/supabase/types";
import type { PoolState, ReferralListItem, ReferralStats } from "@/lib/referrals/types";

export type { PoolState, ReferralListItem, ReferralStats };

/* ---------------------------------------------------------------------------
   One aggregate, computed on the server.

   The spec's rule — "do not make the frontend calculate business-critical
   reward state" — is why pool progress, activation rate and the next bonus
   are all derived here rather than in a component. The page renders numbers;
   it never works out what someone is owed.

   The balance is a SUM over the ledger rather than a stored total, so the
   figure on the page is by construction the same one an audit would reach.
--------------------------------------------------------------------------- */

/**
 * How activation is described to users.
 *
 * Derived from the same config the evaluator reads, so the page cannot
 * promise a rule the backend does not enforce.
 */
export function activationRequirementText(): string {
  const config = referralConfig();
  switch (config.activationRule) {
    case "profile_created":
      return "They create an Elyra account.";
    case "wallet_connected":
      return "They connect a Solana wallet to Elyra.";
    case "wallet_funded":
      return `They connect a wallet and hold at least $${config.activationMinValueUsd} in it.`;
  }
}

/* ---------------------------------------------------------------------------
   Identity, minimised

   §Privacy: show only what is needed to recognise a referral. No wallet
   address, no balances, no full email. A display name if the account has one,
   otherwise a masked stand-in derived from the id — which identifies the row
   without disclosing anything about the person.
--------------------------------------------------------------------------- */

function maskedIdentity(displayName: string | null, id: string): string {
  const name = displayName?.trim() ?? "";
  if (name.length > 0) return name;
  /* Not the raw uuid: a short, stable fragment is enough to tell two
     referrals apart, which is the only thing this column is for. */
  return `Member ${id.slice(0, 4).toUpperCase()}`;
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/* ---------------------------------------------------------------------------
   The read
--------------------------------------------------------------------------- */

interface ReferralJoinRow {
  id: string;
  status: ReferralStatus;
  signed_up_at: string;
  activated_at: string | null;
  referred_user_id: string;
}

export async function referralStats(userId: string): Promise<ReferralStats> {
  const config = referralConfig();
  const db = serviceClient();

  const [code, referrals, ledger, pools] = await Promise.all([
    ensureReferralCode(userId),
    db
      .from("referrals")
      .select("id, status, signed_up_at, activated_at, referred_user_id")
      .eq("referrer_user_id", userId)
      .order("signed_up_at", { ascending: false })
      .limit(500),
    db.from("points_ledger").select("event_type, points").eq("user_id", userId),
    db
      .from("referral_pools")
      .select("pool_number, bonus_points")
      .eq("user_id", userId),
  ]);

  const rows = (referrals.data ?? []) as ReferralJoinRow[];

  const activatedReferrals = rows.filter((row) => row.status === "activated").length;
  const pendingReferrals = rows.filter((row) => row.status === "pending").length;

  let referralPoints = 0;
  let bonusPoints = 0;
  for (const entry of ledger.data ?? []) {
    if (entry.event_type === "REFERRAL_POOL_BONUS") bonusPoints += entry.points;
    else referralPoints += entry.points;
  }

  const completedPools = (pools.data ?? []).length;
  const totalBonusPoints = (pools.data ?? []).reduce(
    (sum, pool) => sum + (pool.bonus_points ?? 0),
    0,
  );

  /* Progress within the CURRENT pool. The modulo is what makes the pool
     repeat: 13 activations at a target of 5 is two completed pools and three
     slots filled in the third. */
  const progress = activatedReferrals % config.activationPoolTarget;

  return {
    referralCode: code,
    referralUrl: code === null ? null : referralUrlFor(code),
    totalPoints: referralPoints + bonusPoints,
    referralPoints,
    bonusPoints,
    totalReferrals: rows.length,
    activatedReferrals,
    pendingReferrals,
    activationRate:
      rows.length === 0
        ? null
        : Math.round((activatedReferrals / rows.length) * 1000) / 10,
    pool: {
      target: config.activationPoolTarget,
      progress,
      completedPools,
      nextBonusPoints: config.poolCompletionBonusPoints,
      totalBonusPoints: totalBonusPoints || bonusPoints,
      lifetimeActivations: activatedReferrals,
    },
    activationRequirement: activationRequirementText(),
    activationPoints: config.activationPoints,
  };
}

/** The list, with identity reduced to what is needed to recognise a row. */
export async function referralList(userId: string): Promise<ReferralListItem[]> {
  const config = referralConfig();
  const db = serviceClient();

  const { data, error } = await db
    .from("referrals")
    .select("id, status, signed_up_at, activated_at, referred_user_id")
    .eq("referrer_user_id", userId)
    .order("signed_up_at", { ascending: false })
    .limit(200);

  if (error !== null || data === null) return [];

  const rows = data as ReferralJoinRow[];
  if (rows.length === 0) return [];

  /* Display names in one query rather than one per row. Only `display_name`
     is selected — the profiles table also holds wallet addresses, and a
     `select("*")` here would pull them into a response that has no business
     carrying them. */
  const names = new Map<string, string | null>();
  const { data: profiles } = await db
    .from("profiles")
    .select("id, display_name")
    .in(
      "id",
      rows.map((row) => row.referred_user_id),
    );

  for (const profile of profiles ?? []) {
    names.set(profile.id, profile.display_name);
  }

  return rows.map((row) => {
    const name = maskedIdentity(names.get(row.referred_user_id) ?? null, row.referred_user_id);
    return {
      id: row.id,
      name,
      initials: initialsOf(name),
      status: row.status,
      joinedAt: row.signed_up_at,
      activatedAt: row.activated_at,
      pointsAwarded: row.status === "activated" ? config.activationPoints : null,
    };
  });
}
