"use client";

import { useCallback, useMemo } from "react";
import { useAssetsBySymbols } from "@/lib/market/usePrices";

/* ---------------------------------------------------------------------------
   Logos for markets named only by ticker.

   Smart-money consensus and the agent's signals name a market as Hyperliquid
   does — HYPE, ZRO, kPEPE — with no Pyth feed id. The catalogue's logo (from
   CoinMarketCap, the same artwork as the watchlist) is used where the ticker
   resolves; Hyperliquid's own coin icon is the second source, since every
   one of these markets is listed there; a ticker neither knows gets the
   lettered chip.
--------------------------------------------------------------------------- */

import { baseTicker, hyperliquidIcon, type TickerLogo } from "@/lib/market/tickerLogoData";

export { baseTicker, hyperliquidIcon, type TickerLogo };

/** One lookup for a whole list, so a feed of thirty tickers is one catalogue read. */
export function useTickerLogos(symbols: readonly string[]): (symbol: string) => TickerLogo {
  const bases = useMemo(() => [...new Set(symbols.map(baseTicker))], [symbols]);
  const assets = useAssetsBySymbols(bases);
  return useCallback(
    (symbol: string) => {
      const asset = assets.get(baseTicker(symbol));
      /* Crypto only: the same ticker can name a stock in the catalogue. */
      const pyth = asset && asset.assetType === "crypto" ? asset.logo : null;
      return { logo: pyth, fallbackLogo: hyperliquidIcon(symbol) };
    },
    [assets],
  );
}
