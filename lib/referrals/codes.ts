import "server-only";

import { randomInt } from "node:crypto";
import { CODE_ALPHABET, CODE_LENGTH, isWellFormedCode } from "@/lib/referrals/config";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Referral codes.

   Generated on the server, stored on the profile, and never accepted from a
   client. A code the browser could choose is a code someone can squat, and
   the whole attribution chain hangs off it.

   `randomInt` rather than `Math.random`: a code that can be predicted from an
   earlier one lets an attacker enumerate other users' links, which is not
   catastrophic but is free to prevent.
--------------------------------------------------------------------------- */

/** Postgres unique-violation — two concurrent issues collided on the index. */
const UNIQUE_VIOLATION = "23505";

/** Attempts before giving up. At 31^7 the first collision is already unlikely. */
const MAX_ATTEMPTS = 5;

function generate(): string {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * This user's code, issuing one if they have none.
 *
 * Lazy rather than at account creation: the column was added to a table with
 * existing rows, so every account predating this migration needs one issued
 * on demand anyway. Doing it in one place means both paths behave the same.
 *
 * Idempotent under concurrency. Two simultaneous calls race on the unique
 * index; the loser re-reads and returns whatever the winner wrote, so a user
 * can never end up with two codes.
 */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  const db = serviceClient();

  const existing = await db
    .from("profiles")
    .select("referral_code")
    .eq("id", userId)
    .maybeSingle();

  if (existing.error === null && existing.data?.referral_code != null) {
    return existing.data.referral_code;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = generate();

    const { error } = await db
      .from("profiles")
      .update({ referral_code: code })
      .eq("id", userId)
      /* Only when it is still null: without this, a retry after a slow
         success would overwrite a code the user may already have shared. */
      .is("referral_code", null);

    if (error === null) {
      /* The update may have matched no row because another request won the
         race. Re-read rather than assume this call's code was the one that
         landed. */
      const confirmed = await db
        .from("profiles")
        .select("referral_code")
        .eq("id", userId)
        .maybeSingle();
      if (confirmed.data?.referral_code != null) return confirmed.data.referral_code;
      continue;
    }

    if (error.code !== UNIQUE_VIOLATION) {
      console.error("[referrals] could not issue a code:", error.message);
      return null;
    }
    /* Collided with an existing code. Draw another. */
  }

  console.error(`[referrals] gave up issuing a code after ${MAX_ATTEMPTS} attempts`);
  return null;
}

/** The user a code belongs to, or null. Case-insensitive by normalising up. */
export async function resolveCode(code: string): Promise<string | null> {
  const normalised = code.trim().toUpperCase();
  /* Checked before the query so a malformed code costs no round trip and
     cannot be used to probe timing. */
  if (!isWellFormedCode(normalised)) return null;

  try {
    const { data, error } = await serviceClient()
      .from("profiles")
      .select("id")
      .eq("referral_code", normalised)
      .maybeSingle();

    if (error !== null || data === null) return null;
    return data.id;
  } catch {
    return null;
  }
}
