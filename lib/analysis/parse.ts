import { safeHttpsUrl } from "@/lib/passport/derive";

/* ---------------------------------------------------------------------------
   Token analysis sources, parsed. Pure — the reads are lib/analysis/server.ts.

   Three sources Elyra did not use before, each read live and checked field
   by field (shapes verified against the live APIs on 25 November 2026):

   - Jupiter's token index (`/tokens/v2/search`), for a Solana token: price,
     market cap, FDV, supply, holders, liquidity, 24h flows, Jupiter's audit
     (mint and freeze authority disabled, the top holders' share), its
     organic-activity score, and the social links set on the listing.
   - CoinGecko's public API, for any coin by symbol: price, 24h and 7d
     change, market cap and rank, FDV, volume, supply.
   - Rugcheck (`/v1/tokens/{mint}/report/summary`), a second, independent
     reading of a Solana token's risks.

   Everything they return is outside data: a number that is not finite is
   null, never zero, and a link is kept only when it is https.
--------------------------------------------------------------------------- */

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown, max = 200): string | null => (typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null);
const bool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

/* ---------------------------------------------------------------------------
   Jupiter
--------------------------------------------------------------------------- */

export interface SocialLinks {
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
}

export interface SolanaTokenStats {
  mint: string;
  name: string | null;
  symbol: string | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  holderCount: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  change24hPct: number | null;
  /** Buys plus sells over 24h, USD. */
  volume24hUsd: number | null;
  buyVolume24hUsd: number | null;
  sellVolume24hUsd: number | null;
  traders24h: number | null;
  /** Wallets that bought more than they sold over 24h, net. */
  netBuyers24h: number | null;
  /** Change in the number of holders over 24h, percent. */
  holderChange24hPct: number | null;
  mintAuthorityDisabled: boolean | null;
  freezeAuthorityDisabled: boolean | null;
  /** The share of supply the top holders hold, percent, as Jupiter's audit counts it. */
  topHoldersPct: number | null;
  /** 0–100: how much of the token's trading Jupiter judges organic rather than bots. */
  organicScore: number | null;
  verified: boolean;
  links: SocialLinks;
  /** When its first pool was created, ISO. */
  firstPoolAt: string | null;
}

/** Jupiter's entry for exactly `mint` out of a search response, or null. */
export function parseJupiterToken(body: unknown, mint: string): SolanaTokenStats | null {
  const entry = (Array.isArray(body) ? body : []).map(record).find((candidate) => candidate?.id === mint);
  if (entry === undefined || entry === null) return null;
  const day = record(entry.stats24h) ?? {};
  const audit = record(entry.audit) ?? {};
  const buy = num(day.buyVolume);
  const sell = num(day.sellVolume);
  return {
    mint,
    name: str(entry.name, 120),
    symbol: str(entry.symbol, 24),
    priceUsd: num(entry.usdPrice),
    marketCapUsd: num(entry.mcap),
    fdvUsd: num(entry.fdv),
    liquidityUsd: num(entry.liquidity),
    holderCount: num(entry.holderCount),
    circulatingSupply: num(entry.circSupply),
    totalSupply: num(entry.totalSupply),
    change24hPct: num(day.priceChange),
    volume24hUsd: buy !== null && sell !== null ? buy + sell : null,
    buyVolume24hUsd: buy,
    sellVolume24hUsd: sell,
    traders24h: num(day.numTraders),
    netBuyers24h: num(day.numNetBuyers),
    holderChange24hPct: num(day.holderChange),
    mintAuthorityDisabled: bool(audit.mintAuthorityDisabled),
    freezeAuthorityDisabled: bool(audit.freezeAuthorityDisabled),
    topHoldersPct: num(audit.topHoldersPercentage),
    organicScore: num(entry.organicScore),
    verified: entry.isVerified === true,
    links: {
      website: safeHttpsUrl(entry.website),
      twitter: safeHttpsUrl(entry.twitter),
      telegram: safeHttpsUrl(entry.telegram),
      discord: safeHttpsUrl(entry.discord),
    },
    firstPoolAt: str(record(entry.firstPool)?.createdAt, 40),
  };
}

/* ---------------------------------------------------------------------------
   CoinGecko
--------------------------------------------------------------------------- */

export interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  rank: number | null;
  priceUsd: number | null;
  change24hPct: number | null;
  change7dPct: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  volume24hUsd: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  athUsd: number | null;
  /** How far below its all-time high, percent (negative). */
  athChangePct: number | null;
  updatedAt: string | null;
}

/** `/coins/markets?vs_currency=usd&price_change_percentage=24h,7d`. */
export function parseCoinMarkets(body: unknown): CoinMarket[] {
  return (Array.isArray(body) ? body : [])
    .map(record)
    .filter((row): row is Record<string, unknown> => row !== null && typeof row.id === "string")
    .map((row) => ({
      id: row.id as string,
      symbol: (str(row.symbol, 24) ?? "").toUpperCase(),
      name: str(row.name, 120) ?? (row.id as string),
      rank: num(row.market_cap_rank),
      priceUsd: num(row.current_price),
      change24hPct: num(row.price_change_percentage_24h_in_currency) ?? num(row.price_change_percentage_24h),
      change7dPct: num(row.price_change_percentage_7d_in_currency),
      marketCapUsd: num(row.market_cap),
      fdvUsd: num(row.fully_diluted_valuation),
      volume24hUsd: num(row.total_volume),
      circulatingSupply: num(row.circulating_supply),
      totalSupply: num(row.total_supply),
      maxSupply: num(row.max_supply),
      athUsd: num(row.ath),
      athChangePct: num(row.ath_change_percentage),
      updatedAt: str(row.last_updated, 40),
    }));
}

/**
 * The coin a symbol means, from `/search`: of the coins whose symbol is
 * exactly it, the one with the best market-cap rank. A dozen coins share
 * most symbols, and the largest is what a person asking "SOL" means; an
 * unranked match is taken only when no ranked one exists.
 */
export function pickCoinId(body: unknown, symbol: string): { id: string; name: string; rank: number | null } | null {
  const wanted = symbol.trim().toUpperCase();
  const coins = (record(body)?.coins as unknown[] | undefined) ?? [];
  let best: { id: string; name: string; rank: number | null } | null = null;
  for (const raw of coins) {
    const coin = record(raw);
    if (coin === null || typeof coin.id !== "string" || str(coin.symbol, 24)?.toUpperCase() !== wanted) continue;
    const rank = num(coin.market_cap_rank);
    if (best === null || (rank !== null && (best.rank === null || rank < best.rank))) best = { id: coin.id, name: str(coin.name, 120) ?? coin.id, rank };
  }
  return best;
}

/* ---------------------------------------------------------------------------
   Rugcheck
--------------------------------------------------------------------------- */

export interface RugcheckRisk {
  name: string;
  description: string;
  level: "danger" | "warn" | "info";
}

export interface RugcheckSummary {
  /** Rugcheck's own risk score, normalised to 0–100: higher is riskier. */
  riskScore: number | null;
  risks: RugcheckRisk[];
  /** Share of liquidity Rugcheck sees locked, percent. */
  lpLockedPct: number | null;
}

export function parseRugcheck(body: unknown): RugcheckSummary | null {
  const summary = record(body);
  if (summary === null) return null;
  const risks = (Array.isArray(summary.risks) ? summary.risks : [])
    .map(record)
    .filter((risk): risk is Record<string, unknown> => risk !== null)
    .map((risk) => {
      const level = risk.level === "danger" || risk.level === "warn" ? risk.level : "info";
      return { name: str(risk.name, 120) ?? "", description: str(risk.description, 300) ?? "", level } as RugcheckRisk;
    })
    .filter((risk) => risk.name.length > 0)
    .slice(0, 12);
  return { riskScore: num(summary.score_normalised), risks, lpLockedPct: num(summary.lpLockedPct) };
}

/* ---------------------------------------------------------------------------
   Yahoo Finance quotes, for macro series Pyth does not carry
--------------------------------------------------------------------------- */

export interface Quote {
  price: number;
  previousClose: number | null;
  changePct: number | null;
}

/** A Yahoo chart response's last price and previous close. */
export function parseYahooQuote(body: unknown): Quote | null {
  const meta = record(record((record(record(body)?.chart)?.result as unknown[] | undefined)?.[0])?.meta);
  const price = num(meta?.regularMarketPrice);
  if (price === null) return null;
  const previous = num(meta?.chartPreviousClose) ?? num(meta?.previousClose);
  return { price, previousClose: previous, changePct: previous !== null && previous !== 0 ? (price / previous - 1) * 100 : null };
}
