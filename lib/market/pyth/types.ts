/* ---------------------------------------------------------------------------
   Pyth as the price source of truth.

   Deliberately not `server-only`: these are pure types plus one pure decode
   function, and the browser needs `PythAsset` to render a watchlist row. The
   modules that hold the API key — catalog.ts and client.ts — are server-only,
   which is where that boundary actually belongs.

   Two upstream endpoints back this, both on the Pyth Pro gateway:

     GET /v1/symbols       the feed catalogue — ~3.7k instruments with the
                           metadata this app needs (id, class, exponent, a
                           CoinMarketCap id for the logo).
     GET /v1/latest_price  batched current prices, one request for many feeds.

   Prices arrive as an integer mantissa plus a base-10 exponent rather than a
   float, because a float cannot hold an exact decimal price. Decoding happens
   in exactly one place — `decodePrice` below — so no caller ever has to
   remember to apply the exponent, which is the kind of mistake that silently
   moves a price by eight orders of magnitude.
--------------------------------------------------------------------------- */

/** Asset classes Pyth publishes, as they appear in the catalogue. */
export type PythAssetType =
  | "crypto"
  | "equity"
  | "fx"
  | "metal"
  | "commodity"
  | "crypto-index"
  | "crypto-redemption-rate"
  | "interest-rate"
  | "funding-rate"
  | "kalshi"
  | "nav"
  | "rates";

/**
 * One tradeable instrument, normalised out of the catalogue.
 *
 * This is the single asset-metadata shape the rest of the app uses — the
 * watchlist, the search picker, the chart selector and the market header all
 * read this and nothing else, so a field is defined here once.
 */
export interface PythAsset {
  /** `pyth_lazer_id`, the key the price endpoint takes. */
  id: number;
  /** Display ticker, parsed from the structured symbol: `Crypto.SOL/USD` → SOL. */
  symbol: string;
  /** Human name, title-cased from the catalogue description. */
  name: string;
  /** Fully qualified Pyth symbol, e.g. `Crypto.SOL/USD`. Unique. */
  pythSymbol: string;
  assetType: PythAssetType;
  /** What the price is quoted in — USD for almost everything. */
  quoteCurrency: string;
  /** Base-10 exponent the mantissa needs; -8 for most crypto. */
  exponent: number;
  /** Logo URL, or null when no artwork source covers this asset. */
  logo: string | null;
  /** TradingView symbol, or null when no chart can be shown. */
  tradingViewSymbol: string | null;
}

/** A decoded price for one feed. */
export interface PythPrice {
  id: number;
  symbol: string;
  /** Decoded to a real number, exponent already applied. */
  price: number;
  /** Pyth's confidence interval, same units as price. */
  confidence: number;
  /** Exponentially weighted moving average price. */
  emaPrice: number;
  bestBid: number | null;
  bestAsk: number | null;
  publisherCount: number;
  /** `regular`, or a session name when the underlying market is closed. */
  marketSession: string | null;
  /** When Pyth last updated the feed. */
  publishedAt: string;
}

/** Raw `/v1/latest_price` row, before decoding. */
export interface RawPriceFeed {
  priceFeedId: number;
  price: string;
  bestBidPrice?: string | null;
  bestAskPrice?: string | null;
  publisherCount?: number;
  exponent: number;
  confidence?: number | string;
  marketSession?: string | null;
  emaPrice?: string | null;
  emaConfidence?: number | string;
  feedUpdateTimestamp?: number;
}

export interface RawLatestPriceResponse {
  timestampUs: string;
  priceFeeds: RawPriceFeed[];
}

/** Raw `/v1/symbols` row. Only the fields this app reads are declared. */
export interface RawSymbol {
  pyth_lazer_id: number;
  name: string | null;
  symbol: string | null;
  description: string | null;
  asset_type: string | null;
  instrument_type: string | null;
  exponent: number | null;
  cmc_id: number | null;
  quote_currency: string | null;
  state: string | null;
  hermes_id: string | null;
  groups: string[] | null;
}

/**
 * Mantissa plus exponent to a number.
 *
 * `price: "9760248731", exponent: -8` is 97.60248731. Done with a string
 * shift rather than `Number(price) * 10 ** exponent` because the latter
 * introduces binary rounding error on the way through — 4307657 * 1e-3 is
 * 4307.6570000000006, which then prints a cent wrong at some precisions.
 */
export function decodePrice(mantissa: string | number, exponent: number): number {
  const raw = String(mantissa);
  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;

  /* A positive exponent means trailing zeroes, which needs no decimal point. */
  if (exponent >= 0) return Number(`${negative ? "-" : ""}${digits}${"0".repeat(exponent)}`);

  const shift = -exponent;
  const padded = digits.padStart(shift + 1, "0");
  const whole = padded.slice(0, padded.length - shift);
  const fraction = padded.slice(padded.length - shift);
  return Number(`${negative ? "-" : ""}${whole}.${fraction}`);
}

/** Thrown when Pyth is configured wrong or refuses the request. */
export class PythError extends Error {
  readonly kind: "unconfigured" | "unauthorized" | "upstream" | "malformed";
  readonly status: number | null;

  constructor(
    kind: PythError["kind"],
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = "PythError";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * One row of `/api/market/prices`.
 *
 * Declared here rather than in the route so client code can type the response
 * without importing a server route module.
 */
export interface PriceRow {
  id: number;
  symbol: string;
  /** From Pyth. Always. */
  price: number;
  /** From the exchange sources, null when none of them list the asset. */
  change24hPct: number | null;
  /**
   * The exchange sources' rolling 24h range and quote volume, for crypto
   * only. Equities, metals and FX get a change from Yahoo but no range, so
   * these are null there — and rendered as a dash, never as a guess.
   */
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  confidence: number;
  emaPrice: number;
  publisherCount: number;
  marketSession: string | null;
  publishedAt: string;
}
