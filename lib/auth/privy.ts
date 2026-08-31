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
 */
let cached: PrivyClient | null = null;

export function privyClient(): PrivyClient {
  if (cached) return cached;

  cached = new PrivyClient({
    appId: required("NEXT_PUBLIC_PRIVY_APP_ID"),
    appSecret: required("PRIVY_APP_SECRET"),
    jwtVerificationKey: optional("PRIVY_VERIFICATION_KEY"),
  });

  return cached;
}

/** Ceiling on any call to Privy's API. Nothing here blocks a request for long. */
export const PRIVY_TIMEOUT_MS = 5_000;
