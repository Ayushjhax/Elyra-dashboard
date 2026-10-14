import "server-only";

import { optional } from "@/lib/env";
import { resolveTokens } from "@/lib/solana/tokens";
import { summarise, type HeliusTransaction, type TokenLabel, type TxSummary } from "@/lib/wallet/summarise";

/* ---------------------------------------------------------------------------
   What each wallet transaction did, from Helius.

   The signature list says a transaction landed and when; it says nothing
   about what moved. Helius parses transactions into balance changes, and
   this app's RPC already is Helius — the same key answers both. So when
   SOLANA_RPC_URL is a Helius endpoint the activity feed can say "Swapped
   2 SOL for 290 USDC" instead of "Wallet transaction"; with any other RPC
   the summaries are simply absent and the rows read as before.

   A landed transaction never changes, so each summary is cached for the
   life of the process: a feed that polls every minute parses each
   transaction once.
--------------------------------------------------------------------------- */

const PARSE_URL = "https://api.helius.xyz/v0/transactions";
const TIMEOUT_MS = 8_000;
const MAX_CACHED = 5_000;

const cache = new Map<string, TxSummary | null>();

/** The Helius key inside SOLANA_RPC_URL, when that URL is Helius's. */
export function heliusKey(): string | null {
  const raw = optional("SOLANA_RPC_URL");
  if (raw === undefined) return null;
  try {
    const url = new URL(raw);
    if (!url.hostname.endsWith("helius-rpc.com")) return null;
    return url.searchParams.get("api-key");
  } catch {
    return null;
  }
}

/**
 * Summaries for the given signatures of one wallet. Never throws: a
 * signature Helius cannot parse, or a Helius outage, leaves it out.
 */
export async function describeSignatures(
  wallet: string,
  signatures: readonly string[],
): Promise<Map<string, TxSummary>> {
  const result = new Map<string, TxSummary>();
  const key = heliusKey();
  if (key === null || signatures.length === 0) return result;

  const missing = signatures.filter((signature) => !cache.has(`${wallet}:${signature}`));
  if (missing.length > 0) {
    let parsed: HeliusTransaction[] = [];
    try {
      const response = await fetch(`${PARSE_URL}?api-key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactions: missing.slice(0, 100) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (response.ok) parsed = ((await response.json()) as HeliusTransaction[]) ?? [];
    } catch {
      /* Leave them uncached; the next poll tries again. */
    }

    if (parsed.length > 0) {
      const mints = new Set<string>();
      for (const tx of parsed) {
        for (const entry of tx.accountData ?? []) {
          for (const change of entry.tokenBalanceChanges ?? []) {
            if (change.userAccount === wallet && change.mint) mints.add(change.mint);
          }
        }
      }
      const known = await resolveTokens([...mints]);
      const labels = new Map<string, TokenLabel>(
        [...known].map(([mint, meta]) => [mint, { symbol: meta.symbol, icon: meta.icon }]),
      );

      for (const tx of parsed) {
        if (!tx.signature) continue;
        if (cache.size >= MAX_CACHED) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(`${wallet}:${tx.signature}`, summarise(tx, wallet, labels));
      }
    }
  }

  for (const signature of signatures) {
    const summary = cache.get(`${wallet}:${signature}`);
    if (summary) result.set(signature, summary);
  }
  return result;
}
