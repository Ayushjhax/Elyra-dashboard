import "server-only";

import { cached, providerFetch } from "@/lib/providers/http";
import {
  fail,
  ok,
  type DataCapability,
  type PerpMarket,
  type ProviderAdapter,
  type ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Hyperliquid — PUBLIC perpetual market data.

   Separate from `lib/exchange/hyperliquid.ts`, which reads a user's account.
   Same host, different question, and no address is involved here.

   Verified live: POST /info with `{"type":"metaAndAssetCtxs"}` returns a
   two-element array — `[ { universe: [...] }, [ ctx, ... ] ] ` — where the
   two arrays are POSITIONAL. `universe[i]` describes the same asset as
   `ctx[i]`, and there is no shared key joining them. That is worth stating
   because a zip that silently truncates on a length mismatch would attach
   BTC's funding rate to the wrong market.

   Hyperliquid funding settles HOURLY, not every eight hours like Binance.
   Carried as `fundingIntervalHours: 1` so the annualisation is right.
--------------------------------------------------------------------------- */

const INFO = "https://api.hyperliquid.xyz/info";

const META_TTL_MS = 20_000;

/** Hyperliquid pays funding every hour. */
const FUNDING_INTERVAL_HOURS = 1;

export const hyperliquidPublicProvider: ProviderAdapter = {
  id: "hyperliquid",
  capabilities: ["perp_positions"] as const satisfies readonly DataCapability[],
  configured: () => process.env.ENABLE_HYPERLIQUID !== "false",
};

interface WireUniverse {
  name?: string;
  maxLeverage?: number;
  szDecimals?: number;
}

interface WireCtx {
  funding?: string;
  openInterest?: string;
  prevDayPx?: string;
  dayNtlVlm?: string;
  markPx?: string;
  oraclePx?: string;
  midPx?: string;
}

type WireMetaAndCtxs = [{ universe?: WireUniverse[] }, WireCtx[]];

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Every listed perpetual, with funding and open interest. */
export async function hyperliquidMarkets(): Promise<ToolResult<PerpMarket[]>> {
  return cached("hyperliquid:meta", META_TTL_MS, async () => {
    const response = await providerFetch<WireMetaAndCtxs>({
      provider: "hyperliquid",
      url: INFO,
      method: "POST",
      body: { type: "metaAndAssetCtxs" },
      timeoutMs: 10_000,
    });

    if (!response.ok || response.data === undefined) {
      return fail<PerpMarket[]>(
        "hyperliquid",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Hyperliquid did not answer.",
      );
    }

    const [meta, ctxs] = response.data;
    const universe = meta?.universe ?? [];

    if (!Array.isArray(universe) || !Array.isArray(ctxs)) {
      return fail<PerpMarket[]>(
        "hyperliquid",
        "UPSTREAM_UNAVAILABLE",
        "Hyperliquid returned an unexpected shape.",
      );
    }

    /* ---- The positional join ----

       If the two arrays disagree on length the correspondence is no longer
       established for the overlap either: nothing says the shorter one was
       truncated from the end. Every row is dropped and the failure is named,
       because attaching one market's funding rate to another is a wrong
       number that looks entirely plausible. */
    if (universe.length !== ctxs.length) {
      return fail<PerpMarket[]>(
        "hyperliquid",
        "UPSTREAM_UNAVAILABLE",
        "Hyperliquid returned mismatched market and context lists.",
      );
    }

    const markets: PerpMarket[] = [];
    for (let index = 0; index < universe.length; index += 1) {
      const name = universe[index]?.name;
      if (typeof name !== "string" || name.length === 0) continue;
      const ctx = ctxs[index] ?? {};

      markets.push({
        symbol: name,
        provider: "hyperliquid",
        markPrice: num(ctx.markPx),
        indexPrice: num(ctx.oraclePx),
        fundingRate: num(ctx.funding),
        fundingIntervalHours: FUNDING_INTERVAL_HOURS,
        /* Hyperliquid does not publish a next-funding timestamp here, and
           computing one from the hour boundary would be an assumption. */
        nextFundingAt: null,
        openInterest: num(ctx.openInterest),
        volume24hUsd: num(ctx.dayNtlVlm),
        maxLeverage: num(universe[index]?.maxLeverage),
      });
    }

    return ok(markets, "hyperliquid");
  });
}

/** One market by name, case-insensitively. */
export async function hyperliquidMarket(symbol: string): Promise<ToolResult<PerpMarket>> {
  const wanted = symbol.trim().toUpperCase().replace(/[-/]?(USD|USDT|USDC|PERP)$/i, "");
  if (wanted.length === 0) {
    return fail<PerpMarket>("hyperliquid", "INVALID_REQUEST", "A symbol is required.");
  }

  const all = await hyperliquidMarkets();
  if (!all.ok || all.data === undefined) {
    return fail<PerpMarket>(
      "hyperliquid",
      all.error?.code ?? "UPSTREAM_UNAVAILABLE",
      all.error?.message ?? "Hyperliquid did not answer.",
    );
  }

  const found = all.data.find((market) => market.symbol.toUpperCase() === wanted);
  if (found === undefined) {
    return fail<PerpMarket>("hyperliquid", "NOT_FOUND", `Hyperliquid does not list ${wanted}.`);
  }

  return ok(found, "hyperliquid", { asOf: all.asOf, stale: all.stale });
}
