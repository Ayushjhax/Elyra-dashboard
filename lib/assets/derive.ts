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
import type { AssetAccount, AssetAccountType } from "@/lib/assets/types";

/** Holdings below this are noise in a capital view. */
const DUST_USD = 0.01;

/**
 * The venue string `composePortfolio` tags wallet holdings with — on Solana,
 * Ethereum and Robinhood Chain alike. All three are the Spot account; each
 * holding's `chain` says which network it sits on.
 */
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
  "solana-perps": "No Solana perps venue is integrated with Elyra yet.",
};

/** What an account that could be linked, but is not, says instead of a value. */
const NOT_LINKED: Partial<Record<AssetAccountType, string>> = {
  spot: "Link a wallet to read its token balances.",
  hyperliquid: "Connect Hyperliquid to read its equity and positions.",
  prediction: "Link a prediction-market account to read its positions.",
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

  /* ---- Spot: the account's wallets, on every chain read ---- */
  const spot = walletHoldings(snapshot);
  const counted = spot.filter(
    (holding) => holding.verified && holding.valueUsd !== null && holding.valueUsd >= DUST_USD,
  );
  const spotFailure = failureFor(snapshot.notes, ["wallet", "wallet tokens"]);
  const walletLinked =
    snapshot.scopes.some((scope) => scope.venue === WALLET_VENUE) ||
    spot.length > 0 ||
    spotFailure !== undefined;
  /* A wallet that was read and holds nothing is worth $0.00 — a reading, not
     an absence. Only an unlinked or unreadable wallet has no value. */
  const spotValue = walletLinked
    ? counted.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0)
    : null;
  const spotChange = change24hOf(spot);

  const spotDetail =
    spotFailure !== undefined
      ? null
      : counted.length === 0
        ? null
        : [
            `${counted.length} asset${counted.length === 1 ? "" : "s"}`,
            /* Named only once there is more than one, so a Solana-only
               wallet reads exactly as it did. */
            new Set(counted.map((holding) => holding.chain)).size > 1
              ? `${new Set(counted.map((holding) => holding.chain)).size} networks`
              : null,
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

  /* ---- Prediction markets: linked through the connections console ---- */
  const prediction = snapshot.prediction;
  const pmFailure = failureFor(snapshot.notes, ["prediction"]);
  const pmLinked = prediction.connected || pmFailure !== undefined;
  const pmValue = prediction.connected ? (prediction.valueUsd ?? 0) : null;
  const pmPositions = prediction.connected ? (prediction.activeMarkets ?? 0) : null;
  const pmDetail = prediction.connected
    ? `${pmPositions} active market${pmPositions === 1 ? "" : "s"}`
    : null;

  const account = (
    type: AssetAccountType,
    connection: AssetAccount["connection"],
    valueUsd: number | null,
    availableUsd: number | null,
    positions: number | null,
    detail: string | null,
    failure: SourceNote | undefined,
  ): AssetAccount => {
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
      connection,
      positions: status === "ready" ? positions : null,
      errorReason: failure?.reason ?? null,
      /* An account with nothing behind it explains itself where a value
         would go; one that was read says what it holds. */
      detail:
        status === "ready"
          ? detail
          : connection === "unsupported"
            ? (NOT_INTEGRATED[type] ?? null)
            : connection === "disconnected"
              ? (NOT_LINKED[type] ?? null)
              : null,
    };
  };

  return [
    account("spot", walletLinked ? "connected" : "disconnected", spotValue, spotValue, null, spotDetail, spotFailure),
    account("solana-perps", "unsupported", null, null, null, null, undefined),
    account(
      "hyperliquid",
      /* A read that failed naming Hyperliquid itself was a read of a linked
         account; a generic "venues" failure says nothing about linking. */
      hlScope !== undefined || hlFailure?.scope.toLowerCase() === "hyperliquid" ? "connected" : "disconnected",
      hlValue,
      hlAvailable,
      hlScope !== undefined ? hlPositions.length : null,
      hlDetail,
      hlFailure,
    ),
    account("prediction", pmLinked ? "connected" : "disconnected", pmValue, null, pmPositions, pmDetail, pmFailure),
  ];
}

/** "3 of 4 synced", plus whatever went wrong. For the allocation footer. */
export function syncSummary(accounts: AssetAccount[]): {
  ready: number;
  total: number;
  /** Linked, whether or not the last read worked. */
  connected: number;
  /** Not linked, or with nothing Elyra can link yet. */
  notConnected: number;
  failed: string[];
  unintegrated: string[];
} {
  const connected = accounts.filter((entry) => entry.connection === "connected").length;
  return {
    ready: accounts.filter((entry) => entry.status === "ready").length,
    total: accounts.length,
    connected,
    notConnected: accounts.length - connected,
    failed: accounts.filter((entry) => entry.status === "error").map((entry) => entry.label),
    unintegrated: accounts
      .filter((entry) => entry.connection === "unsupported")
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

/* ---------------------------------------------------------------------------
   Allocation — where the total is held

   Equity terms throughout, so the slices add up to the figure printed above
   them: a wallet token at its value, a perp at its margin plus open PnL (never
   its notional), a DeFi deposit and prediction shares at their value — the
   same terms `composePortfolio` totals. Across every account the slices are
   accounts; within one account they are what that account holds.

   The one place the client's sum can exceed the server's total is a DeFi
   receipt token sitting in the wallet: the server nets it out because the
   protocol already reports those dollars. The overlap is taken from Spot,
   which is where it sits, so the ring and the total never disagree.
--------------------------------------------------------------------------- */

export interface CapitalSlice {
  key: string;
  label: string;
  valueUsd: number;
  /** Share of `totalUsd`, 0–100. */
  pct: number;
}

export interface CapitalAllocation {
  totalUsd: number;
  slices: CapitalSlice[];
  /** What the slices are: accounts, or one account's assets. */
  by: "account" | "asset";
}

const MAX_SLICES = 6;

function ranked(buckets: Map<string, { label: string; valueUsd: number }>, total: number): CapitalSlice[] {
  const rows = [...buckets.entries()]
    .filter(([, bucket]) => bucket.valueUsd > 0)
    .map(([key, bucket]) => ({ key, label: bucket.label, valueUsd: bucket.valueUsd, pct: (bucket.valueUsd / total) * 100 }))
    .sort((a, b) => b.valueUsd - a.valueUsd);
  if (rows.length <= MAX_SLICES) return rows;
  const rest = rows.slice(MAX_SLICES - 1).reduce((sum, row) => sum + row.valueUsd, 0);
  return [
    ...rows.slice(0, MAX_SLICES - 1),
    { key: "other", label: "Other", valueUsd: rest, pct: (rest / total) * 100 },
  ];
}

function add(buckets: Map<string, { label: string; valueUsd: number }>, key: string, label: string, value: number): void {
  const existing = buckets.get(key);
  if (existing) existing.valueUsd += value;
  else buckets.set(key, { label, valueUsd: value });
}

export function capitalAllocation(snapshot: PortfolioSnapshot, scope: string): CapitalAllocation | null {
  const buckets = new Map<string, { label: string; valueUsd: number }>();
  const counted = (holding: SpotHolding) => holding.verified && holding.valueUsd !== null && holding.valueUsd > 0;

  if (scope === ALL_ACCOUNTS) {
    for (const holding of snapshot.spot.filter(counted)) {
      add(buckets, holding.venue === WALLET_VENUE ? "spot" : holding.venue, venueLabel(holding.venue), holding.valueUsd ?? 0);
    }
    for (const position of snapshot.perps) {
      const equity = (position.marginUsd ?? 0) + (position.unrealizedPnlUsd ?? 0);
      if (equity > 0) add(buckets, position.venue, venueLabel(position.venue), equity);
    }
    for (const position of snapshot.defi) {
      if ((position.valueUsd ?? 0) > 0) add(buckets, "defi", "DeFi", position.valueUsd ?? 0);
    }
    if ((snapshot.prediction.valueUsd ?? 0) > 0) {
      add(buckets, "prediction", LABEL.prediction, snapshot.prediction.valueUsd ?? 0);
    }

    const total = snapshot.summary.totalValueUsd;
    if (total === null || total <= 0) return null;
    const sum = [...buckets.values()].reduce((acc, bucket) => acc + bucket.valueUsd, 0);
    const spot = buckets.get("spot");
    if (sum > total && spot !== undefined) spot.valueUsd = Math.max(0, spot.valueUsd - (sum - total));
    const slices = ranked(buckets, total);
    return slices.length === 0 ? null : { totalUsd: total, slices, by: "account" };
  }

  const view = scopeSnapshot(snapshot, scope);
  for (const holding of view.spot.filter(counted)) add(buckets, holding.symbol, holding.symbol, holding.valueUsd ?? 0);
  for (const position of view.perps) {
    const equity = (position.marginUsd ?? 0) + (position.unrealizedPnlUsd ?? 0);
    if (equity > 0) add(buckets, `perp:${position.market}`, position.market, equity);
  }
  if (scope === "prediction" && (snapshot.prediction.valueUsd ?? 0) > 0) {
    add(buckets, "prediction", "Open markets", snapshot.prediction.valueUsd ?? 0);
  }
  /* A venue's equity is its positions plus the collateral not yet behind
     any of them. Shown as its own slice, so the account's breakdown adds up
     to the equity on its card. */
  const venue = snapshot.scopes.find((entry) => entry.venue === scope && scope !== WALLET_VENUE);
  if (venue?.valueUsd != null) {
    const held = [...buckets.values()].reduce((acc, bucket) => acc + bucket.valueUsd, 0);
    const free = venue.valueUsd - held;
    if (free > 0.005) add(buckets, "free", "Free collateral", free);
  }
  const total = [...buckets.values()].reduce((acc, bucket) => acc + bucket.valueUsd, 0);
  if (total <= 0) return null;
  return { totalUsd: total, slices: ranked(buckets, total), by: "asset" };
}
