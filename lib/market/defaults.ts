/* ---------------------------------------------------------------------------
   Seed state.

   Pyth feed ids, not tickers. A ticker is ambiguous across asset classes —
   Pyth carries META as both Metadao and Meta Platforms, and SPX as the
   SPX6900 token rather than the index — so the watchlist, the selection and
   the chart all key on the feed id, which identifies exactly one instrument.

   These are only the starting set. Anything in the catalogue can be added
   from the picker, and nothing downstream is limited to this list.
--------------------------------------------------------------------------- */

/** Crypto.SOL/USD — the terminal's home market. */
export const DEFAULT_ASSET_ID = 6;

export const DEFAULT_WATCHLIST_IDS = [
  6, // SOL
  110, // HYPE
  1, // BTC
  2, // ETH
  92, // JUP
  13, // DOGE
  11, // SUI
  14, // XRP
  346, // XAU  — gold
  1435, // TSLA
];

export const DEFAULT_FAVORITE_IDS = [6, 110];
