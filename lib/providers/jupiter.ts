import "server-only";

import { cached, providerFetch } from "@/lib/providers/http";
import {
  fail,
  ok,
  type DataCapability,
  type PriceQuote,
  type ProviderAdapter,
  type SwapQuote,
  type ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Jupiter — Solana pricing and swap routing.

   ── What changed, and why it mattered ──────────────────────────────────

   `lib/solana/tokens.ts` calls `lite-api.jup.ag`, the keyless public tier,
   while `JUPITER_API_KEY` sat configured and unused. That is not a style
   point: the free tier is rate-limited hard enough that a portfolio read
   fanning out across a wallet's mints will start dropping prices under any
   real load, and a dropped price becomes an uncounted holding.

   This adapter uses the authenticated gateway:

     https://api.jup.ag  with  x-api-key

   Verified against the live API while writing this: `price/v3` returns
   `usdPrice`, `priceChange24h`, `decimals` and `liquidity` — strictly more
   than the lite tier, and the 24h change is the figure the portfolio layer
   currently has to source separately.

   The key is read from the environment on every call and never logged,
   never sent to a model, and never placed in a URL — it goes in a header, so
   it cannot end up in an upstream's request log or an error page echo.

   `lib/solana/tokens.ts` is deliberately NOT modified here. It is the token
   metadata path the wallet read depends on, it works, and swapping it under
   a live portfolio surface is a separate change with its own testing.
--------------------------------------------------------------------------- */

const GATEWAY = "https://api.jup.ag";

/** Prices move constantly; this is the shortest TTL that still saves calls. */
const PRICE_TTL_MS = 10_000;

function apiKey(): string | undefined {
  const raw = process.env.JUPITER_API_KEY?.trim();
  return raw !== undefined && raw.length > 0 ? raw : undefined;
}

function headers(): Record<string, string> {
  const key = apiKey();
  /* Without a key the gateway still answers some routes at a lower limit, so
     the header is omitted rather than the call refused. */
  return key === undefined ? {} : { "x-api-key": key };
}

export const jupiterProvider: ProviderAdapter = {
  id: "jupiter",
  capabilities: ["solana_price", "swap_quote"] as const satisfies readonly DataCapability[],
  configured: () => apiKey() !== undefined,
};

/* ---------------------------------------------------------------------------
   Prices
--------------------------------------------------------------------------- */

interface PriceV3Entry {
  usdPrice: number;
  decimals?: number;
  priceChange24h?: number;
  liquidity?: number;
  blockId?: number;
}

/**
 * USD prices for Solana mints.
 *
 * Batched: the endpoint takes a comma-separated list, so one call covers a
 * whole wallet. A mint the endpoint does not know is simply absent from the
 * response — it is reported as a warning rather than defaulted to zero,
 * because a token with an unknown price and a token worth nothing are
 * different facts and only one of them belongs in a total.
 */
export async function jupiterPrices(mints: string[]): Promise<ToolResult<PriceQuote[]>> {
  const unique = [...new Set(mints.map((mint) => mint.trim()).filter((mint) => mint.length > 0))];
  if (unique.length === 0) return ok<PriceQuote[]>([], "jupiter");

  /* Chunked so a large wallet cannot build a URL the gateway rejects. */
  const CHUNK = 50;
  const groups: string[][] = [];
  for (let index = 0; index < unique.length; index += CHUNK) {
    groups.push(unique.slice(index, index + CHUNK));
  }

  const quotes: PriceQuote[] = [];
  const warnings: string[] = [];
  let anyFailed = false;

  for (const group of groups) {
    const key = `jup:price:${group.join(",")}`;
    const result = await cached<Record<string, PriceV3Entry>>(key, PRICE_TTL_MS, () =>
      providerFetch<Record<string, PriceV3Entry>>({
        provider: "jupiter",
        url: `${GATEWAY}/price/v3?ids=${group.join(",")}`,
        headers: headers(),
        timeoutMs: 5_000,
      }),
    );

    if (!result.ok || result.data === undefined) {
      anyFailed = true;
      warnings.push(result.error?.message ?? "A price batch could not be read.");
      continue;
    }

    for (const [mint, entry] of Object.entries(result.data)) {
      if (typeof entry?.usdPrice !== "number" || !Number.isFinite(entry.usdPrice)) continue;
      quotes.push({
        id: mint,
        usdPrice: entry.usdPrice,
        change24hPct: typeof entry.priceChange24h === "number" ? entry.priceChange24h : undefined,
        decimals: typeof entry.decimals === "number" ? entry.decimals : undefined,
        liquidityUsd: typeof entry.liquidity === "number" ? entry.liquidity : undefined,
      });
    }
  }

  const missing = unique.filter((mint) => !quotes.some((quote) => quote.id === mint));
  if (missing.length > 0) {
    warnings.push(
      `No price returned for ${missing.length} mint${missing.length === 1 ? "" : "s"}.`,
    );
  }

  if (quotes.length === 0 && anyFailed) {
    return fail<PriceQuote[]>("jupiter", "UPSTREAM_UNAVAILABLE", warnings[0] ?? "No prices.");
  }

  return ok(quotes, "jupiter", { partial: warnings.length > 0, warnings });
}

/* ---------------------------------------------------------------------------
   Swap quotes

   Swap API V2: GET /swap/v2/order builds the order, POST /swap/v2/execute
   submits a signed one. Only the first half is implemented here.

   The second half is deliberately absent. Executing requires a signed
   transaction, and this repository has no signing path — `sendTransaction`,
   `signTransaction` and `signAndSendTransaction` appear nowhere in it. An
   `execute` helper with nothing able to produce its input would be a loaded
   gun with no safety: the point of the preview/confirm boundary is that the
   only code able to submit lives behind an explicit user confirmation, and
   that code does not exist yet.

   Notably `order` REQUIRES a real taker with a real balance — verified live:
   a taker holding nothing returns 400 "Winning quote has no transaction".
   So a quote is inherently account-specific and cannot be fetched
   speculatively for a wallet that cannot afford the trade. That is a feature:
   it means a quote shown to a user was executable at the moment it was read.
--------------------------------------------------------------------------- */

interface OrderResponse {
  inputMint?: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
  otherAmountThreshold?: string;
  priceImpactPct?: string | number;
  slippageBps?: number;
  requestId?: string;
  routePlan?: Array<{ swapInfo?: { label?: string } }>;
}

export interface SwapQuoteRequest {
  inputMint: string;
  outputMint: string;
  /** Base units of the input mint, as a string. */
  amount: string;
  /** The wallet that would sign. Required — see the note above. */
  taker: string;
  slippageBps?: number;
}

/**
 * A live, executable swap quote.
 *
 * Not cached. A cached quote is a stale quote, and a stale quote shown as
 * executable is how someone confirms a trade at a price that no longer
 * exists. Every call is fresh, and `expiresAt` tells the confirmation step
 * when to re-fetch.
 */
export async function jupiterSwapQuote(
  request: SwapQuoteRequest,
): Promise<ToolResult<SwapQuote>> {
  if (apiKey() === undefined) {
    return fail<SwapQuote>(
      "jupiter",
      "AUTH",
      "JUPITER_API_KEY is not configured, so swap quotes are unavailable.",
    );
  }

  const amount = request.amount.trim();
  if (!/^\d+$/.test(amount) || amount === "0") {
    return fail<SwapQuote>(
      "jupiter",
      "INVALID_REQUEST",
      "The swap amount must be a positive integer in the input mint's base units.",
    );
  }

  const params = new URLSearchParams({
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount,
    taker: request.taker,
  });
  if (request.slippageBps !== undefined) {
    params.set("slippageBps", String(request.slippageBps));
  }

  const result = await providerFetch<OrderResponse>({
    provider: "jupiter",
    url: `${GATEWAY}/swap/v2/order?${params.toString()}`,
    headers: headers(),
    timeoutMs: 8_000,
    /* Not retried: each attempt is a fresh quote at a different price, so a
       "retry" is really a second unrelated question. */
    attempts: 1,
  });

  if (!result.ok || result.data === undefined) {
    return fail<SwapQuote>(
      "jupiter",
      result.error?.code ?? "UPSTREAM_UNAVAILABLE",
      result.error?.message ?? "No quote was returned.",
    );
  }

  const order = result.data;
  if (typeof order.outAmount !== "string" || order.outAmount.length === 0) {
    return fail<SwapQuote>(
      "jupiter",
      "NOT_FOUND",
      "No route was found for that pair and size.",
    );
  }

  const impact =
    typeof order.priceImpactPct === "string"
      ? Number(order.priceImpactPct)
      : order.priceImpactPct;

  return ok<SwapQuote>(
    {
      inputMint: order.inputMint ?? request.inputMint,
      outputMint: order.outputMint ?? request.outputMint,
      inAmount: order.inAmount ?? amount,
      outAmount: order.outAmount,
      minOutAmount: order.otherAmountThreshold,
      priceImpactPct: Number.isFinite(impact) ? (impact as number) * 100 : undefined,
      slippageBps: order.slippageBps,
      routeLabels: (order.routePlan ?? [])
        .map((leg) => leg.swapInfo?.label)
        .filter((label): label is string => typeof label === "string"),
      quoteRef: order.requestId,
      /* Jupiter does not publish an expiry on the order, so this is Elyra's
         own freshness policy rather than a claim about theirs: past this the
         confirmation step re-quotes and compares before it will execute. */
      expiresAt: new Date(Date.now() + 20_000).toISOString(),
    },
    "jupiter",
  );
}
