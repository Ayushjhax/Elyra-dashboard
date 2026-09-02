import "server-only";

import type { PythAssetType } from "@/lib/market/pyth/types";

/* ---------------------------------------------------------------------------
   Pyth feed → TradingView symbol.

   Pyth carries thousands of feeds; TradingView names its instruments by
   exchange, and the two do not line up one for one. This derives a candidate
   per asset class rather than maintaining a per-asset table, and returns null
   when no honest candidate exists — a null renders the chart's "no chart for
   this asset" state, which is the graceful case the brief asks for.

   A derived symbol is a candidate, not a guarantee: TradingView may still not
   carry it. ChartPanel already treats a widget that never mounts as an error
   and says so, so a wrong guess degrades to that same state.
--------------------------------------------------------------------------- */

export interface DerivationInput {
  /** Display ticker: `SOL`, `XAU`, `TSLA`, `EURUSD`. */
  symbol: string;
  /** Base leg of the Pyth pair. */
  base: string;
  /** Quote leg. */
  quote: string;
  assetType: PythAssetType;
  /** Fully qualified Pyth symbol, which carries the region for equities. */
  pythSymbol: string;
}

/**
 * Assets whose derived symbol would be wrong, or which TradingView names
 * differently enough that no rule reaches them.
 *
 * Kept deliberately short. Anything solvable by a class rule belongs in a
 * rule, because a table is a thing that goes stale.
 */
const OVERRIDES: Record<string, string> = {
  /* Hyperliquid's home venue is not on TradingView's crypto aggregate. */
  HYPE: "MEXC:HYPEUSDT",
  /* TradingView's continuous futures for the commodities Pyth spot-quotes. */
  WTI: "TVC:USOIL",
  BRENT: "TVC:UKOIL",
  UKOILSPOT: "TVC:UKOIL",
  USOILSPOT: "TVC:USOIL",
  NATGAS: "TVC:NATGAS",
  XCU: "COMEX:HG1!",
  /* Metals trade against USD on OANDA with the metal code as written. */
  XAU: "OANDA:XAUUSD",
  XAG: "OANDA:XAGUSD",
  XPT: "OANDA:XPTUSD",
  XPD: "OANDA:XPDUSD",
};

/** Region prefix out of `Equity.US.TSLA/USD`. */
function equityRegion(pythSymbol: string): string | null {
  const parts = pythSymbol.split(".");
  return parts.length >= 3 ? parts[1] : null;
}

export function tradingViewSymbol(input: DerivationInput): string | null {
  /* Pyth's own synthetic indices — `Metal.Index.GOLD/USD`, `FX.Index.EUR/USD`
     — are 24/7 aggregates whose ticker is Pyth's, not a venue's. Deriving
     from the base produces plausible nonsense: GOLD would become
     `OANDA:GOLDUSD`, which does not exist, and the chart would sit there
     failing. The canonical spot feed for the same underlying is a separate
     catalogue entry that charts correctly, so this one says it has none. */
  if (input.pythSymbol.includes(".Index.")) return null;

  const override = OVERRIDES[input.symbol.toUpperCase()];
  if (override) return override;

  switch (input.assetType) {
    case "crypto":
      /* TradingView's own cross-exchange aggregate. It covers the majors and
         most listed alts without this file having to pick an exchange, and it
         survives a token moving venue. */
      return `CRYPTO:${input.base.toUpperCase()}USD`;

    case "metal":
      return `OANDA:${input.base.toUpperCase()}${input.quote.toUpperCase()}`;

    case "fx":
      return `FX:${input.base.toUpperCase()}${input.quote.toUpperCase()}`;

    case "equity": {
      /* Only US listings resolve reliably from a bare ticker. A European or
         Asian line needs an exchange prefix this cannot infer, so it gets no
         chart rather than someone else's price. */
      const region = equityRegion(input.pythSymbol);
      if (region !== "US") return null;
      /* `.EXT` feeds are the extended-hours line for a ticker TradingView
         already charts under its plain name. */
      return input.base.toUpperCase();
    }

    case "commodity":
    case "crypto-index":
    default:
      /* No dependable naming rule. The chart says so rather than guessing. */
      return null;
  }
}
