import "server-only";

import { binancePublicProvider, binanceFunding } from "@/lib/providers/binance-public";
import { birdeyePrice, birdeyeProvider, BIRDEYE_PLAN_GATED } from "@/lib/providers/birdeye";
import { dflowProvider } from "@/lib/providers/dflow";
import { providerHealth } from "@/lib/providers/http";
import { hyperliquidMarket, hyperliquidPublicProvider } from "@/lib/providers/hyperliquid-public";
import { jupiterPrices, jupiterProvider } from "@/lib/providers/jupiter";
import { kaminoPositions, kaminoProvider } from "@/lib/providers/kamino";
import { polymarketProvider } from "@/lib/providers/polymarket";
import { raydiumProvider } from "@/lib/providers/raydium";
import {
  fail,
  ok,
  type DataCapability,
  type DefiPosition,
  type PerpMarket,
  type PriceQuote,
  type ProviderHealth,
  type ProviderId,
  type ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Which provider answers which question.

   Deterministic and in code. The model never picks a provider: a model that
   chooses between Jupiter and Birdeye for a price is a model that will
   occasionally choose the one that is down, and will do it differently on
   two identical questions.

   Order below is a policy, not a preference:

   - Solana price → Jupiter first. It is the routing venue, so its price is
     the one a swap would actually execute near, and it returns depth
     alongside it. Birdeye is the fallback.

   - Wallet balances → NOT Birdeye. The configured plan answers 401 there
     (verified live), so the router does not spend a round trip to be
     refused; the Solana RPC path that `composePortfolio` already uses is
     canonical and this layer stays out of its way.

   Fallback is logged with the reason, because a silent fallback is a price
   whose provenance nobody can reconstruct when two surfaces disagree.
--------------------------------------------------------------------------- */

const ADAPTERS = [
  jupiterProvider,
  birdeyeProvider,
  kaminoProvider,
  raydiumProvider,
  dflowProvider,
  hyperliquidPublicProvider,
  polymarketProvider,
  binancePublicProvider,
] as const;

/** Providers that can answer a capability, in policy order, health-filtered. */
export function providersFor(capability: DataCapability): ProviderId[] {
  return ADAPTERS.filter((adapter) => {
    if (!adapter.capabilities.includes(capability)) return false;
    if (!adapter.configured()) return false;
    /* A plan that cannot serve this capability is not a candidate, however
       healthy the provider is. */
    if (adapter.id === "birdeye" && BIRDEYE_PLAN_GATED.includes(capability)) return false;
    return true;
  }).map((adapter) => adapter.id);
}

export function providerHealthReport(): ProviderHealth[] {
  return ADAPTERS.map((adapter) => providerHealth(adapter.id));
}

/* ---------------------------------------------------------------------------
   Prices
--------------------------------------------------------------------------- */

interface RouteNote {
  provider: ProviderId;
  reason: string;
}

function logFallback(capability: DataCapability, note: RouteNote): void {
  console.log(
    JSON.stringify({
      event: "provider-fallback",
      capability,
      to: note.provider,
      reason: note.reason,
    }),
  );
}

/**
 * USD prices for Solana mints, from whichever provider can serve them.
 *
 * Jupiter answers in one batched call. Anything it could not price is
 * retried individually against Birdeye — per mint rather than in bulk,
 * because the failure is usually one obscure token rather than the batch.
 *
 * A mint neither can price is returned as a warning, never as zero.
 */
export async function routePrices(mints: string[]): Promise<ToolResult<PriceQuote[]>> {
  const unique = [...new Set(mints.filter((mint) => mint.trim().length > 0))];
  if (unique.length === 0) return ok<PriceQuote[]>([], "jupiter");

  const candidates = providersFor("solana_price");
  if (candidates.length === 0) {
    return fail<PriceQuote[]>(
      "jupiter",
      "AUTH",
      "No price provider is configured — set JUPITER_API_KEY or BIRDEYE_API_KEY.",
    );
  }

  const quotes = new Map<string, PriceQuote>();
  const warnings: string[] = [];
  const used = new Set<ProviderId>();

  if (candidates.includes("jupiter")) {
    const primary = await jupiterPrices(unique);
    if (primary.ok && primary.data !== undefined) {
      used.add("jupiter");
      for (const quote of primary.data) quotes.set(quote.id, quote);
    } else if (primary.error !== undefined) {
      warnings.push(`Jupiter: ${primary.error.message}`);
    }
  }

  const missing = unique.filter((mint) => !quotes.has(mint));

  if (missing.length > 0 && candidates.includes("birdeye")) {
    logFallback("solana_price", {
      provider: "birdeye",
      reason: `${missing.length} mint(s) unpriced by Jupiter`,
    });

    /* Bounded: a wallet full of unpriceable dust must not become dozens of
       sequential calls against a rate-limited plan. */
    const attempts = missing.slice(0, 10);
    const results = await Promise.all(attempts.map((mint) => birdeyePrice(mint)));

    results.forEach((result, index) => {
      if (result.ok && result.data !== undefined) {
        used.add("birdeye");
        quotes.set(attempts[index], result.data);
      }
    });

    if (missing.length > attempts.length) {
      warnings.push(
        `${missing.length - attempts.length} further mint(s) were not priced to stay within provider limits.`,
      );
    }
  }

  const stillMissing = unique.filter((mint) => !quotes.has(mint));
  if (stillMissing.length > 0) {
    warnings.push(
      `No price available for ${stillMissing.length} mint${stillMissing.length === 1 ? "" : "s"}.`,
    );
  }

  const data = [...quotes.values()];

  if (data.length === 0) {
    return fail<PriceQuote[]>(
      candidates,
      "UPSTREAM_UNAVAILABLE",
      warnings[0] ?? "No price provider returned a usable answer.",
    );
  }

  return ok(data, used.size === 1 ? [...used][0] : [...used], {
    partial: stillMissing.length > 0,
    warnings,
  });
}

/** One mint. A thin wrapper so callers do not build single-element arrays. */
export async function routePrice(mint: string): Promise<ToolResult<PriceQuote>> {
  const result = await routePrices([mint]);
  if (!result.ok || result.data === undefined || result.data.length === 0) {
    return fail<PriceQuote>(
      result.provider,
      result.error?.code ?? "NOT_FOUND",
      result.error?.message ?? `No price available for ${mint}.`,
    );
  }
  return ok(result.data[0], result.provider, {
    stale: result.stale,
    warnings: result.warnings,
  });
}

/* ---------------------------------------------------------------------------
   DeFi positions
--------------------------------------------------------------------------- */

/**
 * Every DeFi position a Solana wallet holds, across protocols.
 *
 * Kamino is the only protocol adapter with a verified schema today, so this
 * is a fan-out of one. It is written as a fan-out anyway because the shape of
 * the answer is what callers depend on: one protocol being unreadable must
 * degrade to `partial` with a named warning, not to a failed call — a user
 * with positions on two protocols should still see the one that answered.
 */
export async function routeDefiPositions(
  owner: string,
): Promise<ToolResult<DefiPosition[]>> {
  const candidates = providersFor("defi_positions");
  if (candidates.length === 0) {
    return ok<DefiPosition[]>([], [], {
      partial: true,
      warnings: ["No DeFi protocol adapter is enabled."],
    });
  }

  /* Declared as a table so adding a protocol is one entry, and so the fold
     below stays the same code whether one provider answers or five. */
  const sources: Array<{
    id: ProviderId;
    label: string;
    read: () => Promise<ToolResult<DefiPosition[]>>;
  }> = [{ id: "kamino", label: "Kamino", read: () => kaminoPositions(owner) }];

  const active = sources.filter((source) => candidates.includes(source.id));

  /* In parallel: one slow protocol must not decide how long the whole read
     takes, and they share no state. */
  const results = await Promise.all(active.map((source) => source.read()));

  const positions: DefiPosition[] = [];
  const warnings: string[] = [];
  const used: ProviderId[] = [];
  const timestamps: string[] = [];

  results.forEach((result, index) => {
    const source = active[index];
    if (result.ok && result.data !== undefined) {
      used.push(source.id);
      positions.push(...result.data);
      warnings.push(...(result.warnings ?? []));
      timestamps.push(result.asOf);
    } else if (result.error !== undefined) {
      warnings.push(`${source.label} positions could not be read: ${result.error.message}`);
    }
  });

  if (used.length === 0) {
    return fail<DefiPosition[]>(
      candidates,
      "UPSTREAM_UNAVAILABLE",
      warnings[0] ?? "No DeFi provider returned positions.",
    );
  }

  /* The freshness of a combined answer is its STALEST part. Reporting the
     newest would overstate how current the whole figure is. */
  const asOf = timestamps.reduce<string | null>(
    (oldest, stamp) => (oldest === null || stamp < oldest ? stamp : oldest),
    null,
  );

  return ok(positions, used.length === 1 ? used[0] : used, {
    asOf: asOf ?? new Date().toISOString(),
    partial: warnings.length > 0,
    warnings,
  });
}

/* ---------------------------------------------------------------------------
   Perpetual markets
--------------------------------------------------------------------------- */

/**
 * Funding and mark price for a perp, from whichever venue lists it.
 *
 * Hyperliquid first because it is the venue this product trades on, so its
 * funding is the rate a position here actually pays. Binance is the fallback
 * for symbols Hyperliquid does not list.
 *
 * The two venues have DIFFERENT funding intervals — hourly and eight-hourly —
 * which is why `PerpMarket` carries the interval instead of a single
 * annualised number. Comparing the raw rates across venues is meaningless.
 */
export async function routePerpMarket(symbol: string): Promise<ToolResult<PerpMarket>> {
  const candidates = providersFor("perp_positions");
  const warnings: string[] = [];

  if (candidates.includes("hyperliquid")) {
    const result = await hyperliquidMarket(symbol);
    if (result.ok && result.data !== undefined) return result;
    if (result.error !== undefined && result.error.code !== "NOT_FOUND") {
      warnings.push(`Hyperliquid: ${result.error.message}`);
    }
  }

  if (candidates.includes("binance")) {
    if (warnings.length > 0) {
      logFallback("perp_positions", { provider: "binance", reason: warnings[0] });
    }
    const result = await binanceFunding(symbol);
    if (result.ok && result.data !== undefined) {
      return ok(result.data, "binance", { warnings });
    }
    if (result.error !== undefined) warnings.push(`Binance: ${result.error.message}`);
  }

  return fail<PerpMarket>(
    candidates.length > 0 ? candidates : "hyperliquid",
    "NOT_FOUND",
    warnings[0] ?? `No venue lists a perpetual for ${symbol}.`,
  );
}
