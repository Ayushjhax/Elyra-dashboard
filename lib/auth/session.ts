import "server-only";

import { NextResponse } from "next/server";
import type { LinkedAccount } from "@privy-io/node";
import { PRIVY_TIMEOUT_MS, privyClient } from "@/lib/auth/privy";
import { bindReferral, readAttributionCookie } from "@/lib/referrals/attribution";
import { unreachableReason } from "@/lib/supabase/reachability";
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
  /**
   * Null when `profileStore` is "unreachable" — there is no row, so there is
   * no id, and inventing one would put a fabricated foreign key into a table
   * the moment the database came back.
   *
   * Nullable rather than absent so the type checker walks every caller that
   * scopes a query by it. A route that cannot proceed without one answers
   * through `profileUnavailable()` below, rather than letting `undefined`
   * reach an `.eq("user_id", ...)` that would then match every row.
   */
  userId: string | null;
  privyDid: string;
  /** EVM, for the Hyperliquid portfolio read. Null on a Solana-only account. */
  walletAddress: string | null;
  /** Solana — this app's native chain, and what the UI displays. */
  solanaAddress: string | null;
  /**
   * A null address above means "we could not ask", not "there is none".
   *
   * The two are indistinguishable in a bare `string | null`, and they call
   * for opposite messages: one is an account that genuinely has no Solana
   * wallet, the other is a Privy outage sitting on top of an account that
   * has one. Telling a user with a funded wallet that they have no wallet is
   * the worse of the two mistakes, so the difference is carried rather than
   * flattened.
   */
  addressesUnresolved: boolean;
  /**
   * Whether the `profiles` row behind `userId` was actually read or written.
   *
   * "unreachable" is a working session against a database that did not
   * answer. Identity is still verified — the Privy token was checked, and the
   * wallet addresses came from Privy, which is their record and not this
   * database's — so every surface that needs only an address keeps working.
   * Only the surfaces that store or read rows are lost, and each reports that
   * specifically instead of failing the whole request.
   *
   * This exists because the alternative was observed: with the Supabase
   * project gone, the transport error thrown out of `selectProfile` escaped
   * `getSessionUser` entirely and every wallet read answered 500, over a
   * wallet whose address this server could have resolved from Privy without
   * touching the database at all.
   */
  profileStore: "ready" | "unreachable";
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

/**
 * What Privy knows about an account's wallets, or the reason we could not ask.
 *
 * A discriminated union rather than a pair of nullable strings, because the
 * old shape returned `{ evm: null, solana: null }` from the catch block and
 * so reported an unreachable Privy as an account with no wallets at all —
 * which the wallet route then rendered as "This account has no Solana
 * wallet." over a wallet that exists and holds a balance.
 */
type AddressLookup =
  | { ok: true; evm: string | null; solana: string | null }
  | { ok: false };

/**
 * Privy's answer, briefly remembered.
 *
 * `profiles` is a cache of Privy, not the record of it, and the cache misses
 * on every request for any database whose `solana_address` column is absent.
 * Without this, that miss would become one Privy API call per request — the
 * wallet panel alone polls every thirty seconds — so a successful lookup is
 * held for long enough to bound the call rate and short enough that a wallet
 * linked in another tab shows up on its own.
 *
 * Failures are deliberately not cached: a five-minute outage must not become
 * a five-minute lie about the user's wallet after Privy recovers.
 */
const ADDRESS_TTL_MS = 5 * 60_000;

const addressCache = new Map<
  string,
  { evm: string | null; solana: string | null; expiresAt: number }
>();

/**
 * Reported once per distinct reason, for the same purpose as the token
 * verification log below: a Privy outage and an account with no wallet look
 * identical from the outside, and only one of them is worth waking up for.
 */
const seenAddressFailures = new Set<string>();

function noteAddressLookupFailure(privyDid: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const key = message.slice(0, 120);
  if (seenAddressFailures.has(key)) return;
  seenAddressFailures.add(key);
  console.error(
    `[elyra] Could not read linked accounts from Privy for ${privyDid}: ${message}\n` +
      "  Wallet surfaces will report that the address could not be resolved " +
      "rather than that the account has none.\n",
  );
}

/**
 * Best effort, and honest about failing. A Privy API failure must not block
 * sign-in: the EVM address is only needed by the Hyperliquid portfolio
 * source, which reports its own absence rather than guessing.
 */
async function fetchAddresses(privyDid: string): Promise<AddressLookup> {
  const cached = addressCache.get(privyDid);
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    return { ok: true, evm: cached.evm, solana: cached.solana };
  }

  try {
    const user = await privyClient()
      .users()
      ._get(privyDid, { timeout: PRIVY_TIMEOUT_MS });
    const evm = firstAddress(user.linked_accounts, "ethereum");
    const solana = firstAddress(user.linked_accounts, "solana");
    addressCache.set(privyDid, { evm, solana, expiresAt: Date.now() + ADDRESS_TTL_MS });
    return { ok: true, evm, solana };
  } catch (error: unknown) {
    noteAddressLookupFailure(privyDid, error);
    return { ok: false };
  }
}

/** Test seam. The cache is process-local and holds nothing secret. */
export function clearAddressCache(): void {
  addressCache.clear();
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
async function resolveStoredProfile(
  privyDid: string,
  referralCode: string | null,
): Promise<SessionUser> {
  const db = serviceClient();

  const existing = await selectProfile(db, privyDid);

  if (existing !== null) {
    const currentEvm = existing.wallet_address;
    const currentSolana = existing.solana_address ?? null;

    /* Ask Privy whenever either address is missing from the row: it is the
       record of what is linked, and this row only caches it. Backfills an
       address Privy was unreachable for at creation time, and one linked
       after the profile was made — a user who signs up with email and
       connects a wallet later lands here.

       The guard used to also require `hasSolanaColumn !== false`, which
       inverted the intent of the whole missing-column fallback. Against a
       database whose `solana_address` column is absent, `currentSolana` is
       null for every user forever, so the branch meant to rescue that case
       was skipped for anyone whose EVM address happened to be stored — and
       every request then reported an account with no Solana wallet. That is
       what the balance chip was showing: an error state over a real, funded
       Phantom wallet. */
    if (currentEvm !== null && currentSolana !== null) {
      return {
        userId: existing.id,
        privyDid,
        walletAddress: currentEvm,
        solanaAddress: currentSolana,
        addressesUnresolved: false,
        profileStore: "ready",
      };
    }

    const found = await fetchAddresses(privyDid);
    if (!found.ok) {
      /* Report what is cached and say the rest is unresolved. Returning null
         here as "no wallet" is the mistake this whole path exists to avoid. */
      return {
        userId: existing.id,
        privyDid,
        walletAddress: currentEvm,
        solanaAddress: currentSolana,
        addressesUnresolved: true,
        profileStore: "ready",
      };
    }

    const evm = currentEvm ?? found.evm;
    const solana = currentSolana ?? found.solana;

    /* Persist only what this schema can hold. With the column absent the
       address is resolved from Privy on every cache miss instead, which is
       correct but costs a lookup — running the migration ends that. */
    if (evm !== currentEvm || (hasSolanaColumn !== false && solana !== currentSolana)) {
      const patch: Partial<Profile> = { wallet_address: evm };
      if (hasSolanaColumn !== false) patch.solana_address = solana;
      const update = await db.from("profiles").update(patch).eq("id", existing.id);
      if (update.error?.code === UNDEFINED_COLUMN) noteMissingColumn();
    }

    return {
      userId: existing.id,
      privyDid,
      walletAddress: evm,
      solanaAddress: solana,
      addressesUnresolved: false,
      profileStore: "ready",
    };
  }

  const found = await fetchAddresses(privyDid);

  const insert: Partial<Profile> & { privy_did: string } = {
    privy_did: privyDid,
    wallet_address: found.ok ? found.evm : null,
  };
  if (hasSolanaColumn !== false) insert.solana_address = found.ok ? found.solana : null;

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
      return resolveStoredProfile(privyDid, referralCode);
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
        solanaAddress: raced.solana_address ?? (found.ok ? found.solana : null),
        addressesUnresolved: !found.ok,
        profileStore: "ready",
      };
    }

    throw created.error;
  }

  const row = created.data as unknown as ProfileRow;

  /* The account is new as of this statement, which is the only unambiguous
     moment to attribute a referral: binding later would need a rule for
     accounts that already existed, and every version of that rule is a way to
     retro-attribute an established user to whoever last sent them a link.

     Deliberately not awaited and never allowed to throw. A referral that
     cannot be attributed must not keep someone out of the product, and the
     unique index on `referred_user_id` makes a lost race harmless. */
  if (referralCode != null) {
    void bindReferral(row.id, referralCode).catch(() => {});
  }

  return {
    userId: row.id,
    privyDid,
    walletAddress: row.wallet_address,
    solanaAddress: row.solana_address ?? (found.ok ? found.solana : null),
    addressesUnresolved: !found.ok,
    profileStore: "ready",
  };
}

/* ---------------------------------------------------------------------------
   The database is not the identity.

   `profiles` caches what Privy already knows. A verified token names the
   account, and Privy names its wallets; the row exists so that other tables
   have a stable foreign key to hang off, and so the addresses can be read
   without a Privy call on every request.

   That ordering is what makes the degraded session correct rather than a
   guess. When the project cannot be reached there is no row and no `userId`,
   but the account is no less verified and its Solana address is no less
   known — so the wallet, which needs nothing else, is answered in full.
--------------------------------------------------------------------------- */

/** Reported once per distinct reason, for the same reason as every other
    first-failure log in this file: the second occurrence teaches nobody
    anything and the thousandth buries the line that mattered. */
const seenStoreFailures = new Set<string>();

function noteStoreUnreachable(reason: string): void {
  const key = reason.slice(0, 120);
  if (seenStoreFailures.has(key)) return;
  seenStoreFailures.add(key);
  console.error(
    `\n[elyra] The profile store is unreachable: ${reason}\n` +
      "  Sign-in, the wallet panel and market data continue — they do not need it.\n" +
      "  Exchange connections, agent chat and Telegram linking do not, and each " +
      "will say so.\n",
  );
}

/** A verified account with no row behind it. Addresses come from Privy. */
async function degradedProfile(privyDid: string): Promise<SessionUser> {
  const found = await fetchAddresses(privyDid);
  return {
    userId: null,
    privyDid,
    walletAddress: found.ok ? found.evm : null,
    solanaAddress: found.ok ? found.solana : null,
    addressesUnresolved: !found.ok,
    profileStore: "unreachable",
  };
}

/**
 * The `profiles` row for a verified DID, or a Privy-only session when the
 * database could not be reached.
 *
 * Only transport failures degrade. A constraint violation, a missing table or
 * any other query error still throws: those are bugs in this codebase, and
 * swallowing them would turn a loud, fixable fault into a silent one where
 * nothing is ever written and no one is told.
 */
async function resolveProfile(
  privyDid: string,
  referralCode: string | null,
): Promise<SessionUser> {
  try {
    return await resolveStoredProfile(privyDid, referralCode);
  } catch (error: unknown) {
    const reason = unreachableReason(error);
    if (reason === null) throw error;
    noteStoreUnreachable(reason);
    return degradedProfile(privyDid);
  }
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

  /* Only consulted when a profile is created below; an established account
     ignores it entirely. See lib/referrals/attribution.ts. */
  return resolveProfile(privyDid, readAttributionCookie(req));
}

/** As `getSessionUser`, but throws instead of returning null. */
export async function requireSessionUser(req: Request): Promise<SessionUser> {
  const user = await getSessionUser(req);
  if (user === null) throw new UnauthenticatedError();
  return user;
}

/* ---------------------------------------------------------------------------
   Routes that need a row

   Everything below is for the surfaces that genuinely cannot work without the
   database — exchange connections, agent history, Telegram links. They are a
   minority: the wallet, the market data and the chart need none of it.
--------------------------------------------------------------------------- */

/** A session whose `profiles` row was read or created. */
export interface StoredSessionUser extends SessionUser {
  userId: string;
  profileStore: "ready";
}

/**
 * Narrows a session to one with a row behind it.
 *
 * Written as a guard rather than a non-null assertion at each call site so
 * that the check and the narrowing are the same act — an assertion would
 * compile just as happily against the degraded session it is meant to
 * exclude.
 */
export function hasProfile(user: SessionUser): user is StoredSessionUser {
  return user.userId !== null && user.profileStore === "ready";
}

/**
 * The answer a route owes when it needs a row and the database is unreachable.
 *
 * 503 rather than 500: nothing here is broken and the request was not wrong.
 * A dependency is down, the condition is temporary, and that is the code that
 * says so — to a client, to a proxy, and to whoever is reading the logs.
 *
 * `feature` names what is unavailable, so the message is useful in a panel
 * that has no other context.
 */
export function profileUnavailable(feature: string): NextResponse {
  return NextResponse.json(
    {
      error:
        `${feature} needs the database, which could not be reached. ` +
        "Signing in, the wallet and market data are unaffected.",
      /* Distinguishes "the service is not set up" from "the request failed",
         which the panels render differently — one is an instruction to the
         operator, the other an error at the user. */
      unconfigured: true,
    },
    { status: 503 },
  );
}
