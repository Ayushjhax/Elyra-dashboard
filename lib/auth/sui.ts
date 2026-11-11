import "server-only";

import { NotFoundError } from "@privy-io/node";
import { PRIVY_TIMEOUT_MS, privyClient } from "@/lib/auth/privy";

/* ---------------------------------------------------------------------------
   The account's Sui wallet, as Privy records it.

   Separate from the session's Solana and EVM resolution (lib/auth/session.ts)
   on purpose: those two are read on every request and cached in `profiles`,
   and nothing there needs to change for a chain only the Sui routes ask
   about. This reads the linked accounts directly and remembers the answer
   briefly, the same way `fetchAddresses` does.

   The public key travels with the address because a Sui signature has to
   carry it (`flag || sig || pk`), and Privy signs a raw hash without
   returning one. It is never trusted on its own word: the route that uses it
   derives the address from it and refuses a key that does not derive to the
   session's address (lib/sui/tx.ts).
--------------------------------------------------------------------------- */

export interface SuiWallet {
  address: string;
  /** As Privy exposes it; decoded and checked in lib/sui/keys.ts. */
  publicKey: string | null;
}

const TTL_MS = 5 * 60_000;
/* A missing wallet is often one still being created after sign-in. */
const MISSING_TTL_MS = 5_000;

const cache = new Map<string, { wallet: SuiWallet | null; expiresAt: number }>();

export type SuiLookup = { ok: true; wallet: SuiWallet | null } | { ok: false };

export async function suiWalletFor(privyDid: string, fresh = false): Promise<SuiLookup> {
  const hit = fresh ? undefined : cache.get(privyDid);
  if (hit !== undefined && hit.expiresAt > Date.now()) return { ok: true, wallet: hit.wallet };

  try {
    const user = await privyClient().users()._get(privyDid, { timeout: PRIVY_TIMEOUT_MS });
    let wallet: SuiWallet | null = null;
    for (const account of user.linked_accounts as unknown as Record<string, unknown>[]) {
      if (account.chain_type !== "sui" || typeof account.address !== "string" || account.address.length === 0) continue;
      wallet = {
        address: account.address.toLowerCase(),
        publicKey: typeof account.public_key === "string" ? account.public_key : null,
      };
      break;
    }
    cache.set(privyDid, { wallet, expiresAt: Date.now() + (wallet === null ? MISSING_TTL_MS : TTL_MS) });
    return { ok: true, wallet };
  } catch (error: unknown) {
    if (error instanceof NotFoundError) return { ok: true, wallet: null };
    return { ok: false };
  }
}
