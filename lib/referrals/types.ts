/* ---------------------------------------------------------------------------
   The referral programme as /api/referrals returns it — apart from
   lib/referrals/stats.ts, which computes it and is server-only, so the
   website and the Android app read one definition.
--------------------------------------------------------------------------- */

export type ReferralStatus = "pending" | "activated" | "not_eligible";

export interface ReferralListItem {
  id: string;
  /** A display name, or a masked handle. Never a full email or an address. */
  name: string;
  /** Two initials for the avatar fallback. */
  initials: string;
  status: ReferralStatus;
  joinedAt: string;
  activatedAt: string | null;
  /** Points this referral earned the viewer. Null when it has not activated. */
  pointsAwarded: number | null;
}

export interface PoolState {
  target: number;
  /** Slots filled in the CURRENT pool, 0..target-1 (target means complete). */
  progress: number;
  completedPools: number;
  nextBonusPoints: number;
  totalBonusPoints: number;
  /** Lifetime activated referrals, across every pool. */
  lifetimeActivations: number;
}

export interface ReferralStats {
  referralCode: string | null;
  referralUrl: string | null;
  totalPoints: number;
  referralPoints: number;
  bonusPoints: number;
  totalReferrals: number;
  activatedReferrals: number;
  pendingReferrals: number;
  /** 0–100, one decimal. Null when there is nothing to divide by. */
  activationRate: number | null;
  pool: PoolState;
  /** What the referred account has to do, for the How It Works copy. */
  activationRequirement: string;
  /**
   * Points per activation.
   *
   * Sent rather than read from config in the browser: the config module reads
   * `process.env`, which is empty in a client bundle for anything not
   * NEXT_PUBLIC_. A component reading it would silently fall back to the
   * default and promise a reward the server might not pay.
   */
  activationPoints: number;
}

export interface ReferralsResponse {
  stats: ReferralStats | null;
  referrals: ReferralListItem[];
  error: string | null;
  /** True when the tables are not migrated yet. */
  unconfigured: boolean;
}
