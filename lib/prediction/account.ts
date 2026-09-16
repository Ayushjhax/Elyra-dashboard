import "server-only";

import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   The link between an Elyra user and their prediction-market account.

   ── Why this is stored rather than derived ─────────────────────────────

   Polymarket holds positions in a proxy wallet it deploys per user. That
   address is NOT the EOA that controls it, and there is no public endpoint
   that maps one to the other. So the address has to be supplied once and
   remembered.

   The consequence is the rule this whole file exists to support: an empty
   position list means "no positions" ONLY when we know we asked about the
   right address. Without a stored address there is nothing to ask about, and
   the honest answer is "not connected" rather than "$0".

   Read through a small cache because every prediction tool call needs it and
   none of them should each cost a database round trip.
--------------------------------------------------------------------------- */

export interface PredictionAccount {
  address: string;
  verifiedAt: string | null;
}

const TTL_MS = 60_000;
const cache = new Map<string, { value: PredictionAccount | null; at: number }>();

export function isPredictionAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

/**
 * The linked prediction account, or null when there is none.
 *
 * Null is also returned when the profile store is unreachable. That is
 * deliberate and it is the safe direction: a failed read renders as "not
 * connected", which is a true statement about what Elyra can currently see.
 * The opposite mistake — inventing an address — would read someone else's
 * positions.
 */
export async function predictionAccount(
  userId: string | null,
): Promise<PredictionAccount | null> {
  if (userId === null) return null;

  const hit = cache.get(userId);
  if (hit !== undefined && Date.now() - hit.at < TTL_MS) return hit.value;

  const { data, error } = await serviceClient()
    .from("profiles")
    .select("polymarket_address, polymarket_verified_at")
    .eq("id", userId)
    .maybeSingle();

  let value: PredictionAccount | null = null;

  if (!error && data?.polymarket_address) {
    const address = data.polymarket_address.trim().toLowerCase();
    if (isPredictionAddress(address)) {
      value = { address, verifiedAt: data.polymarket_verified_at ?? null };
    }
  }

  /* A failed read is not cached: the next call should try again rather than
     reporting "not connected" for a minute because of one blip. */
  if (!error) cache.set(userId, { value, at: Date.now() });

  return value;
}

/** Links an address. The caller is responsible for having verified the session. */
export async function linkPredictionAccount(
  userId: string,
  address: string,
  verified: boolean,
): Promise<boolean> {
  const clean = address.trim().toLowerCase();
  if (!isPredictionAddress(clean)) return false;

  const { error } = await serviceClient()
    .from("profiles")
    .update({
      polymarket_address: clean,
      /* Stamped only when the address actually returned data. An unverified
         link is still usable — a brand-new account legitimately has no
         positions — but the UI can say which kind it is. */
      polymarket_verified_at: verified ? new Date().toISOString() : null,
    })
    .eq("id", userId);

  cache.delete(userId);
  return !error;
}

export async function unlinkPredictionAccount(userId: string): Promise<boolean> {
  const { error } = await serviceClient()
    .from("profiles")
    .update({ polymarket_address: null, polymarket_verified_at: null })
    .eq("id", userId);

  cache.delete(userId);
  return !error;
}

/** Test seam. */
export function clearPredictionAccountCache(): void {
  cache.clear();
}
