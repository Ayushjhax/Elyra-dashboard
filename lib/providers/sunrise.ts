import "server-only";

import {
  EQUITY_ISSUER,
  SUNRISE_API,
  parseExecution,
  parseFailure,
  parseOrders,
  parseQuotes,
  parseStock,
  parseTokenPage,
  type SunriseExecution,
  type SunriseFailure,
  type SunriseOrder,
  type SunriseQuote,
  type SunriseStock,
  type SunriseToken,
  type UnavailableRoute,
} from "@/lib/sunrise/api";

/* ---------------------------------------------------------------------------
   Sunrise's API (lib/sunrise/api.ts says what it is).

   The key is `SUNRISE_API_KEY`, issued by Sunrise on request
   (contact@sunrise.xyz) — there is no self-serve signup. It is read on every
   call, sent only as a Bearer header, never logged and never sent to the
   browser. Without it every call answers `unconfigured`, and the surfaces
   say tokenized stocks through Sunrise are not set up.

   Retries follow Sunrise's own rules and nothing looser: a 4xx other than
   429 is never retried unchanged; a quote is never retried (a new quote is
   a new price, the caller's to ask for); and an execute whose outcome is
   unknown — a 5xx, `execute_status_unknown`, or no answer — is resent once
   with the SAME signed bytes, which Sunrise executes at most once.
--------------------------------------------------------------------------- */

const TIMEOUT_MS = 10_000;
const EXECUTE_TIMEOUT_MS = 30_000;
const MAX_PAGES = 20;
const TOKENS_TTL_MS = 30 * 60_000;
const STOCK_TTL_MS = 24 * 60 * 60_000;

export type Sunrise<T> = { ok: true; data: T } | { ok: false; failure: SunriseFailure };

export function sunriseConfigured(): boolean {
  return (process.env.SUNRISE_API_KEY ?? "").trim().length > 0;
}

const UNCONFIGURED: SunriseFailure = {
  status: 503,
  code: "unconfigured",
  message: "Tokenized stocks through Sunrise are not set up on this deployment.",
  action: "fail",
  retryAfterSec: null,
  requestId: null,
  txHash: null,
};

const unreachable = (action: SunriseFailure["action"]): SunriseFailure => ({
  status: 504,
  code: "unreachable",
  message: "Sunrise did not answer.",
  action,
  retryAfterSec: null,
  requestId: null,
  txHash: null,
});

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number },
  parse: (body: unknown) => T | null,
  onNoAnswer: SunriseFailure["action"] = "fail",
): Promise<Sunrise<T>> {
  const key = (process.env.SUNRISE_API_KEY ?? "").trim();
  if (key.length === 0) return { ok: false, failure: UNCONFIGURED };
  let response: Response;
  try {
    response = await fetch(`${SUNRISE_API}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${key}`,
        accept: "application/json",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, failure: unreachable(onNoAnswer) };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, failure: parseFailure(response.status, body, response.headers.get("retry-after")) };
  const parsed = parse(body);
  if (parsed === null) {
    return {
      ok: false,
      failure: { ...unreachable(onNoAnswer), status: 502, code: "unreadable", message: "Sunrise answered in a shape Elyra does not recognise." },
    };
  }
  return { ok: true, data: parsed };
}

/* ---------------------------------------------------------------------------
   Tokens
--------------------------------------------------------------------------- */

let tokensCache: { at: number; tokens: SunriseToken[] } | null = null;
let tokensInflight: Promise<Sunrise<SunriseToken[]>> | null = null;

/**
 * Every tokenized stock and ETF Sunrise lists — all pages — cached for half
 * an hour. A failed refresh serves the last good list rather than nothing,
 * and says so through `stale`.
 */
export async function sunriseEquities(): Promise<Sunrise<SunriseToken[]> & { stale?: boolean }> {
  if (tokensCache !== null && Date.now() - tokensCache.at < TOKENS_TTL_MS) return { ok: true, data: tokensCache.tokens };
  tokensInflight ??= (async () => {
    const all: SunriseToken[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query: URLSearchParams = new URLSearchParams({ issuer: EQUITY_ISSUER, ...(cursor === null ? {} : { cursor }) });
      const result: Sunrise<{ tokens: SunriseToken[]; nextCursor: string | null }> = await call(`/v1/tokens?${query.toString()}`, { method: "GET" }, parseTokenPage);
      if (!result.ok) return result;
      all.push(...result.data.tokens.filter((token) => token.issuer === EQUITY_ISSUER));
      cursor = result.data.nextCursor;
      if (cursor === null) break;
    }
    const unique = [...new Map(all.map((token) => [token.address, token])).values()];
    tokensCache = { at: Date.now(), tokens: unique };
    return { ok: true as const, data: unique };
  })().finally(() => {
    tokensInflight = null;
  });
  const result = await tokensInflight;
  if (!result.ok && tokensCache !== null) return { ok: true, data: tokensCache.tokens, stale: true };
  return result;
}

const stockCache = new Map<string, { at: number; stock: SunriseStock | null }>();

/** The stock behind a token — its ticker and listing — cached for a day. */
export async function sunriseStock(address: string): Promise<SunriseStock | null> {
  const cached = stockCache.get(address);
  if (cached !== undefined && Date.now() - cached.at < STOCK_TTL_MS) return cached.stock;
  const result = await call(`/v1/tokens/${encodeURIComponent(address)}`, { method: "GET" }, (body) => ({ stock: parseStock(body) }));
  if (!result.ok) return cached?.stock ?? null;
  stockCache.set(address, { at: Date.now(), stock: result.data.stock });
  return result.data.stock;
}

/* ---------------------------------------------------------------------------
   Quotes, execution, orders
--------------------------------------------------------------------------- */

export interface QuoteRequest {
  /** "native" for SOL, else a mint. */
  fromToken: string;
  toToken: string;
  /** Base units. */
  fromAmount: string;
  /** The person's wallet — both sides, so every route builds a transaction for it. */
  wallet: string;
}

/** Quotes across Sunrise's routes, each with an unsigned transaction for the wallet. Never retried. */
export async function sunriseQuotes(request: QuoteRequest): Promise<Sunrise<{ quotes: SunriseQuote[]; unavailable: UnavailableRoute[] }>> {
  return call(
    "/v1/quotes",
    {
      method: "POST",
      body: {
        fromToken: request.fromToken,
        toToken: request.toToken,
        fromAmount: request.fromAmount,
        fromAddress: request.wallet,
        toAddress: request.wallet,
      },
    },
    parseQuotes,
  );
}

export interface ExecuteRequest {
  signedTransaction: string;
  quoteId: string;
  routeName: string;
  providerRequestId: string | null;
}

/**
 * Submits what the person signed, unchanged. An outcome Sunrise cannot yet
 * report is asked again once with the same bytes — never a new signature.
 */
export async function sunriseExecute(request: ExecuteRequest): Promise<Sunrise<SunriseExecution>> {
  const body = {
    signedTransaction: request.signedTransaction,
    quoteId: request.quoteId,
    routeName: request.routeName,
    ...(request.providerRequestId === null ? {} : { providerRequestId: request.providerRequestId }),
  };
  const first = await call("/v1/execute", { method: "POST", body, timeoutMs: EXECUTE_TIMEOUT_MS }, parseExecution, "resend");
  if (first.ok || first.failure.action !== "resend") return first;
  return call("/v1/execute", { method: "POST", body, timeoutMs: EXECUTE_TIMEOUT_MS }, parseExecution, "resend");
}

/** The wallet's Sunrise orders, newest first: an RFQ order placed, filled, cancelled or refunded. */
export async function sunriseOrders(wallet: string): Promise<Sunrise<SunriseOrder[]>> {
  return call(`/v1/orders?${new URLSearchParams({ walletAddress: wallet }).toString()}`, { method: "GET" }, parseOrders);
}

/** For tests: forget cached lists. */
export function resetSunriseCache(): void {
  tokensCache = null;
  stockCache.clear();
}
