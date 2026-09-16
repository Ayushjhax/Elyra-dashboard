import "server-only";

import { cached, providerFetch } from "@/lib/providers/http";
import {
  fail,
  ok,
  type DataCapability,
  type PoolInfo,
  type ProviderAdapter,
  type ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Raydium — pool liquidity and realised yield on Solana.

   Keyless. Verified live against api-v3 while writing this: `/main/version`
   answers `V3.0.1`, and `/pools/info/mint` returns `tvl`, `feeRate` and a
   `day`/`week`/`month` block carrying `volume`, `apr`, `feeApr` and
   `rewardApr[]`.

   ── The distinction this adapter refuses to collapse ───────────────────

   `apr` includes reward emissions; `feeApr` does not. A pool paying 12% in
   fees and 60% in its own token is not a 72% pool in any sense an allocator
   cares about — the emissions are sold into the same liquidity they are
   paying for. Both are carried separately and the fee figure is the one a
   caller gets by default.

   APR is also not APY. Raydium reports APR and this adapter passes it
   through under that name, uncompounded. Converting it would be inventing a
   compounding frequency nobody stated.
--------------------------------------------------------------------------- */

const BASE = "https://api-v3.raydium.io";

/** Pool statistics are recomputed on a slow cadence; a minute is generous. */
const POOL_TTL_MS = 60_000;

export const raydiumProvider: ProviderAdapter = {
  id: "raydium",
  capabilities: ["defi_positions"] as const satisfies readonly DataCapability[],
  configured: () => process.env.ENABLE_RAYDIUM !== "false",
};

interface WireMint {
  address: string;
  symbol?: string | null;
  decimals?: number;
}

interface WirePeriod {
  volume?: number;
  apr?: number;
  feeApr?: number;
  rewardApr?: number[];
}

interface WirePool {
  id: string;
  type?: string;
  mintA?: WireMint;
  mintB?: WireMint;
  tvl?: number;
  feeRate?: number;
  day?: WirePeriod;
}

interface WireResponse {
  success?: boolean;
  data?: { count?: number; data?: WirePool[] };
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toPool(wire: WirePool): PoolInfo {
  const symbolA = wire.mintA?.symbol ?? null;
  const symbolB = wire.mintB?.symbol ?? null;
  const feeApr = finite(wire.day?.feeApr);
  const totalApr = finite(wire.day?.apr);

  return {
    id: wire.id,
    provider: "raydium",
    pair: `${symbolA ?? "?"}-${symbolB ?? "?"}`,
    mintA: wire.mintA?.address ?? "",
    mintB: wire.mintB?.address ?? "",
    symbolA,
    symbolB,
    tvlUsd: finite(wire.tvl),
    volume24hUsd: finite(wire.day?.volume),
    feeApr24h: feeApr,
    totalApr24h: totalApr,
    feeRate: finite(wire.feeRate),
    poolType: wire.type ?? null,
  };
}

/**
 * The deepest pools trading a pair, deepest first.
 *
 * Sorted by liquidity rather than by APR on purpose. The highest-APR pool for
 * a pair is routinely a near-empty one whose APR is an artefact of a tiny
 * denominator, and surfacing it first would be a recommendation dressed as a
 * sort order.
 */
export async function raydiumPools(
  mintA: string,
  mintB: string,
  limit = 5,
): Promise<ToolResult<PoolInfo[]>> {
  if (mintA.trim().length === 0 || mintB.trim().length === 0) {
    return fail<PoolInfo[]>("raydium", "INVALID_REQUEST", "Two mints are required.");
  }

  const size = Math.min(Math.max(limit, 1), 20);
  const url =
    `${BASE}/pools/info/mint?mint1=${encodeURIComponent(mintA.trim())}` +
    `&mint2=${encodeURIComponent(mintB.trim())}&poolType=all` +
    `&poolSortField=liquidity&sortType=desc&pageSize=${size}&page=1`;

  return cached(`raydium:pools:${mintA}:${mintB}:${size}`, POOL_TTL_MS, async () => {
    const response = await providerFetch<WireResponse>({
      provider: "raydium",
      url,
      timeoutMs: 10_000,
    });

    if (!response.ok || response.data === undefined) {
      return fail<PoolInfo[]>(
        "raydium",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Raydium did not answer.",
      );
    }

    /* Raydium answers 200 with `success: false` for a rejected query, so the
       HTTP status alone does not establish that this worked. */
    if (response.data.success === false) {
      return fail<PoolInfo[]>(
        "raydium",
        "INVALID_REQUEST",
        "Raydium rejected the pool query.",
      );
    }

    const pools = (response.data.data?.data ?? []).filter(
      (pool): pool is WirePool => pool !== null && typeof pool?.id === "string",
    );

    return ok(pools.map(toPool), "raydium");
  });
}
