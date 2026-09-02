import "server-only";

import type { PythAssetType } from "@/lib/market/pyth/types";

/* ---------------------------------------------------------------------------
   Asset artwork.

   Four keyless sources, one per asset class, because no single one covers
   what Pyth carries:

     crypto   CoinMarketCap, keyed by the `cmc_id` already in each feed's
              metadata — no table needed.
     equity   Parqet, keyed by ticker. Spot-checked across the large US
              listings and it answers for all of them.
     metal    TradingView's symbol CDN, which names metals by element.
     fx       TradingView's country flags, for the pair's base currency.

   Anything else — Pyth's synthetic indices, commodities — has no artwork
   anywhere dependable and returns null, which renders the lettered chip.
   A URL that 404s renders the same chip, so a wrong guess degrades to the
   same place as no guess.
--------------------------------------------------------------------------- */

const CMC = "https://s2.coinmarketcap.com/static/img/coins/64x64";
const PARQET = "https://assets.parqet.com/logos/symbol";
const TRADINGVIEW = "https://s3-symbol-logo.tradingview.com";

/** Metal codes to the element names TradingView files them under. */
const METAL_SLUG: Record<string, string> = {
  XAU: "gold",
  XAG: "silver",
  XPT: "platinum",
  XPD: "palladium",
  XCU: "copper",
  GOLD: "gold",
  SILVER: "silver",
};

/**
 * Currency to the flag TradingView files it under.
 *
 * The euro flies the EU flag; every other major is its country's ISO code,
 * which is the currency code minus its trailing denomination letter.
 */
const CURRENCY_COUNTRY: Record<string, string> = {
  EUR: "EU",
  USD: "US",
  GBP: "GB",
  JPY: "JP",
  CHF: "CH",
  CAD: "CA",
  AUD: "AU",
  NZD: "NZ",
  CNY: "CN",
  HKD: "HK",
  SGD: "SG",
  SEK: "SE",
  NOK: "NO",
  MXN: "MX",
  ZAR: "ZA",
  TRY: "TR",
  INR: "IN",
  BRL: "BR",
  KRW: "KR",
  PLN: "PL",
};

export interface LogoInput {
  symbol: string;
  /** Base leg of the pair — the currency for FX, the element for a metal. */
  base: string;
  assetType: PythAssetType;
  cmcId: number | null;
  /** Region out of `Equity.US.TSLA/USD`, or null. */
  region: string | null;
}

export function logoFor(input: LogoInput): string | null {
  /* CoinMarketCap first wherever a listing exists — it covers tokenised
     equities like TSLAX, which Parqet does not know by that ticker. 0 appears
     in the catalogue for feeds with no listing. */
  if (input.cmcId !== null && input.cmcId > 0) {
    return `${CMC}/${input.cmcId}.png`;
  }

  switch (input.assetType) {
    case "equity":
      /* Parqet indexes US tickers. A foreign listing shares its ticker with
         unrelated companies elsewhere, so it gets the chip rather than
         another company's logo. */
      return input.region === "US"
        ? `${PARQET}/${input.symbol.toUpperCase()}`
        : null;

    case "metal": {
      const slug = METAL_SLUG[input.base.toUpperCase()];
      return slug ? `${TRADINGVIEW}/metal/${slug}--big.svg` : null;
    }

    case "fx": {
      const country = CURRENCY_COUNTRY[input.base.toUpperCase()];
      return country ? `${TRADINGVIEW}/country/${country}--big.svg` : null;
    }

    default:
      return null;
  }
}
