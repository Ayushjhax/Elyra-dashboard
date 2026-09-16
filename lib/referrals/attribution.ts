import "server-only";

import { resolveCode } from "@/lib/referrals/codes";
import { ATTRIBUTION_COOKIE } from "@/lib/referrals/config";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Binding a click to an account.

   The chain is: someone opens /r/CODE, the code is validated and written to
   an httpOnly cookie, and the cookie is read exactly once — when that
   visitor's profile row is first created.

   ── Why binding happens at profile creation ────────────────────────────

   It is the only moment that is unambiguously "this account is new". Binding
   later would need a rule for what to do about accounts that already existed,
   and every version of that rule is either a no-op or a way to retro-attribute
   an established user to whoever last sent them a link.

   ── First touch, enforced twice ────────────────────────────────────────

   The cookie is not overwritten once set (see `readAttribution`'s caller in
   the route), and `referrals.referred_user_id` is UNIQUE, so even if a second
   bind were attempted it inserts nothing. Last-click manipulation has no
   entry point.
--------------------------------------------------------------------------- */

const UNIQUE_VIOLATION = "23505";

/** The code on this request, if any. Untrusted until `resolveCode` runs. */
export function readAttributionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (header === null) return null;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== ATTRIBUTION_COOKIE) continue;
    const value = decodeURIComponent(part.slice(separator + 1).trim());
    return value.length > 0 ? value : null;
  }
  return null;
}

export type BindResult =
  | { bound: true; referrerUserId: string }
  | { bound: false; reason: "no_code" | "unknown_code" | "self" | "already_referred" | "error" };

/**
 * Attaches a new account to the referrer whose code brought them.
 *
 * Every rejection is a normal outcome and none of them throw: this runs
 * inside sign-in, and a referral that cannot be attributed must never stop
 * someone from getting into the product.
 */
export async function bindReferral(
  referredUserId: string,
  code: string | null,
): Promise<BindResult> {
  if (code === null || code.trim().length === 0) {
    return { bound: false, reason: "no_code" };
  }

  const normalised = code.trim().toUpperCase();
  const referrerUserId = await resolveCode(normalised);

  if (referrerUserId === null) return { bound: false, reason: "unknown_code" };

  /* Self-referral. Also refused by a CHECK constraint — this catch is here so
     the common case never reaches the database and the reason is specific. */
  if (referrerUserId === referredUserId) return { bound: false, reason: "self" };

  try {
    const { error } = await serviceClient().from("referrals").insert({
      referrer_user_id: referrerUserId,
      referred_user_id: referredUserId,
      referral_code: normalised,
    });

    if (error !== null) {
      /* Already has a referrer. First touch wins, and the unique index is
         what decided it. */
      if (error.code === UNIQUE_VIOLATION) {
        return { bound: false, reason: "already_referred" };
      }
      console.error("[referrals] bind failed:", error.message);
      return { bound: false, reason: "error" };
    }

    return { bound: true, referrerUserId };
  } catch (error: unknown) {
    console.error("[referrals] bind threw:", error);
    return { bound: false, reason: "error" };
  }
}
