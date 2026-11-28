/* ---------------------------------------------------------------------------
   Every tokenized stock and ETF Elyra knows, grouped by the share behind it.
   Pure — the reads are lib/equities/server.ts.

   Four issuers, each with its own primary market — where tokens are minted
   against shares and redeemed for them — and its own secondary market, where
   the tokens trade on-chain:

   - Backed's xStocks and Ondo Global Markets' tokens, on Solana, on Elyra's
     verified swap list (lib/trade.ts). Minted and redeemed by the issuer
     for its eligible clients; traded in a wallet through Jupiter.
   - The stocks issued through Backpack's tokenization service and Trek
     Nexus Markets' trust, listed on Solana by Sunrise. Converted to and
     from shares on Backpack Exchange; traded in a wallet through Sunrise's
     routes, once eligibility is confirmed (lib/sunrise/eligibility.ts).
   - Robinhood's stock tokens on Robinhood Chain. Read, never traded here:
     Robinhood says they may not be sold to US persons, and Elyra cannot
     check that (lib/evm/swap.ts).

   A token's price is the secondary market's; the share's is Pyth's regular-
   session US equity feed. The premium compares a token with ONE share: a
   token whose issuer has applied a multiplier for dividends or a corporate
   action represents more or less than one, and the page says so rather
   than adjusting for a ratio it has not read.
--------------------------------------------------------------------------- */

export type EquityIssuer = "backed" | "ondo" | "sunrise" | "robinhood";

export const ISSUER_ORDER: readonly EquityIssuer[] = ["sunrise", "backed", "ondo", "robinhood"];

export interface EquityToken {
  issuer: EquityIssuer;
  /** The token's own symbol. */
  symbol: string;
  name: string;
  chain: "solana" | "robinhood";
  address: string;
  /** The share's ticker, or null where it could not be read. */
  ticker: string | null;
  /** Secondary-market price of one token, USD. */
  priceUsd: number | null;
  /** How Elyra's swap names it — null when it is not traded here. */
  swap: { symbol: string } | null;
  /**
   * The token's own artwork, https only: the listing's icon for Backpack
   * Securities' tokens, Jupiter's verified index for the rest on Solana.
   * Null where neither has one — Robinhood Chain's tokens — and the page
   * shows the company's logo instead.
   */
  icon: string | null;
}

export interface EquityGroup {
  ticker: string;
  name: string;
  /** One share, from Pyth's US equity feed. */
  shareUsd: number | null;
  /** "regular", or the session Pyth reports while the market is closed. */
  session: string | null;
  tokens: Array<EquityToken & { premiumPct: number | null }>;
}

/**
 * The share a token stands for, from its symbol: Backed's end in "X"
 * (TSLAX), Ondo's in "ON" (TSLAON); Robinhood's symbol is the ticker. A
 * Sunrise token's ticker is read from Sunrise, and this is its fallback.
 */
export function tickerOf(issuer: EquityIssuer, symbol: string): string | null {
  const upper = symbol.toUpperCase();
  const stem =
    issuer === "backed" ? (upper.endsWith("X") ? upper.slice(0, -1) : null) : issuer === "ondo" ? (upper.endsWith("ON") ? upper.slice(0, -2) : null) : upper;
  return stem !== null && /^[A-Z][A-Z0-9.]{0,9}$/.test(stem) ? stem : null;
}

/** A token against one share, percent; null without both prices. */
export function premiumPct(tokenUsd: number | null, shareUsd: number | null): number | null {
  if (tokenUsd === null || shareUsd === null || !(tokenUsd > 0) || !(shareUsd > 0)) return null;
  return Math.round((tokenUsd / shareUsd - 1) * 10_000) / 100;
}

/**
 * Tokens grouped by their share, issuers in a fixed order within a group.
 * Shares with a token Elyra can trade come first, then the read-only ones,
 * each run by ticker — Robinhood alone lists hundreds, and they would
 * otherwise bury what can be traded. A token whose share is unknown is
 * kept, under its own symbol, so nothing listed is dropped for want of a
 * ticker.
 */
export function groupEquities(
  tokens: readonly EquityToken[],
  shares: ReadonlyMap<string, { name?: string; priceUsd: number | null; session: string | null }>,
): EquityGroup[] {
  const groups = new Map<string, EquityGroup>();
  for (const token of tokens) {
    const ticker = token.ticker ?? token.symbol.toUpperCase();
    const share = token.ticker === null ? undefined : shares.get(token.ticker);
    const group = groups.get(ticker) ?? {
      ticker,
      name: share?.name ?? baseName(token.name),
      shareUsd: share?.priceUsd ?? null,
      session: share?.session ?? null,
      tokens: [],
    };
    group.tokens.push({ ...token, premiumPct: premiumPct(token.priceUsd, group.shareUsd) });
    groups.set(ticker, group);
  }
  const rank = (issuer: EquityIssuer) => ISSUER_ORDER.indexOf(issuer);
  return [...groups.values()]
    .map((group) => ({ ...group, tokens: [...group.tokens].sort((a, b) => rank(a.issuer) - rank(b.issuer) || a.symbol.localeCompare(b.symbol)) }))
    .sort((a, b) => Number(tradable(b)) - Number(tradable(a)) || a.ticker.localeCompare(b.ticker));
}

const tradable = (group: EquityGroup): boolean => group.tokens.some((token) => token.swap !== null);

/** "Tesla xStock" and "Tesla (Ondo)" both name Tesla. */
export function baseName(name: string): string {
  return name
    .replace(/\s*\((Ondo|xStock)\)\s*$/i, "")
    .replace(/\s+xStock\b.*$/i, "")
    .trim();
}

/** Whether a group matches what was typed: ticker, name or any of its tokens' symbols. */
export function matches(group: EquityGroup, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return (
    group.ticker.toLowerCase().includes(q) ||
    group.name.toLowerCase().includes(q) ||
    group.tokens.some((token) => token.symbol.toLowerCase().includes(q))
  );
}
