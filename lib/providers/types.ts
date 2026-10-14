/* ---------------------------------------------------------------------------
   The neutral surface every upstream data provider is reduced to.

   One envelope, one error taxonomy, one freshness stamp. Above this line
   nothing knows whether a price came from Jupiter or Birdeye; below it
   nothing knows what a portfolio is.

   Two rules the whole layer exists to enforce:

   A failed provider is never a zero. `{ ok: false }` and a balance of $0 are
   opposite claims — one says "we could not look", the other says "there is
   nothing there" — and collapsing the first into the second is how a
   dashboard confidently understates someone's net worth.

   A raw upstream error never reaches a model or a screen. Providers return
   HTML error pages, stack traces and vendor-specific codes; all of it is
   mapped to the taxonomy below before it can be rendered or put in a prompt.

   Client-safe: no `server-only`, no environment reads. The adapters that
   import it are server-only; the types travel.
--------------------------------------------------------------------------- */

export type ProviderId =
  | "sec"
  | "jupiter"
  | "birdeye"
  | "kamino"
  | "raydium"
  | "dflow"
  | "hyperliquid"
  | "polymarket"
  | "binance"
  | "solana-rpc"
  | "pyth";

/**
 * Why a call failed, in terms a caller can act on.
 *
 * `retryable` is carried separately from the code because the two are not the
 * same question: RATE_LIMIT is retryable later but not now, and AUTH is never
 * retryable no matter how long you wait.
 */
export type ProviderErrorCode =
  /** Key missing, rejected, or lacking permission for this endpoint. */
  | "AUTH"
  | "RATE_LIMIT"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "NOT_FOUND"
  /** The request this code built was malformed. A bug here, not upstream. */
  | "INVALID_REQUEST"
  /** The provider does not offer this capability, or the plan does not. */
  | "UNSUPPORTED"
  | "STALE_DATA";

export interface ProviderFailure {
  code: ProviderErrorCode;
  message: string;
  retryable: boolean;
}

export interface ToolResult<T> {
  ok: boolean;
  data?: T;
  /** One id, or several when a result was assembled from more than one. */
  provider: ProviderId | ProviderId[];
  /** When the underlying data was read. ISO. */
  asOf: string;
  /** Served from cache past its freshness target. */
  stale?: boolean;
  /** Some of what was asked for is missing — see `warnings`. */
  partial?: boolean;
  warnings?: string[];
  error?: ProviderFailure;
}

export function ok<T>(
  data: T,
  provider: ProviderId | ProviderId[],
  extra: Partial<Pick<ToolResult<T>, "stale" | "partial" | "warnings" | "asOf">> = {},
): ToolResult<T> {
  return {
    ok: true,
    data,
    provider,
    asOf: extra.asOf ?? new Date().toISOString(),
    ...(extra.stale === true ? { stale: true } : {}),
    ...(extra.partial === true ? { partial: true } : {}),
    ...(extra.warnings !== undefined && extra.warnings.length > 0
      ? { warnings: extra.warnings }
      : {}),
  };
}

export function fail<T>(
  provider: ProviderId | ProviderId[],
  code: ProviderErrorCode,
  message: string,
): ToolResult<T> {
  return {
    ok: false,
    provider,
    asOf: new Date().toISOString(),
    error: { code, message, retryable: isRetryable(code) },
  };
}

export function isRetryable(code: ProviderErrorCode): boolean {
  return (
    code === "RATE_LIMIT" ||
    code === "UPSTREAM_TIMEOUT" ||
    code === "UPSTREAM_UNAVAILABLE"
  );
}

/**
 * An HTTP status mapped to the taxonomy.
 *
 * 403 is AUTH rather than a separate code on purpose: in practice it means
 * "your key is real but your plan does not include this", which is the same
 * thing a caller must do something about — it is not a transient fault and
 * retrying it forever is pure waste. Birdeye's wallet endpoints answer
 * exactly this way on the key configured here.
 */
export function codeForStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMIT";
  if (status === 408 || status === 504) return "UPSTREAM_TIMEOUT";
  if (status >= 500) return "UPSTREAM_UNAVAILABLE";
  if (status >= 400) return "INVALID_REQUEST";
  return "UPSTREAM_UNAVAILABLE";
}

/* ---------------------------------------------------------------------------
   Capabilities

   What a provider can answer, rather than which endpoints it has. The router
   selects on these, so adding a provider is a matter of declaring what it can
   do — no call site changes.
--------------------------------------------------------------------------- */

export type DataCapability =
  | "solana_price"
  | "historical_price"
  | "wallet_balances"
  | "wallet_net_worth"
  | "historical_wallet_value"
  | "candles"
  | "orderbook"
  | "defi_positions"
  | "perp_positions"
  | "prediction_markets"
  | "swap_quote";

export interface ProviderHealth {
  provider: ProviderId;
  /** `degraded` still serves; `down` is short-circuited by the breaker. */
  status: "healthy" | "degraded" | "down";
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: ProviderErrorCode | null;
  consecutiveFailures: number;
  /** Rolling mean over recent calls, ms. Null before the first. */
  latencyMs: number | null;
  /** True while the circuit is open and calls are being skipped. */
  circuitOpen: boolean;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly capabilities: readonly DataCapability[];
  /** Whether the credentials this provider needs are actually configured. */
  configured(): boolean;
}

/* ---------------------------------------------------------------------------
   Normalised shapes
--------------------------------------------------------------------------- */

export interface PriceQuote {
  /** Mint address on Solana, or the venue's symbol elsewhere. */
  id: string;
  symbol?: string;
  usdPrice: number;
  change24hPct?: number;
  decimals?: number;
  /** Depth behind the price, where the provider reports it. */
  liquidityUsd?: number;
}

export interface HistoricalPricePoint {
  at: string;
  usdPrice: number;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  /** Base units, as strings — these are amounts, and floats lose them. */
  inAmount: string;
  outAmount: string;
  /** Worst case after slippage, base units. */
  minOutAmount?: string;
  /** A PERCENTAGE, e.g. 1.5 for 1.5%. Adapters convert; callers do not. */
  priceImpactPct?: number;
  slippageBps?: number;
  routeLabels?: string[];
  /** Opaque handle the execute step needs. Never interpreted here. */
  quoteRef?: string;
  /**
   * The unsigned transaction, base64, exactly as the router built it.
   *
   * Opaque on purpose: it is signed as bytes and handed back, never parsed or
   * rebuilt here. Anything this app reconstructed could differ from what the
   * router quoted, and the difference would be invisible at the point of
   * signing.
   */
  unsignedTransaction?: string;
  /**
   * Why this quote cannot be signed, in the router's own words.
   *
   * Set only when there is a price but no transaction. The router knows
   * exactly why — "Insufficient funds" is the common one — and that is worth
   * far more to the operator than anything this app could infer from an
   * empty field.
   */
  unexecutableReason?: string;
  /** After this the quote must be refreshed before it may be executed. */
  expiresAt?: string;
}

/* ---------------------------------------------------------------------------
   DeFi positions

   One shape for a lending obligation, a leveraged loop and an LP position,
   because the question a caller asks is the same for all three: how much is
   mine, how much is borrowed against it, and how close is it to being taken
   away.

   `liquidationLtv` is carried rather than derived. Kamino reports the real
   per-obligation threshold, and a liquidation distance inferred from leverage
   is a guess that reads as a fact — the one figure in this file where being
   approximately right is worse than being absent.
--------------------------------------------------------------------------- */

export type DefiPositionKind =
  | "lending"
  | "multiply"
  | "leverage"
  | "liquidity"
  | "earn"
  | "staking"
  | "private_credit";

export interface DefiTokenLeg {
  mint: string;
  symbol: string | null;
  /** Token units, not base units. Null when the provider did not report it. */
  amount: number | null;
  usdValue: number | null;
  usdPrice: number | null;
}

export interface DefiPosition {
  /** Stable per-position id from the provider — obligation, vault or strategy. */
  id: string;
  provider: ProviderId;
  /**
   * The receipt token a wallet holds for this position, where one exists.
   *
   * Carried purely so the portfolio layer can avoid counting a position
   * twice: an LP receipt sitting in the wallet AND the protocol's own
   * valuation of that same position are the same dollars. Null when the
   * protocol holds the position without issuing a token.
   */
  shareMint?: string | null;
  kind: DefiPositionKind;
  label: string;
  /** Deposits minus borrows. This is what the position is worth to the owner. */
  netUsd: number | null;
  suppliedUsd: number | null;
  borrowedUsd: number | null;
  supplied: DefiTokenLeg[];
  borrowed: DefiTokenLeg[];
  /** Current loan-to-value, 0–1. Null when nothing is borrowed. */
  ltv: number | null;
  /** The LTV at which this position is liquidated, as reported. Never derived. */
  liquidationLtv: number | null;
  /** Reported by the provider. Not computed from deposits and borrows. */
  leverage: number | null;
  apy: number | null;
}

/**
 * How much room a position has before liquidation, as a fraction of its
 * liquidation threshold.
 *
 * Returns null unless BOTH figures came from the provider. A caller that
 * wants to say "22% from liquidation" must get that number from here, so
 * there is exactly one place where the absence of a threshold means silence
 * rather than an estimate.
 */
export function liquidationHeadroom(position: DefiPosition): number | null {
  const { ltv, liquidationLtv } = position;
  if (ltv === null || liquidationLtv === null) return null;
  if (liquidationLtv <= 0) return null;
  return Math.max(0, (liquidationLtv - ltv) / liquidationLtv);
}

/* ---------------------------------------------------------------------------
   Liquidity pools and yields
--------------------------------------------------------------------------- */

export interface PoolInfo {
  id: string;
  provider: ProviderId;
  /** "SOL-USDC". Built from the pair, not from a provider display string. */
  pair: string;
  mintA: string;
  mintB: string;
  symbolA: string | null;
  symbolB: string | null;
  tvlUsd: number | null;
  volume24hUsd: number | null;
  /** Fee APR over 24h, percent. Excludes reward emissions. */
  feeApr24h: number | null;
  /** Fee plus rewards, percent, where the provider separates them. */
  totalApr24h: number | null;
  feeRate: number | null;
  poolType: string | null;
}

/* ---------------------------------------------------------------------------
   Perpetual markets
--------------------------------------------------------------------------- */

export interface PerpMarket {
  symbol: string;
  provider: ProviderId;
  markPrice: number | null;
  indexPrice: number | null;
  /** Per-interval rate as a fraction, e.g. 0.0000125. Not annualised here. */
  fundingRate: number | null;
  /** Hours between funding payments, so a caller can annualise correctly. */
  fundingIntervalHours: number | null;
  nextFundingAt: string | null;
  openInterest: number | null;
  volume24hUsd: number | null;
  maxLeverage: number | null;
  /** The price 24 hours ago, where the venue publishes it. */
  prevDayPrice?: number | null;
  /** Listed but no longer trading. */
  delisted?: boolean;
}

/* ---------------------------------------------------------------------------
   Prediction markets
--------------------------------------------------------------------------- */

export interface PredictionOutcome {
  label: string;
  /** Implied probability, 0–1. This is a price, and it is not a forecast. */
  price: number;
}

export type PredictionStatus = "open" | "closed" | "resolved" | "cancelled";

export interface PredictionMarket {
  id: string;
  provider: ProviderId;
  /** The event this market belongs to, where the provider groups them. */
  eventId?: string | null;
  question: string;
  description?: string | null;
  /** The provider's own category labels. Never invented here. */
  categories?: string[];
  slug: string | null;
  outcomes: PredictionOutcome[];
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  volumeUsd?: number | null;
  startAt?: string | null;
  endsAt: string | null;
  resolvedAt?: string | null;
  status?: PredictionStatus;
  resolutionSource?: string | null;
  url?: string | null;
  closed: boolean;

  /* --- Microstructure metadata -----------------------------------------

     Present on Polymarket. Optional because a second prediction provider
     need not expose the same fields, and a missing tick size must read as
     "unknown" rather than as a default that silently rounds a price to a
     level the venue will reject. */

  /** CLOB token id per outcome, positional with `outcomes`. */
  tokenIds?: string[];
  /** The on-chain condition id. What positions and the trade tape key on. */
  conditionId?: string | null;
  /** Minimum price increment. Every entry, target and stop must land on it. */
  tickSize?: number | null;
  minOrderSize?: number | null;
  /**
   * Part of a mutually exclusive outcome group.
   *
   * Load-bearing for cross-outcome probability maths: only a verified
   * exclusive-and-exhaustive set may be normalised to sum to 1.
   */
  negRisk?: boolean | null;
  negRiskGroupId?: string | null;
  lastTradePrice?: number | null;
  /** Probability POINT change, not percent — see the alert threshold note. */
  change24hPoints?: number | null;
  change1hPoints?: number | null;
  /** The venue is currently matching orders. False means look, do not trade. */
  acceptingOrders?: boolean | null;
}

/**
 * An event: one question with several markets under it.
 *
 * "Fed decision in September?" is an event; "no change", "25bp cut", "50bp
 * cut" are markets within it. Kept distinct because exposure concentrates by
 * EVENT — three positions across one event's outcomes is one bet, not three.
 */
export interface PredictionEvent {
  id: string;
  provider: ProviderId;
  title: string;
  slug: string | null;
  description?: string | null;
  categories: string[];
  markets: PredictionMarket[];
  liquidityUsd: number | null;
  volumeUsd: number | null;
  endsAt: string | null;
  closed: boolean;
  url?: string | null;
}

export type PredictionPositionStatus = "open" | "resolved" | "claimable" | "closed";

/**
 * One holding in one outcome of one market.
 *
 * ── Why max loss and max payout are separate fields ────────────────────
 *
 * A prediction position is not like a spot holding. Its downside is bounded
 * and KNOWN — shares settle at $0 or $1, so the most that can be lost is what
 * remains at risk, and the most that can be won is the share count minus that.
 * Those are arithmetic, not estimates, which is exactly why they are computed
 * once in the analytics layer and never asked of a model.
 */
export interface PredictionPosition {
  id: string;
  provider: ProviderId;
  /** The address these were read for. Proves WHOSE positions these are. */
  accountId: string;
  marketId: string;
  eventId?: string | null;
  marketTitle: string;
  slug?: string | null;
  /** "Yes", "No", or a named outcome in a multi-outcome market. */
  outcome: string;
  outcomeIndex?: number | null;
  /** Shares held. Each settles at $1 or $0. */
  quantity: number | null;
  /** Average price paid per share, 0–1. Also the entry probability. */
  entryPrice: number | null;
  /** Current price per share, 0–1. Also the market's implied probability. */
  currentPrice: number | null;
  costBasisUsd: number | null;
  currentValueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  realizedPnlUsd?: number | null;
  endsAt: string | null;
  status: PredictionPositionStatus;
  /** Settled in the holder's favour and awaiting a redeem transaction. */
  redeemable?: boolean;
}

export interface PredictionOrder {
  id: string;
  provider: ProviderId;
  marketId: string;
  marketTitle?: string | null;
  outcome: string;
  side: "buy" | "sell";
  price: number | null;
  quantity: number | null;
  filledQuantity: number | null;
  status: string;
  createdAt: string;
}

export type PredictionActivityKind =
  | "prediction_buy"
  | "prediction_sell"
  | "prediction_redeem"
  | "prediction_settlement"
  | "prediction_split"
  | "prediction_merge"
  | "prediction_other";

export interface PredictionActivity {
  id: string;
  provider: ProviderId;
  kind: PredictionActivityKind;
  marketId: string | null;
  marketTitle: string | null;
  outcome: string | null;
  /** Shares. */
  quantity: number | null;
  /** Price per share, 0–1. */
  price: number | null;
  usdValue: number | null;
  at: string;
  txHash?: string | null;
}

/** One side of an order book, best price first once normalised. */
export interface PredictionBookLevel {
  price: number;
  size: number;
}

export interface PredictionOrderbook {
  marketId: string;
  tokenId: string;
  /** Best bid first. */
  bids: PredictionBookLevel[];
  /** Best ask first. */
  asks: PredictionBookLevel[];
  /** Null when either side is empty — a one-sided book has no midpoint. */
  midpoint: number | null;
  spread: number | null;
  /**
   * MARKET-level last trade, NOT this outcome's.
   *
   * Verified live: both outcome books of a binary market carry the identical
   * value — whichever outcome traded most recently, quoted in THAT outcome's
   * terms. A YES book at 11/12 routinely reports 0.89 here because the last
   * print was a NO buy.
   *
   * So it must never be read as a price for `tokenId`. Anything needing a
   * per-outcome last trade filters the trade tape on the token id instead;
   * `lib/prediction/basket.ts` does exactly that and ignores this field.
   */
  lastTradePrice: number | null;
  minOrderSize: number | null;
  tickSize: number | null;
}

export interface PredictionPricePoint {
  at: string;
  /** 0–1. */
  probability: number;
}

/* ---------------------------------------------------------------------------
   Spot market statistics
--------------------------------------------------------------------------- */

export interface MarketTicker {
  symbol: string;
  provider: ProviderId;
  lastPrice: number;
  change24hPct: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24hBase: number | null;
  volume24hQuote: number | null;
}

/* ---------------------------------------------------------------------------
   Prediction market trades

   A print, not a quote. `polymarketTrades` reads these from the Data API,
   which is keyless; the CLOB's own /trades is authenticated and returns 401
   without a key, so public trade tape comes from the Data API alone.
--------------------------------------------------------------------------- */

export interface PredictionTrade {
  /** The CLOB token this traded, which is one OUTCOME of a market. */
  tokenId: string;
  marketId: string;
  /** Taker direction as the venue reports it. */
  side: "buy" | "sell";
  /** Shares. */
  size: number;
  /** Price per share, 0–1. */
  price: number;
  at: string;
  outcome: string | null;
  txHash: string | null;
}
