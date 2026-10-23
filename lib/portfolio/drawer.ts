import { change24h, type Change24h } from "@/lib/portfolio/derive";
import type {
  DefiPosition,
  PerpPosition,
  PortfolioSnapshot,
  PredictionSummary,
  SpotHolding,
  WalletScope,
} from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   What the Portfolio drawer shows for one account scope.

   Pure, so the rules that keep its three figures honest are tested rather
   than trusted. No figure here is computed afresh where the snapshot already
   carries it: the portfolio-wide total and available capital are the
   server's own (lib/portfolio/compose.ts), and a single account's are the
   figures its `WalletScope` reports — the same ones the Assets page shows.

   "In positions" is capital committed to something: perp margin plus its
   open PnL, DeFi deposits, prediction-market shares. It never includes a
   wallet balance, so it cannot overlap "Available" — and it is not meant to
   add up to the total with it: SOL sitting in the wallet is neither.
--------------------------------------------------------------------------- */

export const ALL_ACCOUNTS = "all";

export interface DrawerView {
  /** The scope actually shown — "all" when the asked-for one has gone. */
  scope: string;
  scopeEntry: WalletScope | null;
  totalUsd: number | null;
  availableUsd: number | null;
  inPositionsUsd: number | null;
  /** Most valuable first; unverified after everything counted. */
  holdings: SpotHolding[];
  perps: PerpPosition[];
  defi: DefiPosition[];
  /** Only under All accounts, and only when an account is linked. */
  prediction: PredictionSummary | null;
  /** 24h move over priced holdings, with its coverage. Null when none is priced. */
  change: Change24h | null;
  /**
   * Read successfully and genuinely holds nothing. The one state that may
   * render $0.00 with the onboarding beside it — a failed source never does.
   */
  unfunded: boolean;
}

/** A perp's equity: the margin behind it plus its open PnL — never its notional. */
export function perpEquity(position: PerpPosition): number {
  return (position.marginUsd ?? 0) + (position.unrealizedPnlUsd ?? 0);
}

function valued(values: Array<number | null>): number {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function byValue(a: SpotHolding, b: SpotHolding): number {
  if (a.verified !== b.verified) return a.verified ? -1 : 1;
  return (b.valueUsd ?? -1) - (a.valueUsd ?? -1);
}

export function drawerView(snapshot: PortfolioSnapshot, requested: string): DrawerView {
  const entry = snapshot.scopes.find((scope) => scope.id === requested) ?? null;
  const scope = entry === null ? ALL_ACCOUNTS : requested;

  if (entry === null) {
    const prediction = snapshot.prediction.connected ? snapshot.prediction : null;
    const positions =
      snapshot.perps.length > 0 || snapshot.defi.length > 0 || prediction?.valueUsd != null
        ? valued([
            ...snapshot.perps.map(perpEquity),
            ...snapshot.defi.map((position) => position.valueUsd),
            prediction?.valueUsd ?? null,
          ])
        : 0;
    const holdings = [...snapshot.spot].sort(byValue);
    return {
      scope,
      scopeEntry: null,
      totalUsd: snapshot.summary.totalValueUsd,
      /* The server reports null when no stablecoin or venue collateral was
         readable. With the total read as zero, "nothing available" is a
         reading, not an absence. */
      availableUsd:
        snapshot.summary.availableCapitalUsd ??
        (snapshot.summary.totalValueUsd === 0 ? 0 : null),
      inPositionsUsd: positions,
      holdings,
      perps: snapshot.perps,
      defi: snapshot.defi,
      prediction,
      change: change24h(snapshot),
      unfunded: isUnfunded(snapshot.summary.totalValueUsd, holdings, snapshot.perps, snapshot.defi, snapshot.partial),
    };
  }

  const holdings = snapshot.spot
    .filter((holding) => holding.venue === entry.venue || holding.id.startsWith(`${entry.id}:`))
    .sort(byValue);
  const perps = snapshot.perps.filter((position) => position.venue === entry.venue);
  const total = entry.valueUsd ?? null;
  const available = entry.availableUsd ?? null;
  /* A venue's equity less what is free is what its open positions hold. A
     wallet scope's figures are its balances alone, so nothing is in
     positions there; its DeFi is counted under All accounts, where the
     receipt tokens it would otherwise double are already netted out. */
  const inPositions =
    entry.venue === "wallet"
      ? 0
      : perps.length > 0
        ? valued(perps.map(perpEquity))
        : total !== null && available !== null
          ? Math.max(0, total - available)
          : null;

  return {
    scope,
    scopeEntry: entry,
    totalUsd: total,
    availableUsd: available,
    inPositionsUsd: inPositions,
    holdings,
    perps,
    defi: [],
    prediction: null,
    change: change24h({ ...snapshot, spot: holdings, summary: { ...snapshot.summary, totalValueUsd: total } }),
    unfunded: isUnfunded(total, holdings, perps, [], snapshot.partial),
  };
}

function isUnfunded(
  total: number | null,
  holdings: SpotHolding[],
  perps: PerpPosition[],
  defi: DefiPosition[],
  partial: boolean,
): boolean {
  return total === 0 && !partial && holdings.length === 0 && perps.length === 0 && defi.length === 0;
}
