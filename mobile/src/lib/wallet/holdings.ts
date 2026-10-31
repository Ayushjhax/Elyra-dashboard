import type { TokenBalance, WalletSnapshot } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   How the wallet screen groups a reading — kept out of the components so
   the rules are tested, not drawn.

   Verified tokens are listed under Assets, priced or not: a verified token
   with no price is a real holding whose value is unknown, a dash. An
   unverified mint gets its own group, because it is never valued and is
   never counted in the total, whatever it calls itself.

   What the total leaves out is said by kind. "Unverified" and "no price" are
   different facts, and calling an unpriced USDC "unverified" would be false.
--------------------------------------------------------------------------- */

export interface Holdings {
  /** Verified tokens, in the read's order (largest first). Native SOL is drawn apart. */
  verified: TokenBalance[];
  /** Unverified mints in this read — never valued. */
  unverified: TokenBalance[];
  /** Holdings with a balance: SOL when above zero, plus every mint held. */
  held: number;
}

export function holdingsOf(snapshot: WalletSnapshot): Holdings {
  return {
    verified: snapshot.tokens.filter((token) => token.verified),
    unverified: snapshot.tokens.filter((token) => !token.verified),
    held: (snapshot.sol > 0 ? 1 : 0) + snapshot.tokenCount,
  };
}

const holdings = (count: number) => `${count} ${count === 1 ? "holding" : "holdings"}`;

/** The line under the total that says what it leaves out, or null when it leaves nothing out. */
export function excludedLine(uncounted: WalletSnapshot["uncounted"]): string | null {
  const { unverified, unpriced } = uncounted;
  if (unverified > 0 && unpriced > 0) {
    return `${holdings(unverified + unpriced)} excluded from total balance — ${unverified} unverified, ${unpriced} with no price.`;
  }
  if (unverified > 0) return `${unverified} unverified ${unverified === 1 ? "holding" : "holdings"} excluded from total balance.`;
  if (unpriced > 0) return `${holdings(unpriced)} with no price excluded from total balance.`;
  return null;
}
