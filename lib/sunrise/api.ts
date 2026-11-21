/* ---------------------------------------------------------------------------
   Sunrise's API, as data. Pure — the requests are lib/providers/sunrise.ts.

   Sunrise (docs.sunrise.xyz) gives Solana one canonical mint per asset,
   among them the tokenized US stocks and ETFs issued through Backpack's
   tokenization service and Trek Nexus Markets' trust structure. Its API
   lists those tokens (`GET /v1/tokens`), quotes a swap across several
   routes — Jupiter, Titan, DFlow and its own request-for-quote route,
   `rfq-fill` — each with an unsigned transaction for the person's wallet
   (`POST /v1/quotes`), and submits what the person signed
   (`POST /v1/execute`). It does not mint or redeem: that primary market is
   Backpack Exchange's, behind its own account and eligibility checks.

   Everything Sunrise returns is model-free data from an outside service, so
   every field is parsed, not trusted: a token without a valid Solana mint,
   a quote whose amounts are not base-unit integers, an order with an
   unknown status, are dropped rather than passed on.

   Shapes and error codes are Sunrise's own OpenAPI document
   (api.sunrise.xyz/openapi) and errors page, read on 21 November 2026.
--------------------------------------------------------------------------- */

export const SUNRISE_API = "https://api.sunrise.xyz";

/** The issuer whose tokens are tokenized stocks and ETFs. */
export const EQUITY_ISSUER = "backpack_securities";

/** Sunrise names SOL "native"; Elyra's swap path names it by the wrapped mint. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const PRINTABLE = /^[!-~]{1,256}$/;
const RAW_AMOUNT = /^\d{1,40}$/;

export const isMint = (value: unknown): value is string => typeof value === "string" && BASE58.test(value);
export const isSignature = (value: unknown): value is string => typeof value === "string" && SIGNATURE.test(value);

/** Sunrise's token id for a mint: "native" for SOL. */
export const sunriseTokenId = (mint: string): string => (mint === WSOL_MINT ? "native" : mint);

export interface SunriseToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  assetClass: string;
  issuer: string | null;
  icon: string | null;
  tokenProgram: string | null;
}

export interface SunriseStock {
  ticker: string;
  currency: string;
  exchange: string | null;
}

export interface SunriseQuote {
  quoteId: string;
  routeName: string;
  providerRequestId: string | null;
  unsignedTransaction: string | null;
  fromAmount: string;
  toAmount: string;
  fromAmountUSD: number | null;
  toAmountUSD: number | null;
  slippageBps: number | null;
  estimatedDurationMs: number | null;
  expiresAt: string | null;
}

export interface UnavailableRoute {
  routeName: string | null;
  code: string;
  message: string;
  maxFromAmount: string | null;
}

export type OrderStatus = "PENDING" | "OPEN" | "FILLED" | "PARTIALLY_FILLED" | "CANCELLED" | "REFUNDED" | "FAILED";
const ORDER_STATUSES = new Set<OrderStatus>(["PENDING", "OPEN", "FILLED", "PARTIALLY_FILLED", "CANCELLED", "REFUNDED", "FAILED"]);

export interface SunriseOrder {
  orderId: string;
  status: OrderStatus;
  openTxHash: string | null;
  fillTxHash: string | null;
  cancelTxHash: string | null;
  refundTxHash: string | null;
  /** Of the bought token, base units. */
  deliveredAmountRaw: string | null;
  /** Of the sold token, handed back, base units. */
  returnedAmountRaw: string | null;
}

export interface SunriseExecution {
  txHash: string;
  status: "CONFIRMED" | "SUBMITTED";
  done: boolean;
  orders: SunriseOrder[];
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const text = (value: unknown, max = 200): string | null => (typeof value === "string" && value.length > 0 && value.length <= max ? value : null);
const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const dataOf = (body: unknown): Record<string, unknown> | null => {
  const envelope = record(body);
  return envelope?.success === true ? record(envelope.data) : null;
};

/** A symbol fit to show and to match: letters, digits and the separators tickers use. */
const SYMBOL = /^[A-Za-z0-9][A-Za-z0-9.$_-]{0,15}$/;

export function parseToken(raw: unknown): SunriseToken | null {
  const token = record(raw);
  if (token === null || token.chain !== "solana") return null;
  if (!isMint(token.address)) return null;
  const symbol = text(token.symbol, 16);
  const name = text(token.name, 120);
  const decimals = token.decimals;
  if (symbol === null || !SYMBOL.test(symbol) || name === null) return null;
  if (typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) return null;
  const icon = text(token.icon, 500);
  return {
    address: token.address,
    symbol,
    name,
    decimals,
    assetClass: text(token.assetClass, 40) ?? "unknown",
    issuer: text(token.issuer, 60),
    icon: icon !== null && icon.startsWith("https://") ? icon : null,
    tokenProgram: isMint(token.tokenProgram) ? token.tokenProgram : null,
  };
}

/** One page of `GET /v1/tokens`. */
export function parseTokenPage(body: unknown): { tokens: SunriseToken[]; nextCursor: string | null } | null {
  const data = dataOf(body);
  if (data === null || !Array.isArray(data.tokens)) return null;
  const pagination = record(data.pagination);
  const cursor = text(pagination?.nextCursor, 2048);
  return {
    tokens: data.tokens.map(parseToken).filter((token): token is SunriseToken => token !== null),
    nextCursor: cursor !== null && /^[A-Za-z0-9_-]+$/.test(cursor) ? cursor : null,
  };
}

/** The stock behind a token, from `GET /v1/tokens/{address}`; null for a token that is not one. */
export function parseStock(body: unknown): SunriseStock | null {
  const stock = record(record(dataOf(body)?.token)?.stock);
  if (stock === null) return null;
  const ticker = text(stock.ticker, 12);
  if (ticker === null || !/^[A-Z0-9.]{1,12}$/.test(ticker)) return null;
  return { ticker, currency: text(stock.currency, 8) ?? "USD", exchange: text(record(stock.exchange)?.name, 80) };
}

function parseQuote(raw: unknown): SunriseQuote | null {
  const quote = record(raw);
  if (quote === null) return null;
  const quoteId = text(quote.quoteId, 256);
  const routeName = text(quote.routeName, 256);
  if (quoteId === null || routeName === null || !PRINTABLE.test(quoteId) || !PRINTABLE.test(routeName)) return null;
  if (typeof quote.fromAmount !== "string" || !RAW_AMOUNT.test(quote.fromAmount)) return null;
  if (typeof quote.toAmount !== "string" || !RAW_AMOUNT.test(quote.toAmount)) return null;
  const provider = text(quote.providerRequestId, 256);
  const unsigned = text(quote.unsignedTransaction, 8_192);
  return {
    quoteId,
    routeName,
    providerRequestId: provider !== null && PRINTABLE.test(provider) ? provider : null,
    unsignedTransaction: unsigned !== null && /^[A-Za-z0-9+/]+=*$/.test(unsigned) ? unsigned : null,
    fromAmount: quote.fromAmount,
    toAmount: quote.toAmount,
    fromAmountUSD: finite(quote.fromAmountUSD),
    toAmountUSD: finite(quote.toAmountUSD),
    slippageBps: finite(quote.slippageBps),
    estimatedDurationMs: finite(quote.estimatedDurationMs),
    expiresAt: text(quote.expiresAt, 40),
  };
}

export function parseQuotes(body: unknown): { quotes: SunriseQuote[]; unavailable: UnavailableRoute[] } | null {
  const data = dataOf(body);
  if (data === null || !Array.isArray(data.quotes)) return null;
  const unavailable = (Array.isArray(data.unavailableRoutes) ? data.unavailableRoutes : [])
    .map((raw) => {
      const route = record(raw);
      const code = text(route?.code, 80);
      const message = text(route?.message, 500);
      if (route === null || code === null || message === null) return null;
      const max = record(route.details)?.maxFromAmount;
      return { routeName: text(route.routeName, 256), code, message, maxFromAmount: typeof max === "string" && RAW_AMOUNT.test(max) ? max : null };
    })
    .filter((route): route is UnavailableRoute => route !== null);
  return { quotes: data.quotes.map(parseQuote).filter((quote): quote is SunriseQuote => quote !== null), unavailable };
}

function parseOrder(raw: unknown): SunriseOrder | null {
  const order = record(raw);
  const orderId = text(order?.orderId, 256);
  const status = order?.status;
  if (order === null || orderId === null || typeof status !== "string" || !ORDER_STATUSES.has(status as OrderStatus)) return null;
  const details = record(order.details) ?? {};
  const hash = (key: string) => (isSignature(details[key]) ? (details[key] as string) : null);
  const amount = (key: string) => (typeof details[key] === "string" && RAW_AMOUNT.test(details[key] as string) ? (details[key] as string) : null);
  return {
    orderId,
    status: status as OrderStatus,
    openTxHash: hash("openTxHash"),
    fillTxHash: hash("fillTxHash"),
    cancelTxHash: hash("cancelTxHash"),
    refundTxHash: hash("refundTxHash"),
    deliveredAmountRaw: amount("deliveredAmountRaw"),
    returnedAmountRaw: amount("returnedAmountRaw"),
  };
}

export function parseOrders(body: unknown): SunriseOrder[] | null {
  const data = dataOf(body);
  if (data === null || !Array.isArray(data.orders)) return null;
  return data.orders.map(parseOrder).filter((order): order is SunriseOrder => order !== null);
}

export function parseExecution(body: unknown): SunriseExecution | null {
  const data = dataOf(body);
  if (data === null || !isSignature(data.txHash)) return null;
  if (data.status !== "CONFIRMED" && data.status !== "SUBMITTED") return null;
  return {
    txHash: data.txHash,
    status: data.status,
    done: data.done === true,
    orders: (Array.isArray(data.orders) ? data.orders : []).map(parseOrder).filter((order): order is SunriseOrder => order !== null),
  };
}

/* ---------------------------------------------------------------------------
   Choosing a quote
--------------------------------------------------------------------------- */

/**
 * The quote to offer: of those Sunrise returned a transaction for, the one
 * that delivers the most, then the quickest. Amounts compared as integers.
 */
export function bestQuote(quotes: readonly SunriseQuote[]): SunriseQuote | null {
  let best: SunriseQuote | null = null;
  for (const quote of quotes) {
    if (quote.unsignedTransaction === null) continue;
    if (best === null) {
      best = quote;
      continue;
    }
    const more = BigInt(quote.toAmount) - BigInt(best.toAmount);
    if (more > BigInt(0) || (more === BigInt(0) && (quote.estimatedDurationMs ?? Infinity) < (best.estimatedDurationMs ?? Infinity))) best = quote;
  }
  return best;
}

/** Whether a route places an order a solver fills later, rather than swapping in the transaction. */
export const isOrderRoute = (routeName: string): boolean => routeName === "rfq-fill";

const ROUTE_NAMES: Record<string, string> = {
  "rfq-fill": "Sunrise RFQ",
  jupiter: "Jupiter",
  "jupiter-ultra": "Jupiter",
  titan: "Titan",
  dflow: "DFlow",
};

export const routeLabel = (routeName: string): string => ROUTE_NAMES[routeName] ?? routeName;

/* ---------------------------------------------------------------------------
   The quote reference
--------------------------------------------------------------------------- */

const PREFIX = "sunrise:";

export interface SunriseRef {
  quoteId: string;
  routeName: string;
  providerRequestId: string | null;
}

/**
 * What /v1/execute needs back, carried by the swap dialog from build to
 * submit as `quoteRef`. Sunrise refuses a signed transaction that does not
 * match its quote, so a ref edited in between cannot execute something else.
 */
export function encodeRef(quote: Pick<SunriseQuote, "quoteId" | "routeName" | "providerRequestId">): string {
  const json = JSON.stringify({ q: quote.quoteId, r: quote.routeName, p: quote.providerRequestId });
  return PREFIX + Buffer.from(json, "utf8").toString("base64url");
}

export const isSunriseRef = (ref: string): boolean => ref.startsWith(PREFIX);

export function decodeRef(ref: string): SunriseRef | null {
  if (!isSunriseRef(ref) || ref.length > 1_200) return null;
  try {
    const value = record(JSON.parse(Buffer.from(ref.slice(PREFIX.length), "base64url").toString("utf8")));
    const quoteId = text(value?.q, 256);
    const routeName = text(value?.r, 256);
    const provider = value?.p === null ? null : text(value?.p, 256);
    if (quoteId === null || routeName === null || !PRINTABLE.test(quoteId) || !PRINTABLE.test(routeName)) return null;
    if (provider !== null && !PRINTABLE.test(provider)) return null;
    return { quoteId, routeName, providerRequestId: provider };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
   Errors
--------------------------------------------------------------------------- */

/**
 * What a Sunrise answer tells Elyra to do, per its errors page:
 * - `requote`: nothing was sent; quote again (409s, most 422s).
 * - `resend`: an execute whose outcome is unknown; send the SAME signed request again, never a new one.
 * - `refuse`: do not offer this trade (region, wallet, halted asset).
 * - `wait`: rate limited; after `retryAfterSec`.
 * - `fail`: anything else; say so.
 */
export type SunriseAction = "requote" | "resend" | "refuse" | "wait" | "fail";

export interface SunriseFailure {
  status: number;
  code: string;
  /** For the person, in plain words. */
  message: string;
  action: SunriseAction;
  retryAfterSec: number | null;
  requestId: string | null;
  txHash: string | null;
}

const MESSAGES: Record<string, [string, SunriseAction]> = {
  geo_blocked: ["This trade isn't available in your region.", "refuse"],
  address_blocked: ["This wallet can't be used for this trade.", "refuse"],
  trading_halted: ["Trading in this token is halted. It is not offered until trading resumes.", "refuse"],
  token_not_supported: ["Sunrise does not trade this token.", "refuse"],
  invalid_token: ["Sunrise does not recognise this token.", "refuse"],
  quote_expired: ["The quote expired before it was sent. Nothing was traded; quote again.", "requote"],
  price_moved: ["The price moved before it was sent. Nothing was traded; quote again.", "requote"],
  order_not_placed: ["The order was not placed. Nothing was traded; quote again.", "requote"],
  market_closed: ["The market for this stock is closed. Quote again when it opens.", "requote"],
  trading_paused: ["Trading is paused for now. Nothing was traded; quote again later.", "requote"],
  no_liquidity: ["There is no liquidity for this trade right now. Quote again in a moment.", "requote"],
  insufficient_sol: ["There is not enough SOL for the network fee. Add SOL, then quote again.", "requote"],
  insufficient_balance: ["There is not enough balance for this trade. Lower the amount, then quote again.", "requote"],
  simulation_failed: ["The trade failed when simulated, so nothing was sent. Quote again.", "requote"],
  transaction_expired: ["The transaction expired before it landed. Nothing was traded; quote again.", "requote"],
  transaction_failed: ["The transaction failed on-chain. Quote again.", "requote"],
  invalid_transaction: ["Sunrise could not accept the signed transaction. Quote again.", "requote"],
  execute_status_unknown: ["Sunrise could not yet say whether the trade went through.", "resend"],
  rate_limited: ["Sunrise is busy. Try again shortly.", "wait"],
  verification_rate_limited: ["Sunrise is busy. Try again shortly.", "wait"],
  unauthorized: ["Sunrise refused Elyra's API key.", "fail"],
  forbidden: ["Sunrise has not enabled this for Elyra's API key.", "fail"],
};

/** A Sunrise error response, as what to tell the person and what to do next. */
export function parseFailure(status: number, body: unknown, retryAfter: string | null): SunriseFailure {
  const envelope = record(body);
  const error = record(envelope?.error);
  const code = text(error?.code, 80) ?? (status === 429 ? "rate_limited" : status >= 500 ? "server_error" : "unknown");
  const known = MESSAGES[code];
  const seconds = retryAfter === null ? null : Number.parseInt(retryAfter, 10);
  const action: SunriseAction = known?.[1] ?? (status === 409 ? "requote" : status >= 500 ? "resend" : status === 429 ? "wait" : "fail");
  const details = record(error?.details);
  return {
    status,
    code,
    message: known?.[0] ?? text(error?.message, 300) ?? (status >= 500 ? "Sunrise did not answer properly. Try again in a moment." : "Sunrise refused the request."),
    action,
    retryAfterSec: seconds !== null && Number.isFinite(seconds) && seconds >= 0 ? seconds : null,
    requestId: text(envelope?.requestId, 120),
    txHash: isSignature(details?.txHash) ? (details?.txHash as string) : null,
  };
}

/** Why no route quoted, in the words most useful to the person. */
export function unavailableReason(unavailable: readonly UnavailableRoute[]): string {
  const first = (code: string) => unavailable.find((route) => route.code === code);
  const closed = first("market_closed");
  if (closed !== undefined) return MESSAGES.market_closed[0];
  const paused = first("trading_paused");
  if (paused !== undefined) return MESSAGES.trading_paused[0];
  const large = first("amount_too_large");
  if (large !== undefined) return "That amount is larger than any route will take right now. Lower it and quote again.";
  const small = first("amount_too_small");
  if (small !== undefined) return "That amount is below the smallest trade a route will take.";
  return unavailable[0]?.message ?? "No route could quote this trade right now.";
}
