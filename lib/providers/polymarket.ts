import "server-only";

import { cached, providerFetch } from "@/lib/providers/http";
import {
  fail,
  ok,
  type DataCapability,
  type PredictionMarket,
  type PredictionOutcome,
  type ProviderAdapter,
  type ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Polymarket — prediction market prices.

   Keyless, read-only, via the Gamma API. Verified live while writing this.

   ── The trap in this payload ───────────────────────────────────────────

   `outcomes` and `outcomePrices` arrive as JSON-ENCODED STRINGS, not arrays:

     "outcomes":      "[\"Yes\", \"No\"]"
     "outcomePrices": "[\"0.115\", \"0.885\"]"

   A caller that trusts the field names and iterates them gets the characters
   of a string. They are parsed defensively below — a market whose outcomes
   cannot be parsed is dropped rather than returned with a broken shape,
   because a half-parsed prediction market renders as a confident nonsense
   probability.

   ── What a price here is, and is not ───────────────────────────────────

   The price IS the market's implied probability; that is the instrument.
   It is not a forecast Elyra is making, and nothing above this layer may
   present it as one. Prices are clamped to 0–1 because a transiently
   crossed book can report otherwise, and a probability above 1 on a screen
   destroys trust in every other number next to it.

   Read-only by construction: this file has no order-placing path. Trading a
   prediction market needs a signed allowance on Polygon, which does not
   exist anywhere in this repo.
--------------------------------------------------------------------------- */

const GAMMA = "https://gamma-api.polymarket.com";

/** Odds move on trades, not continuously. Fifteen seconds is plenty. */
const MARKET_TTL_MS = 15_000;

export const polymarketProvider: ProviderAdapter = {
  id: "polymarket",
  capabilities: ["prediction_markets"] as const satisfies readonly DataCapability[],
  configured: () => process.env.ENABLE_POLYMARKET !== "false",
};

interface WireMarket {
  id?: string;
  question?: string;
  slug?: string | null;
  outcomes?: string | string[] | null;
  outcomePrices?: string | string[] | null;
  liquidity?: string | number | null;
  volume24hr?: string | number | null;
  endDate?: string | null;
  closed?: boolean;
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A field that is either an array or a JSON string holding one.
 *
 * Both forms are accepted rather than only the one observed today: the field
 * is documented as an array and delivered as a string, so either could change
 * without notice and neither should break the read.
 */
function stringList(value: string | string[] | null | undefined): string[] | null {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

function toMarket(wire: WireMarket): PredictionMarket | null {
  const labels = stringList(wire.outcomes);
  const prices = stringList(wire.outcomePrices);

  if (
    wire.id === undefined ||
    wire.question === undefined ||
    labels === null ||
    prices === null ||
    labels.length === 0 ||
    labels.length !== prices.length
  ) {
    /* Dropped, not patched. A market with three labels and two prices has no
       correct interpretation, and guessing the alignment would put a wrong
       probability next to a real question. */
    return null;
  }

  const outcomes: PredictionOutcome[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    const price = num(prices[index]);
    if (price === null) return null;
    outcomes.push({ label: labels[index], price: Math.min(1, Math.max(0, price)) });
  }

  return {
    id: wire.id,
    provider: "polymarket",
    question: wire.question,
    slug: wire.slug ?? null,
    outcomes,
    liquidityUsd: num(wire.liquidity),
    volume24hUsd: num(wire.volume24hr),
    endsAt: wire.endDate ?? null,
    closed: wire.closed === true,
  };
}

/** The most active open markets, busiest first. */
export async function polymarketTrending(limit = 10): Promise<ToolResult<PredictionMarket[]>> {
  const size = Math.min(Math.max(limit, 1), 50);
  const url =
    `${GAMMA}/markets?limit=${size}&closed=false&active=true` +
    `&order=volume24hr&ascending=false`;

  return cached(`polymarket:trending:${size}`, MARKET_TTL_MS, async () => {
    const response = await providerFetch<WireMarket[]>({
      provider: "polymarket",
      url,
      timeoutMs: 10_000,
    });

    if (!response.ok || response.data === undefined) {
      return fail<PredictionMarket[]>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket did not answer.",
      );
    }

    if (!Array.isArray(response.data)) {
      return fail<PredictionMarket[]>(
        "polymarket",
        "UPSTREAM_UNAVAILABLE",
        "Polymarket returned an unexpected shape.",
      );
    }

    const markets: PredictionMarket[] = [];
    let dropped = 0;
    for (const wire of response.data) {
      const market = toMarket(wire);
      if (market === null) dropped += 1;
      else markets.push(market);
    }

    return ok(markets, "polymarket", {
      partial: dropped > 0,
      warnings:
        dropped > 0
          ? [`${dropped} Polymarket market(s) were skipped — prices and outcomes did not line up.`]
          : [],
    });
  });
}

/** Open markets matching a search term. */
export async function polymarketSearch(
  query: string,
  limit = 5,
): Promise<ToolResult<PredictionMarket[]>> {
  const term = query.trim();
  if (term.length === 0) {
    return fail<PredictionMarket[]>("polymarket", "INVALID_REQUEST", "A search term is required.");
  }

  const size = Math.min(Math.max(limit, 1), 20);
  const url =
    `${GAMMA}/markets?limit=${size}&closed=false&active=true` +
    `&order=volume24hr&ascending=false&search=${encodeURIComponent(term)}`;

  return cached(`polymarket:search:${term.toLowerCase()}:${size}`, MARKET_TTL_MS, async () => {
    const response = await providerFetch<WireMarket[]>({
      provider: "polymarket",
      url,
      timeoutMs: 10_000,
    });

    if (!response.ok || !Array.isArray(response.data)) {
      return fail<PredictionMarket[]>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket did not answer.",
      );
    }

    const markets = response.data
      .map(toMarket)
      .filter((market): market is PredictionMarket => market !== null);

    return ok(markets, "polymarket");
  });
}
