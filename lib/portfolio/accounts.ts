import { change24hOf, walletHoldings } from "@/lib/assets/derive";
import { evmChainOf, onSolanaWallet, onSuiWallet, type WalletNetwork } from "@/lib/portfolio/chain";
import type { PortfolioSnapshot, SpotHolding } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   The Portfolio page's accounts panel: total equity, and where it lives.

   Spot & DeFi (every wallet chain, plus Kamino), Hyperliquid perps, each
   connected exchange, and Polymarket — each with its value and its move:
   the 24h change for spot, open PnL for a perps or prediction account,
   where a 24h change is not something the venue reports. A chain filter
   narrows the total to one wallet network.

   A venue that could not be read says so; one that is not connected says
   that instead. Neither is ever $0. Pure: a regrouping of the snapshot the
   shared portfolio store already holds.
--------------------------------------------------------------------------- */

export type AccountFilter = "all" | WalletNetwork;

export interface AccountRow {
  id: string;
  kind: "wallet" | "hyperliquid" | "exchange" | "prediction";
  /** For a wallet row on one network, that network; for an exchange, its venue id. */
  name: string | null;
  valueUsd: number | null;
  /** The 24h move for spot; open PnL for a perps or prediction account. */
  changeUsd: number | null;
  changePct: number | null;
  changeKind: "24h" | "open";
  /** Assets, positions or markets, by kind. */
  count: number | null;
  /** DeFi value folded into the wallet row, shown on its own line. */
  defiUsd: number | null;
  status: "ok" | "failed" | "disconnected";
  reason: string | null;
}

export interface AccountsView {
  totalUsd: number | null;
  /** The total is of what could be read, not all that is held. */
  partial: boolean;
  rows: AccountRow[];
}

export function networkOf(holding: Pick<SpotHolding, "venue" | "chain">): WalletNetwork | null {
  if (onSolanaWallet(holding)) return "solana";
  if (onSuiWallet(holding)) return "sui";
  return (evmChainOf(holding)?.key as WalletNetwork | undefined) ?? null;
}

const counted = (holding: SpotHolding) => holding.verified && holding.valueUsd !== null;

function failure(snapshot: PortfolioSnapshot, ...scopes: string[]): string | null {
  const note = snapshot.notes.find((entry) => entry.kind === "failed" && scopes.some((scope) => entry.scope.toLowerCase().startsWith(scope)));
  return note?.reason ?? null;
}

export function accountsView(snapshot: PortfolioSnapshot, filter: AccountFilter): AccountsView {
  const wallet = walletHoldings(snapshot).filter((holding) => filter === "all" || networkOf(holding) === filter);
  const walletValue = wallet.filter(counted).reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0);
  const defi = filter === "all" || filter === "solana" ? snapshot.defi.reduce((sum, position) => sum + (position.valueUsd ?? 0), 0) : 0;
  const change = change24hOf(wallet);
  const walletFailed = failure(snapshot, "wallet", filter === "all" ? "wallet" : filter);

  const walletRow: AccountRow = {
    id: filter === "all" ? "wallet" : `wallet:${filter}`,
    kind: "wallet",
    name: filter === "all" ? null : filter,
    valueUsd: walletFailed !== null && wallet.length === 0 ? null : walletValue + defi,
    changeUsd: change?.pnlUsd ?? null,
    changePct: change?.pnlPct ?? null,
    changeKind: "24h",
    count: wallet.filter(counted).length,
    defiUsd: defi > 0 ? defi : null,
    status: walletFailed !== null && wallet.length === 0 ? "failed" : "ok",
    reason: walletFailed,
  };

  if (filter !== "all") {
    return { totalUsd: walletRow.valueUsd, partial: walletRow.status === "failed", rows: [walletRow] };
  }

  const rows: AccountRow[] = [walletRow];

  /* Hyperliquid: its account value (margin plus open PnL, plus free collateral). */
  const hyperliquid = snapshot.scopes.filter((scope) => scope.venue === "hyperliquid");
  const hlFailed = failure(snapshot, "hyperliquid");
  rows.push({
    id: "hyperliquid",
    kind: "hyperliquid",
    name: "hyperliquid",
    valueUsd: hyperliquid.length === 0 ? null : hyperliquid.reduce((sum, scope) => sum + (scope.valueUsd ?? 0), 0),
    changeUsd: hyperliquid.length === 0 ? null : hyperliquid.reduce((sum, scope) => sum + (scope.unrealizedPnlUsd ?? 0), 0),
    changePct: null,
    changeKind: "open",
    count: snapshot.perps.filter((position) => position.venue === "hyperliquid").length,
    defiUsd: null,
    status: hlFailed !== null ? "failed" : hyperliquid.length === 0 ? "disconnected" : "ok",
    reason: hlFailed,
  });

  /* Each connected exchange, as its own account. */
  for (const scope of snapshot.scopes) {
    if (scope.venue === "wallet" || scope.venue === "hyperliquid" || scope.id === "all") continue;
    const failed = failure(snapshot, scope.venue);
    rows.push({
      id: `exchange:${scope.id}`,
      kind: "exchange",
      name: scope.venue,
      valueUsd: scope.valueUsd ?? null,
      changeUsd: scope.unrealizedPnlUsd ?? null,
      changePct: null,
      changeKind: "open",
      count: snapshot.perps.filter((position) => position.venue === scope.venue).length,
      defiUsd: null,
      status: failed !== null ? "failed" : "ok",
      reason: failed,
    });
  }

  const prediction = snapshot.prediction;
  rows.push({
    id: "polymarket",
    kind: "prediction",
    name: "polymarket",
    valueUsd: prediction.connected ? prediction.valueUsd : null,
    changeUsd: prediction.connected ? prediction.unrealisedPnlUsd : null,
    changePct:
      prediction.connected && prediction.unrealisedPnlUsd !== null && prediction.costBasisUsd !== null && prediction.costBasisUsd > 0
        ? (prediction.unrealisedPnlUsd / prediction.costBasisUsd) * 100
        : null,
    changeKind: "open",
    count: prediction.activeMarkets,
    defiUsd: null,
    status: !prediction.connected ? "disconnected" : prediction.valueUsd === null ? "failed" : "ok",
    reason: prediction.unavailableReason,
  });

  return { totalUsd: snapshot.summary.totalValueUsd, partial: snapshot.partial, rows };
}
