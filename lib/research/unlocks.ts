import "server-only";

import { fail, type ToolResult } from "@/lib/providers/types";
import { supplyRatio } from "@/lib/research/calculations";
import type { TokenUnlock, UnlockEventType, UnlockSummary } from "@/lib/research/types";

export type { TokenUnlock, UnlockEventType, UnlockSummary };

/* ---------------------------------------------------------------------------
   Token unlock intelligence.

   ── Why there is no default provider ───────────────────────────────────

   Unlock schedules are compiled data. The organisations that maintain them
   sell access, and the ones that publish a web page have terms that do not
   permit an application to harvest it. Scraping one would be a licence breach
   AND unciteable — a report whose source is "we parsed somebody's HTML" is
   not evidence.

   So this is an interface with adapters behind it, and no adapter is
   configured. Every call returns a clear unavailable state naming the
   environment variables that would enable one. That is a worse product than
   having the data and a much better one than inventing it: an unlock schedule
   is a claim about future supply, and a wrong one moves money.

   ── The rule for when a provider IS configured ─────────────────────────

   An unlock is a SUPPLY EVENT, not a price prediction. The analytics below
   compute how much is unlocking and what share of float it represents, and
   stop there. "Token will dump" is not something this data supports.
--------------------------------------------------------------------------- */

export interface UnlockProvider {
  readonly id: string;
  configured(): boolean;
  upcoming(windowHours: number, token?: string | null): Promise<ToolResult<TokenUnlock[]>>;
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}

/* ---------------------------------------------------------------------------
   Adapters

   Declared, not implemented. Each one needs its provider's current response
   schema confirmed against a live authenticated call before it is written —
   the same rule applied to every other integration here, and the reason DFlow
   is declared and unconnected too.
--------------------------------------------------------------------------- */

const TOKENOMIST: UnlockProvider = {
  id: "tokenomist",
  configured: () => env("TOKENOMIST_API_KEY") !== undefined,
  async upcoming() {
    return fail<TokenUnlock[]>(
      "polymarket",
      "UNSUPPORTED",
      "A Tokenomist key is set but the adapter is not implemented — its " +
        "response schema has not been confirmed against a live call.",
    );
  },
};

const COINMARKETCAL: UnlockProvider = {
  id: "coinmarketcal",
  configured: () => env("COINMARKETCAL_API_KEY") !== undefined,
  async upcoming() {
    return fail<TokenUnlock[]>(
      "polymarket",
      "UNSUPPORTED",
      "A CoinMarketCal key is set but the adapter is not implemented — its " +
        "V2 event schema has not been confirmed against a live call.",
    );
  },
};

const PROVIDERS: UnlockProvider[] = [TOKENOMIST, COINMARKETCAL];

export const UNLOCKS_UNAVAILABLE =
  "Token unlock data is not configured. Unlock schedules come from licensed " +
  "providers; set TOKENOMIST_API_KEY or COINMARKETCAL_API_KEY to enable them. " +
  "Elyra does not scrape unlock sites.";

export function unlockProvider(): UnlockProvider | null {
  return PROVIDERS.find((provider) => provider.configured()) ?? null;
}

export function unlocksConfigured(): boolean {
  return unlockProvider() !== null;
}

/**
 * Upcoming unlocks in a window.
 *
 * Returns a NAMED unavailable state rather than an empty list when nothing is
 * configured. An empty array reads as "no unlocks are coming", which is a
 * claim about the future that nobody checked.
 */
export async function upcomingUnlocks(
  windowHours = 24 * 7,
  token: string | null = null,
): Promise<ToolResult<TokenUnlock[]>> {
  const provider = unlockProvider();
  if (provider === null) {
    return fail<TokenUnlock[]>("polymarket", "UNSUPPORTED", UNLOCKS_UNAVAILABLE);
  }
  return provider.upcoming(windowHours, token);
}

/* ---------------------------------------------------------------------------
   Analytics

   Pure, so they are testable now and correct the day a provider is connected.
--------------------------------------------------------------------------- */

/**
 * What counts as "major", stated rather than felt.
 *
 * One percent of circulating supply is the default because it is the point at
 * which an unlock is a meaningful fraction of the tradeable float rather than
 * routine emission. A USD floor alone would make a large-cap's routine
 * vesting look major and a small-cap's cliff look trivial.
 */
export const MAJOR_UNLOCK_PCT = 1;

export function isMajor(unlock: TokenUnlock, thresholdPct = MAJOR_UNLOCK_PCT): boolean {
  return (unlock.percentOfCirculating ?? 0) >= thresholdPct;
}

export function summariseUnlocks(
  unlocks: TokenUnlock[],
  now: number = Date.now(),
): UnlockSummary {
  const within = (hours: number) =>
    unlocks.filter((unlock) => {
      const at = Date.parse(unlock.unlockAt);
      if (!Number.isFinite(at)) return false;
      return at >= now && at <= now + hours * 3_600_000;
    }).length;

  const valued = unlocks.filter((unlock) => unlock.valueUsd !== null);

  const ranked = [...unlocks]
    .filter((unlock) => unlock.percentOfCirculating !== null)
    .sort((a, b) => (b.percentOfCirculating ?? 0) - (a.percentOfCirculating ?? 0));

  return {
    total: unlocks.length,
    within24h: within(24),
    within7d: within(24 * 7),
    within30d: within(24 * 30),
    /* Null when nothing was valued, rather than 0 — an unpriced schedule is
       not a schedule worth nothing. */
    totalValueUsd:
      valued.length === 0
        ? null
        : valued.reduce((sum, unlock) => sum + (unlock.valueUsd ?? 0), 0),
    largest: ranked[0] ?? null,
    major: unlocks.filter((unlock) => isMajor(unlock)),
  };
}

/** Share of circulating supply, for a provider that reports raw amounts. */
export function shareOfFloat(
  tokenAmount: number | null,
  circulatingSupply: number | null,
): number | null {
  return supplyRatio(tokenAmount, circulatingSupply);
}

/**
 * How an unlock should be described.
 *
 * Attention, not direction. The data says how much supply becomes
 * transferable and when; it says nothing about what holders will do with it,
 * and a product that turns a schedule into "expect a dump" is making a
 * forecast its sources do not support.
 */
export function unlockAttention(unlock: TokenUnlock): "low" | "medium" | "high" {
  const share = unlock.percentOfCirculating ?? 0;
  if (share >= 5) return "high";
  if (share >= MAJOR_UNLOCK_PCT) return "medium";
  return "low";
}

export function describeUnlock(unlock: TokenUnlock): string {
  const share =
    unlock.percentOfCirculating === null
      ? "an undisclosed share of"
      : `${unlock.percentOfCirculating.toFixed(2)}% of`;

  const kind = unlock.eventType === "cliff" ? "cliff unlock" : "unlock";

  return (
    `${unlock.token}: a ${kind} representing ${share} circulating supply` +
    `${unlock.estimated ? " (date estimated by the provider)" : ""}.`
  );
}
