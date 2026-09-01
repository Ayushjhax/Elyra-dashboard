import "server-only";

import type { LinkedAccount } from "@privy-io/node";
import { PRIVY_TIMEOUT_MS, privyClient } from "@/lib/auth/privy";
import { serviceClient } from "@/lib/supabase/server";

/**
 * A caller whose identity has been verified.
 *
 * `userId` is the internal `profiles.id` uuid — the only identifier that ever
 * reaches a database query. `privyDid` is kept for logging and for the Privy
 * API; it is never a foreign key.
 */
export interface SessionUser {
  userId: string;
  privyDid: string;
  /** EVM, for the Hyperliquid portfolio read. Null on a Solana-only account. */
  walletAddress: string | null;
  /** Solana — this app's native chain, and what the UI displays. */
  solanaAddress: string | null;
}

export class UnauthenticatedError extends Error {
  constructor(message = "Not signed in") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/**
 * The access token, from the Authorization header or Privy's cookie.
 *
 * The header is what the web panel sends, because it calls Privy's
 * `getAccessToken()` and attaches the result explicitly — that works
 * regardless of how the app's cookie settings are configured. The cookie is
 * the fallback for a same-origin request that did not set the header.
 */
function extractToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token.length > 0) return token;
  }

  const cookie = req.headers.get("cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== "privy-token") continue;
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    if (value.length > 0) return value;
  }

  return null;
}

/** The first address on a given chain. */
function firstAddress(
  accounts: LinkedAccount[],
  chain: "ethereum" | "solana",
): string | null {
  for (const account of accounts) {
    if (
      "chain_type" in account &&
      account.chain_type === chain &&
      "address" in account &&
      typeof account.address === "string" &&
      account.address.length > 0
    ) {
      /* EVM addresses are case-insensitive and are lower-cased so a lookup
         matches. Solana addresses are base58 and case-significant — lowering
         one produces a different, invalid address. */
      return chain === "ethereum"
        ? account.address.toLowerCase()
        : account.address;
    }
  }
  return null;
}

interface Addresses {
  evm: string | null;
  solana: string | null;
}

/**
 * Best effort. A Privy API failure must not block sign-in: the EVM address is
 * only needed by the Hyperliquid portfolio source, which reports its own
 * absence rather than guessing.
 */
async function fetchAddresses(privyDid: string): Promise<Addresses> {
  try {
    const user = await privyClient()
      .users()
      ._get(privyDid, { timeout: PRIVY_TIMEOUT_MS });
    return {
      evm: firstAddress(user.linked_accounts, "ethereum"),
      solana: firstAddress(user.linked_accounts, "solana"),
    };
  } catch {
    return { evm: null, solana: null };
  }
}

/** Postgres unique-violation. Two first requests for one new user race here. */
const UNIQUE_VIOLATION = "23505";

/** The `profiles` row for a verified DID, creating it on first sign-in. */
async function resolveProfile(privyDid: string): Promise<SessionUser> {
  const db = serviceClient();

  const existing = await db
    .from("profiles")
    .select("id, wallet_address, solana_address")
    .eq("privy_did", privyDid)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data) {
    /* Backfill an address we could not reach Privy for at creation time, or
       one linked after the profile was made — a user who signs up with email
       and connects a wallet later lands here. */
    if (
      existing.data.wallet_address === null ||
      existing.data.solana_address === null
    ) {
      const found = await fetchAddresses(privyDid);
      const evm = existing.data.wallet_address ?? found.evm;
      const solana = existing.data.solana_address ?? found.solana;

      if (evm !== existing.data.wallet_address || solana !== existing.data.solana_address) {
        await db
          .from("profiles")
          .update({ wallet_address: evm, solana_address: solana })
          .eq("id", existing.data.id);
      }

      return {
        userId: existing.data.id,
        privyDid,
        walletAddress: evm,
        solanaAddress: solana,
      };
    }

    return {
      userId: existing.data.id,
      privyDid,
      walletAddress: existing.data.wallet_address,
      solanaAddress: existing.data.solana_address,
    };
  }

  const found = await fetchAddresses(privyDid);
  const created = await db
    .from("profiles")
    .insert({
      privy_did: privyDid,
      wallet_address: found.evm,
      solana_address: found.solana,
    })
    .select("id, wallet_address, solana_address")
    .single();

  if (created.error) {
    /* Lost the race against a concurrent first request. The other one won and
       the row now exists, so read it rather than failing the sign-in. */
    if (created.error.code === UNIQUE_VIOLATION) {
      const raced = await db
        .from("profiles")
        .select("id, wallet_address, solana_address")
        .eq("privy_did", privyDid)
        .single();
      if (raced.error) throw raced.error;
      return {
        userId: raced.data.id,
        privyDid,
        walletAddress: raced.data.wallet_address,
        solanaAddress: raced.data.solana_address,
      };
    }
    throw created.error;
  }

  return {
    userId: created.data.id,
    privyDid,
    walletAddress: created.data.wallet_address,
    solanaAddress: created.data.solana_address,
  };
}

/**
 * The verified caller, or null when there is no valid token.
 *
 * This is the only path by which a `user_id` may enter a database query on
 * the web surface. Nothing else — not a request body, not a query parameter —
 * is allowed to name a user.
 */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = extractToken(req);
  if (token === null) return null;

  let privyDid: string;
  try {
    const claims = await privyClient().utils().auth().verifyAccessToken(token);
    privyDid = claims.user_id;
  } catch {
    /* Expired, malformed, or issued for another app. All the same to us, and
       the caller is told nothing beyond "not signed in". */
    return null;
  }

  return resolveProfile(privyDid);
}

/** As `getSessionUser`, but throws instead of returning null. */
export async function requireSessionUser(req: Request): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (user === null) throw new UnauthenticatedError();
  return user;
}
