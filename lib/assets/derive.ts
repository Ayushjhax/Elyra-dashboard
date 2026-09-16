/* ---------------------------------------------------------------------------
   Everything the Assets page computes rather than fetches.

   Pure functions over the `PortfolioSnapshot` that `/api/portfolio` already
   returns. Assets deliberately shares that endpoint rather than adding one:
   the aggregation — Solana RPC, Jupiter metadata, Pyth, Hyperliquid — is
   identical, and design.md §26 asks for exactly this ("do not fetch each
   provider independently from every card").

   What differs is the grouping. Portfolio asks "how is my capital
   performing"; Assets asks "where does my capital live". So the same
   holdings and positions are folded into four CAPITAL ACCOUNTS, valued by
   equity rather than by notional exposure.

   The rule carried from the portfolio layer: a figure is computed only when
   its inputs are present. An account with no integration behind it reports
   `valueUsd: null` and `status: "empty"` — never 0, never a fabricated
   percentage. §"NO FAKE DATA" is the whole point of this file.
--------------------------------------------------------------------------- */

import type {
  PortfolioSnapshot,
  SourceNote,
  SpotHolding,
} from "@/lib/portfolio/types";
import type { AssetAccount, AssetAccountType, AssetScope } from "@/lib/assets/types";

/** Holdings below this are noise in a capital view. */
const DUST_USD = 0.01;

/** The venue string `composePortfolio` tags Solana wallet holdings with. */
const WALLET_VENUE = "wallet";

/* ---------------------------------------------------------------------------
   Which venues are actually integrated

   Two of the four accounts design.md asks for have no provider behind them
   anywhere in this repository — there is no Solana perps adapter and no
   prediction-market adapter, and inventing one because it appears in a UI
   spec is the thing §24 explicitly forbids. They are still rendered, as
   accounts with an honest reason attached, because an operator deciding
   where to put capital needs to know the bucket exists and is not wired up.
--------------------------------------------------------------------------- */

const NOT_INTEGRATED: Partial<Record<AssetAccountType, string>> = {
  "solana-perps": "No Solana perps venue is connected to Elyra yet.",
  prediction: "No prediction-market venue is connected to Elyra yet.",
};

const LABEL: Record<AssetAccountType, string> = {
  spot: "Spot",
  "solana-perps": "Solana Perps",
  hyperliquid: "Hyperliquid",
  prediction: "Prediction Markets",
};

/* ---------------------------------------------------------------------------
   24h change, scoped

   The portfolio layer computes this across everything held. Assets needs it
   per account — "Spot is up 2.84% today" — so the same arithmetic is applied
   to a subset here.

   The `r / (1 + r)` is not a typo and matters: a holding worth 110 after a
   +10% day gained 10, not 11. Multiplying today's value by the rate
   overstates every gain and understates every loss.
--------------------------------------------------------------------------- */

export interface Change24h {
  pnlUsd: number;
  pnlPct: number;
  /** Share of the group's value the figure could actually be computed over. */
  coveragePct: number;
}

export function change24hOf(holdings: SpotHolding[]): Change24h | null {
  let covered = 0;
  let delta = 0;
  let total = 0;

  for (const holding of holdings) {
    if (!holding.verified || holding.valueUsd === null) continue;
    total += holding.valueUsd;
    if (holding.change24hPct === null) continue;
    covered += holding.valueUsd;
    const r = holding.change24hPct / 100;
    delta += holding.valueUsd * (r / (1 + r));
  }

  if (covered <= 0) return null;

  const opened = covered - delta;
  return {
    pnlUsd: delta,
    pnlPct: opened > 0 ? (delta / opened) * 100 : 0,
    coveragePct: total > 0 ? Math.min(100, (covered / total) * 100) : 100,
  };
}

/* ---------------------------------------------------------------------------
   Accounts
--------------------------------------------------------------------------- */

/** A failure note naming this venue, if the read did not come back clean. */
function failureFor(notes: SourceNote[], scopes: string[]): SourceNote | undefined {
  return notes.find(
    (note) => note.kind === "failed" && scopes.includes(note.scope.toLowerCase()),
  );
}

export function walletHoldings(snapshot: PortfolioSnapshot): SpotHolding[] {
  return snapshot.spot.filter((holding) => holding.venue === WALLET_VENUE);
}

/**
 * The four capital accounts, always in the same order.
 *
 * Always four, even when two of them can hold nothing: their cards state why
 * rather than vanishing, so the page describes the product's actual reach
 * instead of quietly shrinking to what happens to work today.
 */
export function deriveAccounts(snapshot: PortfolioSnapshot): AssetAccount[] {
  const total = snapshot.summary.totalValueUsd;
  const share = (value: number | null): number | null =>
    value === null || total === null || total <= 0 ? null : (value / total) * 100;

  /* ---- Spot: the Solana wallet ---- */
  const spot = walletHoldings(snapshot);
  const counted = spot.filter(
    (holding) => holding.verified && holding.valueUsd !== null && holding.valueUsd >= DUST_USD,
  );
  const spotValue =
    counted.length > 0 ? counted.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0) : null;
  const spotFailure = failureFor(snapshot.notes, ["wallet", "wallet tokens"]);
  const spotChange = change24hOf(spot);

  const spotDetail =
    spotFailure !== undefined
      ? null
      : counted.length === 0
        ? null
        : [
            `${counted.length} asset${counted.length === 1 ? "" : "s"}`,
            spotChange === null
              ? null
              : `${spotChange.pnlPct >= 0 ? "+" : ""}${spotChange.pnlPct.toFixed(2)}% today`,
          ]
            .filter((part): part is string => part !== null)
            .join(" · ");

  /* ---- Hyperliquid: equity as the venue itself reports it ---- */
  const hlScope = snapshot.scopes.find((scope) => scope.venue === "hyperliquid");
  const hlPositions = snapshot.perps.filter((position) => position.venue === "hyperliquid");
  const hlFailure = failureFor(snapshot.notes, ["hyperliquid", "venues"]);
  const hlValue = hlScope?.valueUsd ?? null;
  const hlAvailable = hlScope?.availableUsd ?? null;

  const hlDetail =
    hlFailure !== undefined
      ? null
      : hlScope === undefined
        ? null
        : [
            hlAvailable === null
              ? null
              : `Available $${hlAvailable.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
            `${hlPositions.length} open position${hlPositions.length === 1 ? "" : "s"}`,
          ]
            .filter((part): part is string => part !== null)
            .join(" · ");

  const account = (
    type: AssetAccountType,
    valueUsd: number | null,
    availableUsd: number | null,
    detail: string | null,
    failure: SourceNote | undefined,
  ): AssetAccount => {
    const missing = NOT_INTEGRATED[type];
    const status: AssetAccount["status"] =
      failure !== undefined ? "error" : valueUsd === null ? "empty" : "ready";
    return {
      id: type,
      type,
      label: LABEL[type],
      valueUsd: status === "ready" ? valueUsd : null,
      availableUsd: status === "ready" ? availableUsd : null,
      allocationPct: status === "ready" ? share(valueUsd) : null,
      status,
      errorReason: failure?.reason ?? null,
      /* An un-integrated venue explains itself where a value would go; an
         integrated one that is simply empty says nothing extra. */
      detail: status === "ready" ? detail : (missing ?? null),
    };
  };

  return [
    account("spot", spotValue, spotValue, spotDetail, spotFailure),
    account("solana-perps", null, null, null, undefined),
    account("hyperliquid", hlValue, hlAvailable, hlDetail, hlFailure),
    account("prediction", null, null, null, undefined),
  ];
}

/** Accounts holding real capital, ranked — the Wallet Allocation rows. */
export function allocationRows(accounts: AssetAccount[]): AssetAccount[] {
  return accounts
    .filter((entry) => entry.status === "ready" && (entry.valueUsd ?? 0) > 0)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
}

/** "3 of 4 synced", plus whatever went wrong. For the allocation footer. */
export function syncSummary(accounts: AssetAccount[]): {
  ready: number;
  total: number;
  failed: string[];
  unintegrated: string[];
} {
  return {
    ready: accounts.filter((entry) => entry.status === "ready").length,
    total: accounts.length,
    failed: accounts.filter((entry) => entry.status === "error").map((entry) => entry.label),
    unintegrated: accounts
      .filter((entry) => entry.status === "empty" && NOT_INTEGRATED[entry.type] !== undefined)
      .map((entry) => entry.label),
  };
}

/* ---------------------------------------------------------------------------
   Scoping

   Selecting an account — from the header's selector or by clicking its card —
   filters the workspace rather than navigating. §22: "Prefer filtering first
   because it is faster and keeps user context."
--------------------------------------------------------------------------- */

export const ALL_ACCOUNTS = "all";

export function accountScopes(snapshot: PortfolioSnapshot, accounts: AssetAccount[]): AssetScope[] {
  const walletAddress =
    snapshot.scopes.find((scope) => scope.venue === WALLET_VENUE)?.address ?? null;

  return accounts
    .filter((entry) => entry.status !== "empty" || entry.valueUsd !== null)
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      address: entry.type === "spot" ? walletAddress : null,
    }));
}

/** The snapshot as one account sees it. `ALL_ACCOUNTS` passes it through. */
export function scopeSnapshot(
  snapshot: PortfolioSnapshot,
  accountId: string,
): PortfolioSnapshot {
  if (accountId === ALL_ACCOUNTS) return snapshot;

  if (accountId === "spot") {
    return { ...snapshot, spot: walletHoldings(snapshot), perps: [] };
  }

  return {
    ...snapshot,
    spot: snapshot.spot.filter((holding) => holding.venue === accountId),
    perps: snapshot.perps.filter((position) => position.venue === accountId),
  };
}

/* ---------------------------------------------------------------------------
   Balances
--------------------------------------------------------------------------- */

/** How an account is named in a table cell, keyed by the venue tag. */
export function venueLabel(venue: string): string {
  if (venue === WALLET_VENUE) return "Spot";
  return LABEL[venue as AssetAccountType] ?? venue.charAt(0).toUpperCase() + venue.slice(1);
}

export type BalanceGrouping = "asset" | "account";

/**
 * Balances in display order.
 *
 * Grouped by account, rows are ordered account-first then by value, so the
 * venues read as blocks. Grouped by asset — the default — it is one ranked
 * list, and the same symbol held at two venues appears twice, adjacent,
 * which is what §15 asks for ("the UI should make that obvious").
 */
export function orderBalances(
  holdings: SpotHolding[],
  grouping: BalanceGrouping,
): SpotHolding[] {
  const byValue = (a: SpotHolding, b: SpotHolding): number =>
    (b.valueUsd ?? -1) - (a.valueUsd ?? -1);

  if (grouping === "account") {
    return [...holdings].sort(
      (a, b) => a.venue.localeCompare(b.venue) || byValue(a, b),
    );
  }

  return [...holdings].sort((a, b) => a.symbol.localeCompare(b.symbol) || byValue(a, b));
}
