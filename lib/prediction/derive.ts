import "server-only";

import { getProxyWalletAddress } from "@polymarket/sdk";

/* ---------------------------------------------------------------------------
   Finding a user's prediction-market account from the wallet they signed in
   with, so nobody has to paste an address.

   ── Why this is a search rather than a calculation ─────────────────────

   Polymarket holds positions in a contract wallet, and which KIND depends on
   how the account was made:

     Proxy wallet   email / Google login, via the Polymarket Proxy Factory
     Safe wallet    an external signer such as MetaMask
     Deposit wallet the current default, via a beacon proxy factory
     the EOA itself for someone who never used the app's own onboarding

   Only some of those are derivable from the signer alone, and they derive
   differently. So this produces CANDIDATES and the caller checks each against
   live data. An address that reports real positions is the account; one that
   reports nothing is discarded.

   ── Why a wrong guess must never be stored silently ────────────────────

   Every candidate below is a real, valid, checksummed address. If the wrong
   one were linked, the product would not error — it would attach a stranger's
   positions to this user's portfolio and report them as theirs. That is why
   derivation feeds a verification step instead of writing straight through.

   Factory addresses are from Polymarket's published contract list
   (docs.polymarket.com/resources/contracts), not from memory.
--------------------------------------------------------------------------- */

/** Polymarket Proxy Factory — accounts created through email or Google login. */
const PROXY_FACTORY = "0xaB45c5A4B0c941a2F231C04C3f49182e1A254052";

export type CandidateKind = "proxy" | "signer";

export interface AddressCandidate {
  address: string;
  kind: CandidateKind;
  /** Shown to the operator so an auto-detected link is explicable. */
  label: string;
}

function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

/**
 * Addresses worth checking for a given signer, most likely first.
 *
 * The proxy wallet leads because it is what Polymarket's own onboarding
 * creates for the majority of accounts. The signer itself is included because
 * a wallet that traded directly holds its positions at its own address.
 *
 * Safe and deposit wallets are deliberately absent: both derive differently
 * from the proxy, and a derivation written from a description rather than
 * from a verified test vector would produce a confident wrong address. The
 * paste path covers them, and the UI says so.
 */
export function candidatesFor(signer: string): AddressCandidate[] {
  /* Lower-cased before anything else. The derivation library validates the
     EIP-55 checksum and THROWS on a mixed-case address that does not match —
     so a checksummed address from one source and a pasted lower-case one from
     another would silently produce different candidate sets for the same
     wallet. An all-lower-case address carries no checksum to fail, which
     makes the derivation stable however the address arrived. */
  const eoa = signer.trim().toLowerCase();
  if (!isEvmAddress(eoa)) return [];

  const candidates: AddressCandidate[] = [];

  try {
    const proxy = getProxyWalletAddress(PROXY_FACTORY, eoa as `0x${string}`);
    if (typeof proxy === "string" && isEvmAddress(proxy)) {
      candidates.push({
        address: proxy.toLowerCase(),
        kind: "proxy",
        label: "Polymarket wallet derived from your connected wallet",
      });
    }
  } catch {
    /* A derivation failure is not fatal — the signer candidate below and the
       paste path both still work. */
  }

  candidates.push({
    address: eoa.toLowerCase(),
    kind: "signer",
    label: "Your connected wallet, if you traded from it directly",
  });

  /* Deduplicated: a signer that IS its own proxy would otherwise be checked
     twice and reported as two findings. */
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.address)) return false;
    seen.add(candidate.address);
    return true;
  });
}

export { PROXY_FACTORY };
