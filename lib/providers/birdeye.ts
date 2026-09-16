import "server-only";

import { cached, providerFetch } from "@/lib/providers/http";
import {
  fail,
  ok,
  type DataCapability,
  type HistoricalPricePoint,
  type PriceQuote,
  type ProviderAdapter,
  type ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Birdeye — Solana token and price analytics.

   ── What this key can actually do ──────────────────────────────────────

   Probed against the live API while writing this adapter, with the key that
   is configured in this repository:

     defi/price          200   current price + 24h change
     defi/history_price  200   historical price series
     v1/wallet/token_list 401  "API key lacks sufficient permissions"

   So the WALLET endpoints — balances, net worth, historical net worth — are
   NOT available on this plan. design.md asks for them "where plan permits",
   and they are not permitted here.

   That is reported rather than worked around. `birdeyeWalletPortfolio` below
   exists and returns a structured AUTH failure naming the plan as the cause,
   so the router can fall back to the Solana RPC path the wallet read already
   uses, and the UI can say why rather than showing an empty wallet. Silently
   returning `[]` would render a funded wallet as empty, which is the single
   worst failure this layer can produce.

   The key travels in a header and is never logged or put in a URL.
--------------------------------------------------------------------------- */

const BASE = "https://public-api.birdeye.so";

const PRICE_TTL_MS = 15_000;
/** History does not change once written; only the trailing edge moves. */
const HISTORY_TTL_MS = 5 * 60_000;

function apiKey(): string | undefined {
  const raw = process.env.BIRDEYE_API_KEY?.trim();
  return raw !== undefined && raw.length > 0 ? raw : undefined;
}

function headers(): Record<string, string> {
  const key = apiKey();
  return {
    "x-chain": "solana",
    ...(key === undefined ? {} : { "X-API-KEY": key }),
  };
}

export const birdeyeProvider: ProviderAdapter = {
  id: "birdeye",
  capabilities: [
    "solana_price",
    "historical_price",
  ] as const satisfies readonly DataCapability[],
  configured: () => apiKey() !== undefined,
};

/**
 * Capabilities this key's plan does not include.
 *
 * Kept as data rather than as a comment so the router can consult it and
 * skip a provider that would only answer 401 — spending a round trip to be
 * told something already known is exactly what the breaker exists to avoid.
 */
export const BIRDEYE_PLAN_GATED: readonly DataCapability[] = [
  "wallet_balances",
  "wallet_net_worth",
  "historical_wallet_value",
] as const;

/* ---------------------------------------------------------------------------
   Prices
--------------------------------------------------------------------------- */

interface PriceResponse {
  success?: boolean;
  data?: {
    value?: number;
    priceChange24h?: number;
    updateUnixTime?: number;
  };
}

export async function birdeyePrice(mint: string): Promise<ToolResult<PriceQuote>> {
  if (apiKey() === undefined) {
    return fail<PriceQuote>("birdeye", "AUTH", "BIRDEYE_API_KEY is not configured.");
  }

  const result = await cached<PriceResponse>(`birdeye:price:${mint}`, PRICE_TTL_MS, () =>
    providerFetch<PriceResponse>({
      provider: "birdeye",
      url: `${BASE}/defi/price?address=${encodeURIComponent(mint)}`,
      headers: headers(),
      timeoutMs: 5_000,
    }),
  );

  if (!result.ok || result.data === undefined) {
    return fail<PriceQuote>(
      "birdeye",
      result.error?.code ?? "UPSTREAM_UNAVAILABLE",
      result.error?.message ?? "No price was returned.",
    );
  }

  const value = result.data.data?.value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail<PriceQuote>("birdeye", "NOT_FOUND", `Birdeye has no price for ${mint}.`);
  }

  const updated = result.data.data?.updateUnixTime;

  return ok<PriceQuote>(
    {
      id: mint,
      usdPrice: value,
      change24hPct:
        typeof result.data.data?.priceChange24h === "number"
          ? result.data.data.priceChange24h
          : undefined,
    },
    "birdeye",
    {
      /* The provider's own timestamp, not ours. A price read from a cache
         five minutes stale must not be stamped "now". */
      asOf:
        typeof updated === "number"
          ? new Date(updated * 1_000).toISOString()
          : new Date().toISOString(),
      stale: result.stale,
      warnings: result.warnings,
    },
  );
}

/* ---------------------------------------------------------------------------
   Historical price

   This is what makes "what was my portfolio worth yesterday" answerable for
   a holding, without the wallet endpoints the plan does not include: today's
   quantity valued at a past price. That is a reconstruction, not history —
   it ignores trades — and the caller is responsible for labelling it as such.
   The Portfolio page already draws exactly that distinction.
--------------------------------------------------------------------------- */

interface HistoryResponse {
  success?: boolean;
  data?: { items?: Array<{ unixTime?: number; value?: number }> };
}

export type HistoryInterval = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

export async function birdeyeHistoricalPrice(input: {
  mint: string;
  interval: HistoryInterval;
  fromMs: number;
  toMs: number;
}): Promise<ToolResult<HistoricalPricePoint[]>> {
  if (apiKey() === undefined) {
    return fail<HistoricalPricePoint[]>("birdeye", "AUTH", "BIRDEYE_API_KEY is not configured.");
  }

  const params = new URLSearchParams({
    address: input.mint,
    address_type: "token",
    type: input.interval,
    time_from: String(Math.floor(input.fromMs / 1_000)),
    time_to: String(Math.floor(input.toMs / 1_000)),
  });

  const key = `birdeye:history:${params.toString()}`;
  const result = await cached<HistoryResponse>(key, HISTORY_TTL_MS, () =>
    providerFetch<HistoryResponse>({
      provider: "birdeye",
      url: `${BASE}/defi/history_price?${params.toString()}`,
      headers: headers(),
      timeoutMs: 10_000,
    }),
  );

  if (!result.ok || result.data === undefined) {
    return fail<HistoricalPricePoint[]>(
      "birdeye",
      result.error?.code ?? "UPSTREAM_UNAVAILABLE",
      result.error?.message ?? "No price history was returned.",
    );
  }

  const points = (result.data.data?.items ?? [])
    .filter(
      (item): item is { unixTime: number; value: number } =>
        typeof item?.unixTime === "number" && typeof item?.value === "number",
    )
    .map((item) => ({
      at: new Date(item.unixTime * 1_000).toISOString(),
      usdPrice: item.value,
    }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  if (points.length === 0) {
    return fail<HistoricalPricePoint[]>(
      "birdeye",
      "NOT_FOUND",
      `Birdeye returned no price history for ${input.mint} over that window.`,
    );
  }

  return ok(points, "birdeye", { stale: result.stale, warnings: result.warnings });
}

/* ---------------------------------------------------------------------------
   Wallet — plan-gated
--------------------------------------------------------------------------- */

export interface WalletTokenBalance {
  mint: string;
  symbol?: string;
  uiAmount: number;
  valueUsd?: number;
}

/**
 * Wallet balances from Birdeye.
 *
 * Present so the capability has one honest home, and so the router has
 * something to call and be refused by rather than a silent gap. On the key
 * configured here this always fails with AUTH: the plan does not include
 * `/v1/wallet/*`, verified live.
 *
 * It is NOT a stub returning an empty array. An empty array from a wallet
 * endpoint is indistinguishable from an empty wallet, and a portfolio built
 * on that would tell a funded user they hold nothing.
 */
export async function birdeyeWalletPortfolio(
  wallet: string,
): Promise<ToolResult<WalletTokenBalance[]>> {
  if (apiKey() === undefined) {
    return fail<WalletTokenBalance[]>("birdeye", "AUTH", "BIRDEYE_API_KEY is not configured.");
  }

  const result = await providerFetch<{
    success?: boolean;
    data?: { items?: Array<Record<string, unknown>> };
  }>({
    provider: "birdeye",
    url: `${BASE}/v1/wallet/token_list?wallet=${encodeURIComponent(wallet)}`,
    headers: headers(),
    timeoutMs: 10_000,
    attempts: 1,
  });

  if (!result.ok) {
    /* Named precisely: "the plan does not include this" is actionable, and
       "Birdeye failed" is not. The wallet read falls back to the Solana RPC
       path, which is what `composePortfolio` already uses. */
    return fail<WalletTokenBalance[]>(
      "birdeye",
      result.error?.code ?? "UNSUPPORTED",
      result.error?.code === "AUTH"
        ? "Birdeye wallet endpoints are not included in this API plan; wallet balances are read from the Solana RPC instead."
        : (result.error?.message ?? "Birdeye wallet data is unavailable."),
    );
  }

  const items = result.data?.data?.items ?? [];
  const balances: WalletTokenBalance[] = [];

  for (const item of items) {
    const mint = typeof item.address === "string" ? item.address : null;
    const uiAmount = typeof item.uiAmount === "number" ? item.uiAmount : null;
    if (mint === null || uiAmount === null) continue;
    balances.push({
      mint,
      symbol: typeof item.symbol === "string" ? item.symbol : undefined,
      uiAmount,
      valueUsd: typeof item.valueUsd === "number" ? item.valueUsd : undefined,
    });
  }

  return ok(balances, "birdeye");
}
