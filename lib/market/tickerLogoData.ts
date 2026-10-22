/* ---------------------------------------------------------------------------
   Ticker helpers for logos — the pure half of lib/market/tickerLogos.ts,
   which keeps the React hook. Shared with the Android app.
--------------------------------------------------------------------------- */

/** "kPEPE" → "PEPE", "SOL-PERP" → "SOL". Hyperliquid prefixes 1000x lots with k. */
export function baseTicker(symbol: string): string {
  const trimmed = symbol.trim().replace(/[-/](PERP|USDC?|USDT|USD)$/i, "");
  return /^k[A-Z0-9]{2,}$/.test(trimmed) ? trimmed.slice(1) : trimmed.toUpperCase();
}

/** Hyperliquid's icon for a coin. An unknown name answers with a page, not an image, and falls through. */
export function hyperliquidIcon(symbol: string): string {
  return `https://app.hyperliquid.xyz/coins/${encodeURIComponent(baseTicker(symbol))}.svg`;
}

export interface TickerLogo {
  logo: string | null;
  fallbackLogo: string | null;
}
