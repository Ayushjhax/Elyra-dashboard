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
}

/* ---------------------------------------------------------------------------
   Prediction markets
--------------------------------------------------------------------------- */

export interface PredictionOutcome {
  label: string;
  /** Implied probability, 0–1. This is a price, and it is not a forecast. */
  price: number;
}

export interface PredictionMarket {
  id: string;
  provider: ProviderId;
  question: string;
  slug: string | null;
  outcomes: PredictionOutcome[];
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  endsAt: string | null;
  closed: boolean;
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
