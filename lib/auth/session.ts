import "server-only";

import type { LinkedAccount } from "@privy-io/node";
import { PRIVY_TIMEOUT_MS, privyClient } from "@/lib/auth/privy";
import { serviceClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

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
/** Postgres undefined-column. */
const UNDEFINED_COLUMN = "42703";

/**
 * Whether this database has `profiles.solana_address` yet.
 *
 * `create table if not exists` does nothing to a table that already exists,
 * so a database created from an earlier revision of 0001_init.sql is missing
 * the column, and every query naming it fails with 42703 — which took down
 * sign-in, chat, and both connect flows at once.
 *
 * Rather than let a schema that is one column behind break everything, the
 * column is probed once and the query adapts. Detected as absent, the Solana
 * address simply is not persisted, and the log says what to run.
 *
 * Delete this and the `columns()` indirection once every database has the
 * column; it exists for the window where some do not.
 */
let hasSolanaColumn: boolean | null = null;

function columns(): string {
  return hasSolanaColumn === false
    ? "id, wallet_address"
    : "id, wallet_address, solana_address";
}

function noteMissingColumn(): void {
  if (hasSolanaColumn === false) return;
  hasSolanaColumn = false;
  console.warn(
    "\n[elyra] profiles.solana_address is missing — Solana addresses will not " +
      "be stored. Run:\n" +
      "  alter table public.profiles add column if not exists solana_address text;\n",
  );
}

/** A profiles row, tolerating a database that predates `solana_address`. */
type ProfileRow = {
  id: string;
  wallet_address: string | null;
  solana_address?: string | null;
};

async function selectProfile(
  db: ReturnType<typeof serviceClient>,
  privyDid: string,
): Promise<ProfileRow | null> {
  const first = await db
    .from("profiles")
    .select(columns())
    .eq("privy_did", privyDid)
    .maybeSingle();

  if (!first.error) {
    if (hasSolanaColumn === null) hasSolanaColumn = true;
    return first.data as ProfileRow | null;
  }

  if (first.error.code !== UNDEFINED_COLUMN) throw first.error;

  noteMissingColumn();
  const retry = await db
    .from("profiles")
    .select(columns())
    .eq("privy_did", privyDid)
    .maybeSingle();

  if (retry.error) throw retry.error;
  return retry.data as ProfileRow | null;
}

/** The `profiles` row for a verified DID, creating it on first sign-in. */
async function resolveProfile(privyDid: string): Promise<SessionUser> {
  const db = serviceClient();

  const existing = await selectProfile(db, privyDid);

  if (existing !== null) {
    const currentEvm = existing.wallet_address;
    const currentSolana = existing.solana_address ?? null;

    /* Backfill an address we could not reach Privy for at creation time, or
       one linked after the profile was made — a user who signs up with email
       and connects a wallet later lands here. */
    if (currentEvm === null || (hasSolanaColumn !== false && currentSolana === null)) {
      const found = await fetchAddresses(privyDid);
      const evm = currentEvm ?? found.evm;
      const solana = currentSolana ?? found.solana;

      if (evm !== currentEvm || solana !== currentSolana) {
        const patch: Partial<Profile> = { wallet_address: evm };
        if (hasSolanaColumn !== false) patch.solana_address = solana;
        await db.from("profiles").update(patch).eq("id", existing.id);
      }

      return {
        userId: existing.id,
        privyDid,
        walletAddress: evm,
        solanaAddress: hasSolanaColumn === false ? found.solana : solana,
      };
    }

    return {
      userId: existing.id,
      privyDid,
      walletAddress: currentEvm,
      solanaAddress: currentSolana,
    };
  }

  const found = await fetchAddresses(privyDid);

  const insert: Partial<Profile> & { privy_did: string } = {
    privy_did: privyDid,
    wallet_address: found.evm,
  };
  if (hasSolanaColumn !== false) insert.solana_address = found.solana;

  const created = await db
    .from("profiles")
    .insert(insert)
    .select(columns())
    .single();

  if (created.error) {
    /* The column probe can only run on a select, so an insert naming
       solana_address against an older schema fails here first. Mark it
       absent and retry without it. */
    if (created.error.code === UNDEFINED_COLUMN) {
      noteMissingColumn();
      return resolveProfile(privyDid);
    }

    /* Lost the race against a concurrent first request. The other one won and
       the row now exists, so read it rather than failing the sign-in. */
    if (created.error.code === UNIQUE_VIOLATION) {
      const raced = await selectProfile(db, privyDid);
      if (raced === null) throw created.error;
      return {
        userId: raced.id,
        privyDid,
        walletAddress: raced.wallet_address,
        solanaAddress: raced.solana_address ?? found.solana,
      };
    }

    throw created.error;
  }

  const row = created.data as unknown as ProfileRow;
  return {
    userId: row.id,
    privyDid,
    walletAddress: row.wallet_address,
    solanaAddress: row.solana_address ?? found.solana,
  };
}

/* ---------------------------------------------------------------------------
   Diagnosis

   Token verification fails for two very different reasons: an expired or
   absent token, which is ordinary and constant, and a broken configuration,
   which is rare and total. Logging every failure would bury the second in the
   first, so this reports the FIRST failure of each distinct reason and then
   stays quiet.
--------------------------------------------------------------------------- */

const seenFailures = new Set<string>();

function noteVerificationFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  /* Expiry is the normal case and never worth a line. */
  if (/expired|exp claim|jwt expired/i.test(message)) return;

  const key = message.slice(0, 120);
  if (seenFailures.has(key)) return;
  seenFailures.add(key);

  const keyProblem = /key|pem|spki|asn1|decode|unsupported/i.test(message);
  console.error(
    `[elyra] Privy token verification failed: ${message}\n` +
      (keyProblem
        ? "  This looks like a key problem rather than a bad token, which means " +
          "EVERY sign-in is failing. Check PRIVY_VERIFICATION_KEY — the dashboard " +
          "shows a PEM block and only its base64 body is often pasted. It is " +
          "re-armoured automatically now; if this persists, unset it and the SDK " +
          "will verify against JWKS instead.\n"
        : "  Users will see \"Not signed in\". If they are in fact signed in, the " +
          "cause is here rather than in the browser.\n"),
  );
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
  } catch (error: unknown) {
    /* The caller is still told nothing beyond "not signed in" — the reason a
       token failed is not the client's business.

       But the SERVER must know, because a misconfiguration and a genuinely
       signed-out user are otherwise indistinguishable. That is not
       hypothetical: PRIVY_VERIFICATION_KEY was stored without its PEM
       armour, so every token failed to verify and every signed-in user was
       told they were signed out, with nothing anywhere saying why. */
    noteVerificationFailure(error);
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
