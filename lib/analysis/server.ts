import "server-only";

import { parseJupiterToken, parseYahooQuote, type CoinMarket, type Quote, type SolanaTokenStats } from "@/lib/analysis/parse";
import { safetyReport, sentimentScore, vixRegime, type SafetyReport, type SentimentScore } from "@/lib/analysis/score";
import { cached } from "@/lib/market/cache";
import { fetchJson } from "@/lib/market/http";
import { catalogue } from "@/lib/market/pyth/catalog";
import { pricesForIds, pricesForSymbols } from "@/lib/market/pyth/client";
import { readMint } from "@/lib/passport/server";
import { mintControls } from "@/lib/passport/derive";
import { coingeckoIdFor, coingeckoMarkets } from "@/lib/providers/coingecko";
import { hyperliquidMarket } from "@/lib/providers/hyperliquid-public";
import { jupiterTokenSearch } from "@/lib/providers/jupiter";
import { rugcheckSummary } from "@/lib/providers/rugcheck";
import { sentimentRead } from "@/lib/research/sentiment";
import { isSolanaAddress } from "@/lib/solana/address";
import { assetByMint, assetFor } from "@/lib/trade";

/* ---------------------------------------------------------------------------
   Token and market analysis: the reads behind Elyra's analysis tools
   (lib/agent/tools/analysis.ts). Each pulls from several sources at once
   and names every one; each source fails on its own and the result says
   which is missing rather than filling the gap.

   Price of record stays Pyth's, as everywhere in Elyra. CoinGecko supplies
   what a price feed does not — market cap, rank, FDV, supply — and Jupiter
   what only the chain knows about a Solana token: holders, liquidity,
   flows, authorities.
--------------------------------------------------------------------------- */

const settle = <T>(promise: Promise<T>): Promise<T | null> => promise.catch(() => null);
const fundingApr = (rate: number | null, hours: number | null): number | null =>
  rate === null ? null : Math.round(rate * (24 / (hours !== null && hours > 0 ? hours : 1)) * 365 * 100 * 100) / 100;

/** A Solana token, by mint, from Jupiter's index. */
export async function solanaToken(mint: string): Promise<SolanaTokenStats | null> {
  const result = await jupiterTokenSearch(mint);
  return result.ok && result.data !== undefined ? parseJupiterToken(result.data, mint) : null;
}

/** The Solana mint a symbol names on Elyra's verified list — not SOL itself, whose mint is wrapped SOL. */
function solanaMintFor(symbol: string): string | null {
  const upper = symbol.toUpperCase();
  if (upper === "SOL") return null;
  return assetFor(upper)?.mint ?? null;
}

/* ---------------------------------------------------------------------------
   Overview
--------------------------------------------------------------------------- */

export interface TokenOverview {
  query: string;
  name: string | null;
  symbol: string | null;
  mint: string | null;
  /** Pyth's price, Elyra's price of record, where Pyth carries the coin. */
  price: { usd: number; source: "pyth" } | null;
  market: (CoinMarket & { source: "coingecko" }) | null;
  onSolana: (SolanaTokenStats & { source: "jupiter" }) | null;
  notes: string[];
}

/** Everything about one token: by ticker ("SOL") or by Solana mint. */
export async function tokenOverview(query: string): Promise<TokenOverview> {
  const notes: string[] = [];
  const trimmed = query.trim();
  const byMint = isSolanaAddress(trimmed);
  const mint = byMint ? trimmed : solanaMintFor(trimmed);
  const symbol = byMint ? (assetByMint(trimmed)?.symbol ?? null) : trimmed.toUpperCase();

  const [onSolana, coin] = await Promise.all([
    mint === null ? Promise.resolve(null) : settle(solanaToken(mint)),
    symbol === null ? Promise.resolve(null) : settle(coingeckoIdFor(symbol)),
  ]);
  const resolvedSymbol = symbol ?? onSolana?.symbol ?? null;
  const [markets, pyth] = await Promise.all([
    coin === null ? Promise.resolve(null) : settle(coingeckoMarkets([coin.id])),
    resolvedSymbol === null ? Promise.resolve(null) : settle(pricesForSymbols([resolvedSymbol])),
  ]);

  if (mint !== null && onSolana === null) notes.push("Jupiter's token index had nothing for this mint.");
  if (symbol !== null && coin === null) notes.push(`CoinGecko lists no coin with the symbol ${symbol}.`);
  if (byMint && symbol === null) notes.push("This mint is not on Elyra's verified list: the name and symbol are what its listing claims, not a check of who issued it.");
  const market = markets?.[0] ?? null;
  const pythPrice = pyth?.find((row) => Number.isFinite(row.price) && row.price > 0)?.price ?? null;

  return {
    query: trimmed,
    name: market?.name ?? onSolana?.name ?? null,
    symbol: resolvedSymbol,
    mint,
    price: pythPrice === null ? null : { usd: pythPrice, source: "pyth" },
    market: market === null ? null : { ...market, source: "coingecko" },
    onSolana: onSolana === null ? null : { ...onSolana, source: "jupiter" },
    notes,
  };
}

/* ---------------------------------------------------------------------------
   Safety
--------------------------------------------------------------------------- */

export interface TokenSafety {
  mint: string;
  name: string | null;
  symbol: string | null;
  safety: SafetyReport;
  /** The facts the score was taken from. */
  facts: {
    controls: Array<{ title: string; live: boolean }> | null;
    topHoldersPct: number | null;
    liquidityUsd: number | null;
    holderCount: number | null;
    organicScore: number | null;
    verifiedOnJupiter: boolean | null;
    onElyrasList: boolean;
    firstPoolAt: string | null;
  };
  rugcheck: { riskScore: number | null; risks: Array<{ name: string; level: string; description: string }>; lpLockedPct: number | null; source: "rugcheck" } | null;
  sources: string[];
}

export async function tokenSafety(mint: string): Promise<TokenSafety> {
  const [account, stats, rug] = await Promise.all([settle(readMint(mint)), settle(solanaToken(mint)), settle(rugcheckSummary(mint))]);
  const listed = assetByMint(mint);
  const controls = account === null ? null : mintControls(account);
  const safety = safetyReport({
    controls,
    mintAuthorityDisabled: stats?.mintAuthorityDisabled ?? null,
    freezeAuthorityDisabled: stats?.freezeAuthorityDisabled ?? null,
    topHoldersPct: stats?.topHoldersPct ?? null,
    liquidityUsd: stats?.liquidityUsd ?? null,
    holderCount: stats?.holderCount ?? null,
    verified: stats === null ? null : stats.verified,
    issuerRun: listed !== null && (listed.issuer !== undefined || listed.class === "stablecoin" || listed.class === "yield"),
  });
  if (stats === null) safety.notes.push("Jupiter's token index had nothing for this mint, so holders, liquidity and concentration were not checked.");
  return {
    mint,
    name: stats?.name ?? listed?.name ?? null,
    symbol: listed?.symbol ?? stats?.symbol ?? null,
    safety,
    facts: {
      controls: controls?.map((control) => ({ title: control.title, live: control.live })) ?? null,
      topHoldersPct: stats?.topHoldersPct ?? null,
      liquidityUsd: stats?.liquidityUsd ?? null,
      holderCount: stats?.holderCount ?? null,
      organicScore: stats?.organicScore ?? null,
      verifiedOnJupiter: stats === null ? null : stats.verified,
      onElyrasList: listed !== null,
      firstPoolAt: stats?.firstPoolAt ?? null,
    },
    rugcheck: rug === null ? null : { ...rug, source: "rugcheck" },
    sources: [account !== null ? "Solana mint account" : null, stats !== null ? "Jupiter token index" : null, rug !== null ? "Rugcheck" : null].filter((entry): entry is string => entry !== null),
  };
}

/* ---------------------------------------------------------------------------
   Sentiment
--------------------------------------------------------------------------- */

export interface CoinSentiment {
  symbol: string | null;
  sentiment: SentimentScore;
  fearGreed: { value: number; classification: string; yesterday: number | null; weekAgo: number | null; source: "alternative.me" } | null;
  market: { leaningLongPct: number; weightedFundingApr: number | null; upPct: number; medianChangePct: number | null; source: "hyperliquid" } | null;
  perp: { fundingAprPct: number | null; openInterestUsd: number | null; change24hPct: number | null; source: "hyperliquid" } | null;
  flows: { buyVolumeUsd: number | null; sellVolumeUsd: number | null; netBuyers: number | null; source: "jupiter" } | null;
  notes: string[];
}

/** The market's mood, and one coin's against it when one is named. */
export async function coinSentiment(query: string | null): Promise<CoinSentiment> {
  const notes: string[] = [];
  const trimmed = query?.trim() ?? "";
  const byMint = trimmed.length > 0 && isSolanaAddress(trimmed);
  const symbol = trimmed.length === 0 ? null : byMint ? (assetByMint(trimmed)?.symbol ?? null) : trimmed.toUpperCase();
  const mint = byMint ? trimmed : symbol === null ? null : solanaMintFor(symbol);

  const [read, perp, stats] = await Promise.all([
    settle(sentimentRead()),
    symbol === null ? Promise.resolve(null) : settle(hyperliquidMarket(symbol)),
    mint === null ? Promise.resolve(null) : settle(solanaToken(mint)),
  ]);
  notes.push(...(read?.notes ?? []));
  const market = perp?.ok && perp.data !== undefined ? perp.data : null;
  if (symbol !== null && market === null) notes.push(`Hyperliquid lists no perp for ${symbol}, so there is no funding or open interest to read.`);
  const mark = market?.markPrice ?? null;
  const change = market !== null && mark !== null && market.prevDayPrice ? (mark / market.prevDayPrice - 1) * 100 : (stats?.change24hPct ?? null);
  const apr = market === null ? null : fundingApr(market.fundingRate, market.fundingIntervalHours);
  const position = read?.positioning ?? null;
  const fear = read?.fearGreed ?? null;

  return {
    symbol,
    sentiment: sentimentScore({
      fearGreed: fear?.value ?? null,
      fundingAprPct: apr,
      change24hPct: symbol === null ? null : change,
      marketMedianChangePct: position?.medianChangePct ?? null,
      buyVolumeUsd: stats?.buyVolume24hUsd ?? null,
      sellVolumeUsd: stats?.sellVolume24hUsd ?? null,
    }),
    fearGreed: fear === null ? null : { value: fear.value, classification: fear.classification, yesterday: fear.yesterday, weekAgo: fear.weekAgo, source: "alternative.me" },
    market:
      position === null
        ? null
        : { leaningLongPct: Math.round(position.positiveFundingPct), weightedFundingApr: position.weightedFundingApr, upPct: Math.round(position.upPct), medianChangePct: position.medianChangePct, source: "hyperliquid" },
    perp:
      market === null
        ? null
        : { fundingAprPct: apr, openInterestUsd: market.openInterest !== null && mark !== null ? Math.round(market.openInterest * mark) : null, change24hPct: change === null ? null : Math.round(change * 100) / 100, source: "hyperliquid" },
    flows: stats === null ? null : { buyVolumeUsd: stats.buyVolume24hUsd, sellVolumeUsd: stats.sellVolume24hUsd, netBuyers: stats.netBuyers24h, source: "jupiter" },
    notes,
  };
}

/* ---------------------------------------------------------------------------
   Macro
--------------------------------------------------------------------------- */

interface MacroSeries {
  key: string;
  name: string;
  /** Pyth's feed, the price of record, where it carries the series. */
  pyth?: string;
  /** Yahoo's symbol, for the change against the previous close — and the level where Pyth has none. */
  yahoo: string;
  unit?: "%";
}

export const MACRO_SERIES: readonly MacroSeries[] = [
  { key: "SPY", name: "S&P 500 (SPY)", pyth: "Equity.US.SPY/USD", yahoo: "SPY" },
  { key: "QQQ", name: "Nasdaq 100 (QQQ)", pyth: "Equity.US.QQQ/USD", yahoo: "QQQ" },
  { key: "DIA", name: "Dow Jones (DIA)", pyth: "Equity.US.DIA/USD", yahoo: "DIA" },
  { key: "VIX", name: "VIX volatility index", yahoo: "^VIX" },
  { key: "XAU", name: "Gold", pyth: "Metal.XAU/USD", yahoo: "GC=F" },
  { key: "WTI", name: "Oil (WTI)", yahoo: "CL=F" },
  { key: "DXY", name: "US Dollar Index (DXY)", yahoo: "DX-Y.NYB" },
  { key: "US10Y", name: "US 10-year Treasury yield", yahoo: "^TNX", unit: "%" },
];

export interface MacroRow {
  key: string;
  name: string;
  value: number | null;
  unit: "USD" | "%" | "index";
  changePct: number | null;
  /** Where the level came from; the change is always against Yahoo's previous close. */
  source: "pyth" | "yahoo" | null;
  session: string | null;
}

async function yahooQuote(symbol: string): Promise<Quote | null> {
  const result = await cached(`analysis:yahoo:${symbol}`, 60, async () =>
    parseYahooQuote(
      await fetchJson<unknown>({
        source: "yahoo",
        url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
        headers: { "user-agent": "Mozilla/5.0 (compatible; Elyra/1.0)" },
        timeoutMs: 6_000,
      }),
    ),
  );
  return result.value;
}

export async function macroSnapshot(): Promise<{ rows: MacroRow[]; vix: { level: number; regime: ReturnType<typeof vixRegime> } | null; notes: string[]; asOf: string }> {
  const notes: string[] = [];
  const pythPrices = new Map<string, { price: number; session: string | null }>();
  try {
    const { byPythSymbol } = await catalogue();
    const assets = MACRO_SERIES.flatMap((series) => {
      const asset = series.pyth === undefined ? undefined : byPythSymbol.get(series.pyth);
      return asset === undefined ? [] : [[series.key, asset] as const];
    });
    const prices = await pricesForIds(assets.map(([, asset]) => asset.id));
    for (const [key, asset] of assets) {
      const price = prices.find((row) => row.id === asset.id);
      if (price !== undefined && Number.isFinite(price.price) && price.price > 0) pythPrices.set(key, { price: price.price, session: price.marketSession });
    }
  } catch {
    notes.push("Pyth could not be read; levels come from Yahoo Finance.");
  }
  const quotes = await Promise.all(MACRO_SERIES.map((series) => settle(yahooQuote(series.yahoo))));
  const rows = MACRO_SERIES.map((series, index): MacroRow => {
    const pyth = pythPrices.get(series.key);
    const quote = quotes[index];
    const value = pyth?.price ?? quote?.price ?? null;
    return {
      key: series.key,
      name: series.name,
      value: value === null ? null : Math.round(value * 1000) / 1000,
      unit: series.unit ?? (series.key === "VIX" || series.key === "DXY" ? "index" : "USD"),
      changePct: quote?.changePct === null || quote?.changePct === undefined ? null : Math.round(quote.changePct * 100) / 100,
      source: pyth !== undefined ? "pyth" : quote !== null ? "yahoo" : null,
      session: pyth?.session ?? null,
    };
  });
  const missing = rows.filter((row) => row.value === null).map((row) => row.name);
  if (missing.length > 0) notes.push(`No reading for ${missing.join(", ")} right now.`);
  const vix = rows.find((row) => row.key === "VIX")?.value ?? null;
  return { rows, vix: vix === null ? null : { level: vix, regime: vixRegime(vix) }, notes, asOf: new Date().toISOString() };
}
