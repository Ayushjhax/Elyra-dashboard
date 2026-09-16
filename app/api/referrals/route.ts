import { NextResponse } from "next/server";
import { getSessionUser, hasProfile } from "@/lib/auth/session";
import { runActivationCheck } from "@/lib/referrals/activation";
import { isSolanaAddress } from "@/lib/solana/address";
import { referralList, referralStats, type ReferralListItem, type ReferralStats } from "@/lib/referrals/stats";

/* ---------------------------------------------------------------------------
   The referral page's one read.

   Stats and list together: they are rendered on the same screen and splitting
   them would double the round trips to show one page.

   ── Why an activation check runs here ──────────────────────────────────

   Elyra has no event bus to subscribe to, so activation is evaluated when the
   REFERRED user is signed in and reading their own account — see the note in
   lib/referrals/activation.ts. This route is one such moment: a referred user
   opening their own referral page has their own eligibility re-evaluated, and
   their referrer is credited if it has become true.

   It evaluates the CALLER and nobody else. A referrer cannot force evaluation
   of an account they do not control, and the expensive read is the caller's
   own portfolio, which their session is already entitled to.

   It short-circuits before any portfolio read for anyone without a pending
   referral, which is almost everyone almost always.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ReferralsResponse {
  stats: ReferralStats | null;
  referrals: ReferralListItem[];
  error: string | null;
  /** True when the tables are not migrated yet. */
  unconfigured: boolean;
}

function fail(error: string, status = 200, unconfigured = false) {
  return NextResponse.json<ReferralsResponse>(
    { stats: null, referrals: [], error, unconfigured },
    { status },
  );
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (user === null) return fail("Not signed in", 401);

  /* The programme is entirely rows: a code, referrals, a ledger. Without a
     profile row there is nothing to key any of it to. */
  if (!hasProfile(user)) {
    return fail("Referrals need the database, which could not be reached.", 503, true);
  }

  try {
    /* Fire-and-forget: a referred user's own visit credits their referrer,
       but a failure here must not keep them from seeing their page. */
    void runActivationCheck({
      userId: user.userId,
      solanaAddress:
        user.solanaAddress !== null && isSolanaAddress(user.solanaAddress)
          ? user.solanaAddress
          : null,
      sessionWallet: user.walletAddress,
    }).catch(() => {});

    const [stats, referrals] = await Promise.all([
      referralStats(user.userId),
      referralList(user.userId),
    ]);

    return NextResponse.json<ReferralsResponse>({
      stats,
      referrals,
      error: null,
      unconfigured: false,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not load referrals.";
    /* A missing table is a migration to run, not an outage. */
    const missing = /relation .* does not exist|schema cache|PGRST205|42P01/i.test(message);
    return fail(
      missing
        ? "The referral tables do not exist yet — run supabase/migrations/0006_referrals.sql."
        : message,
      200,
      missing,
    );
  }
}
