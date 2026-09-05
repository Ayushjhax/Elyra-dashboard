import "server-only";

import { PrivyClient } from "@privy-io/node";
import { optional, required } from "@/lib/env";

/**
 * The Privy server client.
 *
 * `jwtVerificationKey` is optional: with it, access tokens are verified
 * locally against a key from the dashboard; without it, the SDK fetches the
 * app's JWKS, which costs a round trip on cold start and then caches. Both
 * are correct — the key is purely a latency choice, so it stays optional.
 *
 * That last sentence is why `normalizeVerificationKey` below drops a key it
 * cannot use rather than passing it through. A latency optimisation must
 * never be able to take authentication down.
 */
let cached: PrivyClient | null = null;

const PEM_HEADER = "-----BEGIN PUBLIC KEY-----";
const PEM_FOOTER = "-----END PUBLIC KEY-----";

/**
 * A usable PEM public key, or undefined.
 *
 * The Privy dashboard displays the verification key as a PEM block, and it
 * is easy to paste only the base64 body into an env file — the armour looks
 * decorative and the newlines are awkward to quote. It is not decorative:
 * `crypto.createPublicKey` cannot parse a bare body, so verification throws
 * for *every* token, and a route that catches that reports "Not signed in"
 * to a user who is signed in perfectly well.
 *
 * That was the actual failure here. Rather than require the env file to be
 * exactly right, a bare base64 SPKI body is re-armoured, and anything still
 * unusable is discarded so the SDK falls back to JWKS.
 */
export function normalizeVerificationKey(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;

  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  if (trimmed === "") return undefined;

  /* Already armoured, possibly with escaped newlines from a .env file. */
  if (trimmed.includes(PEM_HEADER)) {
    return trimmed.replace(/\\n/g, "\n");
  }

  /* A bare base64 body. Two things have to be repaired, and the second is
     the one that actually bit here.

     The armour is the obvious omission. The subtle one is PADDING: the key
     as stored was 122 base64 characters for 91 bytes, which is correct
     unpadded base64 and is what most web tooling emits. PEM is not most web
     tooling — its base64 must be a multiple of four, and 122 is not, so the
     decoder rejects a byte sequence that is in every other respect a
     perfectly valid P-256 SPKI. Re-armouring alone left it failing. */
  const unpadded = trimmed.replace(/\s+/g, "").replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]+$/.test(unpadded)) return undefined;

  const padding = (4 - (unpadded.length % 4)) % 4;
  if (padding === 3) return undefined;
  const body = unpadded + "=".repeat(padding);

  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `${PEM_HEADER}\n${wrapped}\n${PEM_FOOTER}`;
}

export function privyClient(): PrivyClient {
  if (cached) return cached;

  const verificationKey = normalizeVerificationKey(optional("PRIVY_VERIFICATION_KEY"));
  if (optional("PRIVY_VERIFICATION_KEY") !== undefined && verificationKey === undefined) {
    console.warn(
      "[elyra] PRIVY_VERIFICATION_KEY is set but is not a usable public key. " +
        "Ignoring it and verifying against Privy's JWKS instead — sign-in still " +
        "works, with one extra round trip on cold start.",
    );
  }

  cached = new PrivyClient({
    appId: required("NEXT_PUBLIC_PRIVY_APP_ID"),
    appSecret: required("PRIVY_APP_SECRET"),
    ...(verificationKey === undefined ? {} : { jwtVerificationKey: verificationKey }),
  });

  return cached;
}

/** Ceiling on any call to Privy's API. Nothing here blocks a request for long. */
export const PRIVY_TIMEOUT_MS = 5_000;
