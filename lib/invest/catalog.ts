import type { ModelPortfolio, PortfolioCategory, RiskLevel } from "@/lib/invest/types";

/* ---------------------------------------------------------------------------
   The seven Intelligent Portfolios.

   Pure. Every `symbol` is a key of the swap allowlist in lib/trade.ts, and
   lib/invest/catalog.test.ts holds them to it: a holding the swap route would
   refuse is a portfolio nobody could buy.

   ── What every holding had to pass, on 9 November 2026 ─────────────────

   On Jupiter's verified list, a mint matching its issuer's pattern, a live
   price (a holding that cannot be valued cannot be rebalanced), and a $250
   USDC quote at well under 0.1% price impact. HYGon, BILon, SHYon and IEIon
   failed the price test and are not used.

   ── What these are not ─────────────────────────────────────────────────

   Not tokens, not funds and not advice tailored to anyone. They are Elyra's
   published weights. Each holding is bought into the person's own wallet and
   stays there; Elyra never holds it, never trades it without a signature,
   and nothing here wraps a basket into a token.

   No third party designed or endorses any of them. A name that implied one
   would be a claim this product cannot back.

   ── Changing one ───────────────────────────────────────────────────────

   `id` never changes: positions are recorded under it. Changing weights is a
   new `reviewedOn`, and every holder's drift is then measured against the new
   targets — which is what a rebalance after a review is.
--------------------------------------------------------------------------- */

export const PORTFOLIOS: readonly ModelPortfolio[] = [
  {
    id: "ai-leaders",
    name: "AI leaders",
    category: "thematic",
    risk: "higher",
    summary: "The companies building and selling the computing behind AI.",
    thesis: [
      "Chips, the factory that makes them, and the clouds and software that put them to work.",
      "Concentrated in one theme and one market: expect large swings in both directions.",
    ],
    holdings: [
      { symbol: "NVDAON", ticker: "NVDAon", name: "NVIDIA", weightBps: 2000, role: "Accelerated computing" },
      { symbol: "MSFTON", ticker: "MSFTon", name: "Microsoft", weightBps: 1500, role: "Cloud and AI software" },
      { symbol: "AVGOON", ticker: "AVGOon", name: "Broadcom", weightBps: 1200, role: "Custom AI chips and networking" },
      { symbol: "GOOGLON", ticker: "GOOGLon", name: "Alphabet", weightBps: 1200, role: "Models, search and cloud" },
      { symbol: "TSMON", ticker: "TSMon", name: "Taiwan Semiconductor", weightBps: 1000, role: "Makes most leading-edge chips" },
      { symbol: "METAON", ticker: "METAon", name: "Meta Platforms", weightBps: 1000, role: "AI at consumer scale" },
      { symbol: "AMZNON", ticker: "AMZNon", name: "Amazon", weightBps: 800, role: "Cloud infrastructure" },
      { symbol: "AMDON", ticker: "AMDon", name: "AMD", weightBps: 700, role: "Data-centre GPUs and CPUs" },
      { symbol: "PLTRON", ticker: "PLTRon", name: "Palantir", weightBps: 600, role: "AI software for organisations" },
    ],
    reviewedOn: "2026-11-09",
  },
  {
    id: "income-treasury",
    name: "Treasury income",
    category: "income",
    risk: "lower",
    summary: "Income from short and medium US Treasuries, with little price movement.",
    thesis: [
      "Mostly Treasury bills and tokens backed by them, so the value moves slowly.",
      "Inflation-protected and 7–10 year bonds add some yield and some rate risk.",
    ],
    holdings: [
      { symbol: "SGOVON", ticker: "SGOVon", name: "iShares 0–3 Month Treasury", weightBps: 4000, role: "Treasury bills" },
      { symbol: "USDY", ticker: "USDY", name: "Ondo US Dollar Yield", weightBps: 2500, role: "Short Treasuries and bank deposits" },
      { symbol: "IEFON", ticker: "IEFon", name: "iShares 7–10 Year Treasury", weightBps: 2000, role: "Medium-term Treasuries" },
      { symbol: "TIPON", ticker: "TIPon", name: "iShares TIPS", weightBps: 1500, role: "Inflation-protected Treasuries" },
    ],
    reviewedOn: "2026-11-09",
  },
  {
    id: "income-balanced",
    name: "Balanced income",
    category: "income",
    risk: "moderate",
    summary: "More income than Treasuries alone, from bonds, on-chain lending and dividend payers.",
    thesis: [
      "Nearly half in bonds and Treasury-backed dollars, a fifth in overcollateralised USDC lending.",
      "The remaining third in five large companies with long dividend records.",
    ],
    holdings: [
      { symbol: "AGGON", ticker: "AGGon", name: "iShares Core US Aggregate Bond", weightBps: 2000, role: "Investment-grade US bonds" },
      { symbol: "SYRUPUSDC", ticker: "syrupUSDC", name: "Syrup USDC (Maple)", weightBps: 2000, role: "Overcollateralised USDC lending" },
      { symbol: "TLTON", ticker: "TLTon", name: "iShares 20+ Year Treasury", weightBps: 1500, role: "Long Treasuries" },
      { symbol: "USDY", ticker: "USDY", name: "Ondo US Dollar Yield", weightBps: 1000, role: "Short Treasuries and bank deposits" },
      { symbol: "JNJON", ticker: "JNJon", name: "Johnson & Johnson", weightBps: 700, role: "Healthcare dividends" },
      { symbol: "PGON", ticker: "PGon", name: "Procter & Gamble", weightBps: 700, role: "Household staples dividends" },
      { symbol: "KOON", ticker: "KOon", name: "Coca-Cola", weightBps: 700, role: "Consumer staples dividends" },
      { symbol: "XOMON", ticker: "XOMon", name: "Exxon Mobil", weightBps: 700, role: "Energy dividends" },
      { symbol: "VZON", ticker: "VZon", name: "Verizon", weightBps: 700, role: "Telecom dividends" },
    ],
    reviewedOn: "2026-11-09",
  },
  {
    id: "income-high",
    name: "High income",
    category: "income",
    risk: "higher",
    summary: "The most income of the three, from lending, staking and dividend stocks — with more risk to match.",
    thesis: [
      "A quarter in USDC lending and 15% in staked SOL, whose price moves like SOL's.",
      "Half in dividend stocks and a tenth in long Treasuries, which can fall when rates rise.",
    ],
    holdings: [
      { symbol: "SYRUPUSDC", ticker: "syrupUSDC", name: "Syrup USDC (Maple)", weightBps: 2500, role: "Overcollateralised USDC lending" },
      { symbol: "JITOSOL", ticker: "JitoSOL", name: "Jito Staked SOL", weightBps: 1500, role: "Staking yield, with SOL's price risk" },
      { symbol: "XOMON", ticker: "XOMon", name: "Exxon Mobil", weightBps: 1200, role: "Energy dividends" },
      { symbol: "VZON", ticker: "VZon", name: "Verizon", weightBps: 1200, role: "Telecom dividends" },
      { symbol: "TLTON", ticker: "TLTon", name: "iShares 20+ Year Treasury", weightBps: 1000, role: "Long Treasuries" },
      { symbol: "JNJON", ticker: "JNJon", name: "Johnson & Johnson", weightBps: 900, role: "Healthcare dividends" },
      { symbol: "KOON", ticker: "KOon", name: "Coca-Cola", weightBps: 900, role: "Consumer staples dividends" },
      { symbol: "PGON", ticker: "PGon", name: "Procter & Gamble", weightBps: 800, role: "Household staples dividends" },
    ],
    reviewedOn: "2026-11-09",
  },
  {
    id: "mag7-crypto",
    name: "Magnificent 7 and crypto",
    category: "thematic",
    risk: "higher",
    summary: "The seven largest US technology companies, with bitcoin and staked SOL beside them.",
    thesis: [
      "Equal weights across the seven, so no one company dominates.",
      "Thirty percent in crypto, which moves faster than the stocks and often with them.",
    ],
    holdings: [
      { symbol: "AAPLON", ticker: "AAPLon", name: "Apple", weightBps: 1000, role: "Devices and services" },
      { symbol: "MSFTON", ticker: "MSFTon", name: "Microsoft", weightBps: 1000, role: "Cloud and software" },
      { symbol: "GOOGLON", ticker: "GOOGLon", name: "Alphabet", weightBps: 1000, role: "Search, models and cloud" },
      { symbol: "AMZNON", ticker: "AMZNon", name: "Amazon", weightBps: 1000, role: "Commerce and cloud" },
      { symbol: "METAON", ticker: "METAon", name: "Meta Platforms", weightBps: 1000, role: "Social and AI" },
      { symbol: "NVDAON", ticker: "NVDAon", name: "NVIDIA", weightBps: 1000, role: "Accelerated computing" },
      { symbol: "TSLAON", ticker: "TSLAon", name: "Tesla", weightBps: 1000, role: "Electric vehicles and energy" },
      { symbol: "CBBTC", ticker: "cbBTC", name: "Coinbase Wrapped BTC", weightBps: 2000, role: "Bitcoin" },
      { symbol: "JITOSOL", ticker: "JitoSOL", name: "Jito Staked SOL", weightBps: 1000, role: "Solana, staked" },
    ],
    reviewedOn: "2026-11-09",
  },
  {
    id: "growth-high",
    name: "High growth",
    category: "growth",
    risk: "higher",
    summary: "Mostly large US growth stocks, with nearly a fifth in crypto, for a long horizon.",
    thesis: [
      "Index funds carry nearly half; five companies add weight to the largest earners.",
      "No bonds or cash: a fall is not cushioned by anything in the portfolio.",
    ],
    holdings: [
      { symbol: "QQQON", ticker: "QQQon", name: "Invesco QQQ", weightBps: 3000, role: "Nasdaq 100" },
      { symbol: "IVVON", ticker: "IVVon", name: "iShares Core S&P 500", weightBps: 1500, role: "S&P 500" },
      { symbol: "NVDAON", ticker: "NVDAon", name: "NVIDIA", weightBps: 1000, role: "Accelerated computing" },
      { symbol: "MSFTON", ticker: "MSFTon", name: "Microsoft", weightBps: 800, role: "Cloud and software" },
      { symbol: "AVGOON", ticker: "AVGOon", name: "Broadcom", weightBps: 700, role: "Chips and networking" },
      { symbol: "AMZNON", ticker: "AMZNon", name: "Amazon", weightBps: 700, role: "Commerce and cloud" },
      { symbol: "TSMON", ticker: "TSMon", name: "Taiwan Semiconductor", weightBps: 500, role: "Chip manufacturing" },
      { symbol: "CBBTC", ticker: "cbBTC", name: "Coinbase Wrapped BTC", weightBps: 1200, role: "Bitcoin" },
      { symbol: "JITOSOL", ticker: "JitoSOL", name: "Jito Staked SOL", weightBps: 600, role: "Solana, staked" },
    ],
    reviewedOn: "2026-11-09",
  },
  {
    id: "growth-diversified",
    name: "Diversified growth",
    category: "growth",
    risk: "moderate",
    summary: "Stocks from around the world, cushioned by bonds and gold, with a small crypto sleeve.",
    thesis: [
      "Over half in US, developed and emerging-market stocks.",
      "A fifth in bonds and a tenth in gold, which have tended to move differently from stocks.",
    ],
    holdings: [
      { symbol: "VTION", ticker: "VTIon", name: "Vanguard Total Stock Market", weightBps: 3000, role: "The whole US stock market" },
      { symbol: "EFAON", ticker: "EFAon", name: "iShares MSCI EAFE", weightBps: 1500, role: "Developed markets outside North America" },
      { symbol: "IEMGON", ticker: "IEMGon", name: "iShares Core MSCI Emerging Markets", weightBps: 1000, role: "Emerging markets" },
      { symbol: "AGGON", ticker: "AGGon", name: "iShares Core US Aggregate Bond", weightBps: 1500, role: "Investment-grade US bonds" },
      { symbol: "IEFON", ticker: "IEFon", name: "iShares 7–10 Year Treasury", weightBps: 500, role: "Medium-term Treasuries" },
      { symbol: "GLDON", ticker: "GLDon", name: "SPDR Gold Shares", weightBps: 1000, role: "Gold" },
      { symbol: "CBBTC", ticker: "cbBTC", name: "Coinbase Wrapped BTC", weightBps: 800, role: "Bitcoin" },
      { symbol: "JITOSOL", ticker: "JitoSOL", name: "Jito Staked SOL", weightBps: 400, role: "Solana, staked" },
      { symbol: "USDY", ticker: "USDY", name: "Ondo US Dollar Yield", weightBps: 300, role: "Short Treasuries and bank deposits" },
    ],
    reviewedOn: "2026-11-09",
  },
];

export const CATEGORY_LABEL: Record<PortfolioCategory, string> = {
  income: "Income",
  growth: "Growth",
  thematic: "Thematic",
};

/** The order categories are listed in: steadiest first. */
export const CATEGORY_ORDER: readonly PortfolioCategory[] = ["income", "growth", "thematic"];

export const RISK_LABEL: Record<RiskLevel, string> = {
  lower: "Lower risk",
  moderate: "Moderate risk",
  higher: "Higher risk",
};

export function portfolioById(id: string): ModelPortfolio | null {
  return PORTFOLIOS.find((portfolio) => portfolio.id === id) ?? null;
}

/** Every symbol any portfolio holds, once. */
export function catalogSymbols(): string[] {
  return [...new Set(PORTFOLIOS.flatMap((portfolio) => portfolio.holdings.map((h) => h.symbol)))];
}

/* ---- the words every surface shows, kept with the catalog so the app and
        the website cannot say different things ---- */

/** How a portfolio is owned — shown before anyone buys. */
export const HOW_IT_WORKS: readonly string[] = [
  "You buy each holding with USDC, in one swap per holding, signed in your wallet.",
  "Everything you buy stays in your wallet. Elyra never holds it and never trades without your signature.",
  "When a holding drifts from its target, Elyra shows the trades that bring it back. You decide whether to sign them.",
];

/** Said wherever income is described: none of it arrives as cash. */
export const INCOME_NOTE =
  "None of these pay income into your wallet. USDY and syrupUSDC rise in price as they earn, and Ondo's stock and fund tokens reinvest dividends, after withholding tax, into the token.";

/** Said before anyone buys. */
export const ELIGIBILITY_NOTE =
  "Ondo's stock and fund tokens and USDY are not offered to US persons, and some are restricted in other countries. Check that you can hold them where you live before you buy.";

/** Said wherever weights are shown. */
export const NOT_ADVICE_NOTE =
  "These are Elyra's published weights, the same for everyone — not advice on what suits you. Prices can fall, and past moves say nothing certain about future ones.";
