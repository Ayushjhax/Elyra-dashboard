/* ---------------------------------------------------------------------------
   Turning chain reads into the snapshot the UI renders.

   Extracted from the route and pure, because this is where the arithmetic
   lives and the arithmetic is where the money is. A bug found here during
   testing — the display cap was also bounding the total, silently
   understating a wallet by whatever sat past the hundredth token — was
   invisible while it was twenty lines inside a request handler.

   Three rules, all of them load-bearing:

   1. The cap bounds ROWS, never the total. `tokens` is truncated for the
      response; `usdValue` sums everything.
   2. A token absent from Jupiter's verified index never contributes value.
      Airdropping a mint named "USDC" costs a few cents, and a total that
      counted one could be set to any figure an attacker liked.
   3. An unknown SOL price yields a null total, not a partial one. Reporting
      the token value alone under a heading that says "total" would understate
      the wallet by the largest holding in it.
--------------------------------------------------------------------------- */

import type { TokenMeta } from "@/lib/solana/tokens";
import type { Cluster } from "@/lib/solana/cluster";
import type { HeldToken } from "@/lib/wallet/fold";
import { LAMPORTS_PER_SOL, type TokenBalance, type WalletSnapshot } from "@/lib/wallet/types";

/**
 * A wallet that has been airdropped a few hundred worthless mints should not
 * produce a response to match. The most valuable are kept as rows and the
 * remainder is reported as a count.
 */
export const MAX_TOKENS = 100;

export interface ComposeInput {
  address: string;
  cluster: Cluster;
  lamports: number;
  slot: number;
  held: Map<string, HeldToken>;
  /** Verified mints only — see `resolveTokens`. */
  meta: Map<string, TokenMeta>;
  /** Pyth's SOL/USD, or null when the feed is unavailable. */
  solUsd: number | null;
  fetchedAt: string;
}

export function composeSnapshot(input: ComposeInput): WalletSnapshot {
  let unpriced = 0;
  let unverified = 0;

  const tokens: TokenBalance[] = [...input.held.entries()].map(([mint, held]) => {
    /* Absent means the mint is not in Jupiter's verified index — an airdrop,
       or a token nobody has listed. Either way it carries no trustworthy
       symbol and never reaches the total. */
    const info = input.meta.get(mint);
    const price = info?.usdPrice ?? null;

    if (info === undefined) unverified += 1;
    else if (price === null) unpriced += 1;

    return {
      mint,
      symbol: info?.symbol ?? null,
      name: info?.name ?? null,
      amount: held.amount,
      decimals: info?.decimals ?? held.decimals,
      usdValue: price === null ? null : held.amount * price,
      icon: info?.icon ?? null,
      verified: info !== undefined,
    };
  });

  /* Most valuable first, then by size, so a truncated list drops the dust
     rather than the holdings. */
  tokens.sort(
    (a, b) => (b.usdValue ?? -1) - (a.usdValue ?? -1) || b.amount - a.amount,
  );

  const sol = input.lamports / LAMPORTS_PER_SOL;

  /* Summed over EVERY token, not the truncated list. Letting the display cap
     bound the arithmetic too would quietly understate the total — a live
     wallet in testing held 127 priced tokens against a cap of 100, so the
     difference is real rather than hypothetical. */
  const tokenUsd = tokens.reduce((sum, token) => sum + (token.usdValue ?? 0), 0);

  return {
    address: input.address,
    cluster: input.cluster,
    sol,
    lamports: input.lamports,
    solUsd: input.solUsd,
    tokens: tokens.slice(0, MAX_TOKENS),
    tokenCount: tokens.length,
    usdValue: input.solUsd === null ? null : sol * input.solUsd + tokenUsd,
    uncounted: { unpriced, unverified },
    slot: input.slot,
    fetchedAt: input.fetchedAt,
  };
}
