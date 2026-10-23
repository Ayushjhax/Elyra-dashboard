import "server-only";

import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { isSolanaAddress } from "@/lib/solana/address";

/* ---------------------------------------------------------------------------
   One authorization path for every Personalized route.

   The rule the spec states and this enforces: the user is derived from the
   verified Privy token, never from the request. No route below reads a userId
   from a body, a query string or a header, and there is no code path that
   would — `resolve` is the only way in, and it returns the id it verified.

   Routes that write need a `profiles` row for the foreign key. Routes that
   only read live account state do not, which is why the two are separate
   helpers rather than one: the context endpoint still works when the profile
   store is unreachable, because the wallet address comes from Privy.
--------------------------------------------------------------------------- */

export interface PersonalizedSession {
  /** Null when the profile store is unreachable — nothing may be written. */
  userId: string | null;
  solanaAddress: string | null;
  /** EVM, which makes Hyperliquid readable with nothing connected. */
  sessionWallet: string | null;
  addressesUnresolved: boolean;
}

function toSession(user: SessionUser): PersonalizedSession {
  return {
    userId: user.userId,
    solanaAddress:
      user.solanaAddress !== null && isSolanaAddress(user.solanaAddress)
        ? user.solanaAddress
        : null,
    sessionWallet: user.walletAddress,
    addressesUnresolved: user.addressesUnresolved,
  };
}

/** The verified caller, or a 401 to return. */
export async function resolve(
  request: Request,
): Promise<{ session: PersonalizedSession } | { response: NextResponse }> {
  const user = await getSessionUser(request);
  if (user === null) {
    return {
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }
  return { session: toSession(user) };
}

/**
 * As `resolve`, but for routes that persist something.
 *
 * 503 rather than 500: nothing is broken and the request was not wrong — a
 * dependency is down, and that is the code that says so.
 */
export async function resolveWritable(
  request: Request,
  feature: string,
): Promise<{ session: PersonalizedSession & { userId: string } } | { response: NextResponse }> {
  const resolved = await resolve(request);
  if ("response" in resolved) return resolved;

  if (resolved.session.userId === null) {
    return {
      response: NextResponse.json(
        {
          error: `${feature} needs the database, which could not be reached.`,
          unconfigured: true,
        },
        { status: 503 },
      ),
    };
  }

  return { session: { ...resolved.session, userId: resolved.session.userId } };
}

/* ---------------------------------------------------------------------------
   Rate limiting

   In-process and per-user. The model endpoints are the expensive ones, and an
   unbounded loop in a client — or an open tab left retrying — would spend real
   money quickly.

   Per server instance, like the router's circuit breaker: sharing state would
   mean a round trip on the hot path of every request to bound something that
   is already bounded per instance.
--------------------------------------------------------------------------- */

const WINDOW_MS = 60_000;
const MAX_RUNS_PER_WINDOW = 20;

const windows = new Map<string, { count: number; resetAt: number }>();

/**
 * Whether `userKey` has used up its window. `max` is per feature — callers
 * other than chat prefix the key with the feature's name, so one feature's
 * use never counts against another's.
 */
export function rateLimited(userKey: string, max: number = MAX_RUNS_PER_WINDOW): boolean {
  const now = Date.now();
  const current = windows.get(userKey);

  if (current === undefined || now >= current.resetAt) {
    windows.set(userKey, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  current.count += 1;
  if (current.count > max) return true;

  /* Bounded: without this the map grows once per user per process forever. */
  if (windows.size > 5_000) {
    for (const [key, entry] of windows) {
      if (now >= entry.resetAt) windows.delete(key);
    }
  }

  return false;
}

/** Test seam. Nothing in the app calls this. */
export function resetRateLimits(): void {
  windows.clear();
}
