import "server-only";

import { cached, providerFetch } from "@/lib/providers/http";
import { fail, ok, type ToolResult } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Yield discovery — Kamino vaults.

   Verified against Kamino's published OpenAPI document and live calls.
   `/kvaults/vaults` carries metadata, `/kvaults/vaults/metrics` carries rates;
   they are joined on the vault address, which the two endpoints name
   differently (`address` and `kvault`).

   ── Two units traps, both verified live ────────────────────────────────

   APY IS A FRACTION. `"apy": "0.03555228892594098"` means 3.56%, not 3.56
   percent and certainly not 3.56% of a percent. Rendering it raw produces a
   0.04% headline on a vault paying 4%, which reads as a rounding error rather
   than a hundredfold mistake.

   TVL IS TWO FIELDS. `tokensAvailableUsd` is idle capital and
   `tokensInvestedUsd` is deployed capital; a vault with $236M deployed and
   nothing idle shows $0 if only the first is read. Both are summed.

   ── Why ranking is not "highest APY" ───────────────────────────────────

   The first page of live metrics contains vaults holding five dollars with a
   single holder. Sorting on APY alone surfaces those, and a yield screen
   whose top result cannot absorb a hundred dollars is worse than no screen.
   Depth gates entry; rate orders what is left; the reason is stated.
--------------------------------------------------------------------------- */

const BASE = "https://api.kamino.finance";

/** Rates move on a slow cadence and the endpoints are large. */
const TTL_MS = 5 * 60_000;

/**
 * The floor for appearing at all.
 *
 * Not a risk judgement — a statement about whether the pool can take a
 * deposit. Below this the quoted rate describes a market that does not exist
 * in any practical sense.
 */
const MIN_TVL_USD = 250_000;

export type YieldStrategy = "lending" | "vault" | "liquidity";

export interface YieldOpportunity {
  provider: "kamino";
  /** Vault address. Stable, and what a detail view would fetch. */
  id: string;
  name: string;
  /** Token symbol where known, else the mint. */
  asset: string;
  mint: string;
  strategy: YieldStrategy;
  /** PERCENT, converted from the provider's fraction. */
  apyPct: number | null;
  /** Thirty-day trailing APY, percent. Steadier than the spot figure. */
  apy30dPct: number | null;
  /** The part of APY that is token emissions rather than interest. */
  rewardApyPct: number | null;
  tvlUsd: number | null;
  /** Capital not currently deployed. Indicates room to exit. */
  availableUsd: number | null;
  holders: number | null;
  /** Stated caveats. Never a numeric risk score. */
  flags: string[];
  asOf: string;
}

interface WireVaultState {
  name?: string;
  tokenMint?: string;
  tokenMintDecimals?: number;
}

interface WireVault {
  address?: string;
  state?: WireVaultState;
}

interface WireMetric {
  kvault?: string;
  apy?: string;
  apy30d?: string;
  apyFarmRewards?: string;
  apyIncentives?: string;
  tokensAvailableUsd?: string;
  tokensInvestedUsd?: string;
  numberOfHolders?: number;
}

interface Paged<T> {
  result?: T[];
  paginationToken?: string;
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A provider fraction as a percentage. The single place this conversion happens. */
function toPercent(value: string | number | null | undefined): number | null {
  const parsed = num(value);
  return parsed === null ? null : parsed * 100;
}

/** Well-known mints, so the common assets read as symbols rather than base58. */
const SYMBOLS: Record<string, string> = {
  So11111111111111111111111111111111111111112: "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: "JitoSOL",
  bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1: "bSOL",
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4": "JLP",
};

/**
 * Reads a Kamino collection, whichever envelope it uses.
 *
 * The two endpoints this file needs do NOT agree on shape: `/kvaults/vaults`
 * returns a bare array of 175 vaults, while `/kvaults/vaults/metrics` returns
 * `{ result, paginationToken }`. Assuming the paginated shape for both read
 * the metrics correctly and silently produced zero vaults — so every vault
 * lost its name and asset, and the whole yield list came back empty with no
 * error anywhere.
 *
 * Both shapes are handled, and pagination is followed only when the response
 * actually offers a cursor.
 */
async function fetchAll<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  let token: string | undefined;

  /* Bounded. An unbounded follow-the-cursor loop against a paginated endpoint
     is an accidental denial of service against a provider that has been
     generous enough not to require a key. */
  for (let page = 0; page < 4; page += 1) {
    const url = `${BASE}${path}${token === undefined ? "" : `?paginationToken=${encodeURIComponent(token)}`}`;
    const response = await providerFetch<T[] | Paged<T>>({
      provider: "kamino",
      url,
      timeoutMs: 15_000,
    });

    if (!response.ok || response.data === undefined) break;

    const body = response.data;
    if (Array.isArray(body)) {
      rows.push(...body);
      /* A bare array is the whole collection. There is no cursor to follow. */
      break;
    }

    rows.push(...(body.result ?? []));
    token = body.paginationToken;
    if (token === undefined || token.length === 0) break;
  }

  return rows;
}

export interface YieldQuery {
  /** Filter to one asset symbol, e.g. "USDC". */
  asset?: string | null;
  /** Hide anything below this APY, percent. */
  minApyPct?: number | null;
  /** Only stablecoin vaults. */
  stablesOnly?: boolean;
  limit?: number;
}

const STABLES = new Set(["USDC", "USDT", "PYUSD", "USDS", "FDUSD"]);

/**
 * Yield opportunities, deepest-first within rate order.
 *
 * Every entry carries the reason it is ranked where it is, because a yield
 * list without that is a recommendation the reader cannot audit.
 */
export async function kaminoYield(
  query: YieldQuery = {},
): Promise<ToolResult<YieldOpportunity[]>> {
  const key = `kamino:yield:${JSON.stringify(query)}`;

  return cached(key, TTL_MS, async () => {
    const [vaults, metrics] = await Promise.all([
      fetchAll<WireVault>("/kvaults/vaults"),
      fetchAll<WireMetric>("/kvaults/vaults/metrics"),
    ]);

    if (vaults.length === 0 || metrics.length === 0) {
      return fail<YieldOpportunity[]>(
        "kamino",
        "UPSTREAM_UNAVAILABLE",
        "Kamino yield data could not be read.",
      );
    }

    /* The two endpoints name the same identifier differently. */
    const meta = new Map<string, WireVaultState>();
    for (const vault of vaults) {
      if (vault.address === undefined || vault.state === undefined) continue;
      meta.set(vault.address, vault.state);
    }

    const asOf = new Date().toISOString();
    const rows: YieldOpportunity[] = [];

    for (const metric of metrics) {
      const address = metric.kvault;
      if (address === undefined) continue;

      const state = meta.get(address);
      const mint = state?.tokenMint ?? "";
      const asset = SYMBOLS[mint] ?? (mint.length > 0 ? `${mint.slice(0, 4)}…` : "?");

      /* Both halves. A vault with everything deployed shows zero if only the
         idle side is read. */
      const available = num(metric.tokensAvailableUsd) ?? 0;
      const invested = num(metric.tokensInvestedUsd) ?? 0;
      const tvl = available + invested;

      if (tvl < MIN_TVL_USD) continue;

      const apy = toPercent(metric.apy);
      if (apy === null) continue;

      const farm = toPercent(metric.apyFarmRewards) ?? 0;
      const incentives = toPercent(metric.apyIncentives) ?? 0;
      const rewards = farm + incentives;

      const flags: string[] = [];
      /* Emissions are not interest: they are paid in a token whose price is
         not the deposit's, and they stop. Worth separating on the face of the
         row rather than in a footnote. */
      if (rewards > 0.01) {
        flags.push(`${rewards.toFixed(2)}% of the rate is token rewards, not interest`);
      }
      if (available <= 0) {
        flags.push("Fully deployed — exiting may require waiting for liquidity");
      }
      if ((metric.numberOfHolders ?? 0) < 5) {
        flags.push("Few depositors");
      }

      rows.push({
        provider: "kamino",
        id: address,
        name: state?.name ?? `Kamino vault ${address.slice(0, 6)}`,
        asset,
        mint,
        strategy: "vault",
        apyPct: apy,
        apy30dPct: toPercent(metric.apy30d),
        rewardApyPct: rewards > 0 ? rewards : null,
        tvlUsd: tvl,
        availableUsd: available,
        holders: metric.numberOfHolders ?? null,
        flags,
        asOf,
      });
    }

    let filtered = rows;
    if (query.asset !== null && query.asset !== undefined && query.asset.length > 0) {
      const wanted = query.asset.toUpperCase();
      filtered = filtered.filter((row) => row.asset.toUpperCase() === wanted);
    }
    if (query.stablesOnly === true) {
      filtered = filtered.filter((row) => STABLES.has(row.asset.toUpperCase()));
    }
    if (query.minApyPct !== null && query.minApyPct !== undefined) {
      filtered = filtered.filter((row) => (row.apyPct ?? 0) >= (query.minApyPct ?? 0));
    }

    filtered.sort((a, b) => (b.apyPct ?? 0) - (a.apyPct ?? 0));

    return ok(filtered.slice(0, Math.min(Math.max(query.limit ?? 10, 1), 50)), "kamino", {
      asOf,
      warnings: [
        `Vaults below $${(MIN_TVL_USD / 1000).toFixed(0)}k of deposits are excluded — ` +
          "a quoted rate on a pool that cannot absorb a deposit is not an opportunity.",
        "Rates are as reported by the protocol and are not guaranteed.",
      ],
    });
  });
}

/** Why the list is ordered the way it is. Shown to the user, not inferred. */
export const YIELD_RANKING_NOTE =
  "Ranked by current APY among vaults holding at least " +
  `$${(MIN_TVL_USD / 1000).toFixed(0)}k. Depth decides who appears; rate decides ` +
  "the order. Token rewards are shown separately from interest.";
