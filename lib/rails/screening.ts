import "server-only";

import type { Screening } from "@/lib/rails/types";

/* ---------------------------------------------------------------------------
   Sanctions screening for payees: is this address one OFAC lists?

   The source is the U.S. Treasury's SDN list as published — its "Digital
   Currency Address" entries — in the per-asset plain-text extraction that
   github.com/0xB10C/ofac-sanctioned-digital-currency-addresses regenerates
   from Treasury's XML every day. Read live and cached for six hours, never
   copied into this repository, so a new designation reaches Elyra the day
   it is published.

   It answers one narrow question, and says so: an address that is not on
   the list is "clear" of THAT list — not vetted, not known to be safe. A
   list that cannot be read makes the answer "unavailable", which the policy
   treats as a refusal (lib/rails/policy.ts): a payment is never routed on
   the assumption that a screen would have passed.
--------------------------------------------------------------------------- */

const BASE = "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists";
/** Solana addresses, and the EVM ones under ETH and its stablecoins. */
const LISTS = ["SOL", "ETH", "USDC", "USDT"] as const;
const TTL_MS = 6 * 60 * 60_000;
/** A list older than this is not used, even when a fresh read fails. */
const STALE_MS = 48 * 60 * 60_000;

export const SCREENING_SOURCE = "OFAC SDN digital currency addresses (U.S. Treasury, via 0xB10C's daily extraction)";

let cache: { at: number; addresses: Set<string> } | null = null;
let inflight: Promise<Set<string>> | null = null;

/** EVM addresses compare case-insensitively; Solana's base58 is case-sensitive. */
const normalise = (address: string) => (/^0x[0-9a-fA-F]{40}$/.test(address) ? address.toLowerCase() : address);

/** The addresses in one or more list files, one per line. */
export function parseLists(texts: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const text of texts) {
    for (const line of text.split(/\r?\n/)) {
      const address = line.trim();
      if (address.length >= 26 && !address.startsWith("#")) out.add(normalise(address));
    }
  }
  return out;
}

async function fetchLists(): Promise<Set<string>> {
  const texts = await Promise.all(
    LISTS.map(async (asset) => {
      const response = await fetch(`${BASE}/sanctioned_addresses_${asset}.txt`, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
      if (!response.ok) throw new Error(`The ${asset} list answered ${response.status}.`);
      return response.text();
    }),
  );
  const addresses = parseLists(texts);
  /* An empty read is a broken source, not a world with no sanctions. */
  if (addresses.size === 0) throw new Error("The sanctions lists came back empty.");
  return addresses;
}

async function sanctioned(now: number): Promise<Set<string> | null> {
  if (cache !== null && now - cache.at < TTL_MS) return cache.addresses;
  inflight ??= fetchLists().finally(() => {
    inflight = null;
  });
  try {
    const addresses = await inflight;
    cache = { at: now, addresses };
    return addresses;
  } catch {
    return cache !== null && now - cache.at < STALE_MS ? cache.addresses : null;
  }
}

export async function screenAddress(address: string, now: number = Date.now()): Promise<Screening> {
  const list = await sanctioned(now);
  const checkedAt = new Date(now).toISOString();
  if (list === null) return { status: "unavailable", source: SCREENING_SOURCE, checkedAt };
  return { status: list.has(normalise(address)) ? "listed" : "clear", source: SCREENING_SOURCE, checkedAt };
}

/** Test seam. */
export function resetScreening(): void {
  cache = null;
  inflight = null;
}
