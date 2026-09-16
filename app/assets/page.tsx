"use client";

import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { AssetAccountsGrid, AssetAccountsGridSkeleton } from "@/components/assets/AssetAccountsGrid";
import {
  TotalEquityCard,
  TotalEquityCardSkeleton,
  WalletAllocationCard,
  WalletAllocationCardSkeleton,
} from "@/components/assets/AssetOverview";
import { AssetWorkspace, AssetWorkspaceSkeleton } from "@/components/assets/AssetWorkspace";
import { AssetsHeader } from "@/components/assets/AssetsHeader";
import { DepositOnlyButton } from "@/components/assets/ActionDialogs";
import { Unavailable } from "@/components/portfolio/primitives";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import {
  ALL_ACCOUNTS,
  accountScopes,
  change24hOf,
  deriveAccounts,
  scopeSnapshot,
} from "@/lib/assets/derive";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";

/* ---------------------------------------------------------------------------
   Assets — the treasury console.

   Unlike every other route, this one takes the whole main column: the chart,
   the composed panel stack and the assistant are all stood down for it. That
   exception lives in `AppShell` and `FULL_BLEED_ROUTES`; see the note there
   for why it is an allowlist of one rather than a general mechanism.

   The data is `/api/portfolio` — the same endpoint and the same reference
   counted store Portfolio reads, not a second aggregation. What differs is
   the question being asked of it: Portfolio asks how capital is performing,
   Assets asks where it is and what can be done with it. So the snapshot is
   regrouped into capital accounts here (lib/assets/derive.ts) and nothing is
   fetched twice.

   Reading order is the whiteboard's: total equity and allocation, then the
   accounts holding it, then the workspace over all of it.
--------------------------------------------------------------------------- */

function Loading() {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2.5 @[52rem]:grid-cols-[1.6fr_1fr]">
        <TotalEquityCardSkeleton />
        <WalletAllocationCardSkeleton />
      </div>
      <AssetAccountsGridSkeleton />
      <AssetWorkspaceSkeleton />
    </div>
  );
}

export default function AssetsPage() {
  const auth = useElyraAuth();
  const feed = usePortfolio();
  const [scope, setScope] = useState<string>(ALL_ACCOUNTS);

  const snapshot = feed.snapshot;

  /* Accounts are derived from the UNSCOPED snapshot: the cards are the
     filter control, so they must keep describing every account even while
     one of them is the active filter. Only the workspace below narrows. */
  const accounts = useMemo(
    () => (snapshot === null ? [] : deriveAccounts(snapshot)),
    [snapshot],
  );

  const scopes = useMemo(
    () => (snapshot === null ? [] : accountScopes(snapshot, accounts)),
    [snapshot, accounts],
  );

  const view = useMemo(
    () => (snapshot === null ? null : scopeSnapshot(snapshot, scope)),
    [snapshot, scope],
  );

  const change = useMemo(
    () => (snapshot === null ? null : change24hOf(snapshot.spot)),
    [snapshot],
  );

  const walletAddress =
    snapshot?.scopes.find((entry) => entry.venue === "wallet")?.address ?? null;

  const funded =
    snapshot !== null && (snapshot.spot.length > 0 || snapshot.perps.length > 0);

  const scopeLabel =
    scope === ALL_ACCOUNTS ? null : (accounts.find((a) => a.id === scope)?.label ?? null);

  return (
    <Panel label="Assets" className="min-h-0 flex-1">
      <PanelHeader>
        <Eyebrow>Assets</Eyebrow>
      </PanelHeader>

      {/* The container every `@[…]` below measures against — this page's own
          width, which the operator changes by resizing the window rather
          than by dragging a column, since it now owns the main track. */}
      <PanelBody className="@container">
        {!auth.ready || (feed.signedIn && snapshot === null && feed.loading) ? (
          <div className="p-4">
            <Loading />
          </div>
        ) : !feed.signedIn ? (
          <EmptyState
            mark="forest"
            title="No wallet connected"
            body="Connect or create a wallet to view your assets."
            action={
              auth.available ? (
                <Button size="sm" variant="accent" onClick={auth.login}>
                  Connect wallet
                </Button>
              ) : undefined
            }
          />
        ) : view === null || snapshot === null ? (
          <div className="p-4">
            <Unavailable
              tone={feed.unconfigured ? "neutral" : "warning"}
              title={feed.unconfigured ? "Not configured" : "Assets unavailable"}
              body={feed.error ?? "Your accounts could not be read."}
              onRetry={feed.unconfigured ? undefined : feed.refetch}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            <AssetsHeader
              scopes={scopes}
              scope={scope}
              onScopeChange={setScope}
              fetchedAt={feed.fetchedAt}
              refreshing={feed.loading}
              onRefresh={feed.refetch}
            />

            {feed.stale && (
              <div className="px-1">
                <Unavailable
                  tone="warning"
                  title="Showing the last good reading"
                  body={`${feed.error ?? "The refresh failed."} Figures below are from the previous successful read.`}
                  onRetry={feed.refetch}
                />
              </div>
            )}

            <div className="flex flex-col gap-3 px-4 pb-4">
              {/* Asset Overview — 65/35 at width, stacked below it. */}
              <div className="grid grid-cols-1 gap-2.5 @[52rem]:grid-cols-[1.6fr_1fr]">
                <TotalEquityCard
                  totalUsd={snapshot.summary.totalValueUsd}
                  availableUsd={snapshot.summary.availableCapitalUsd}
                  change={change}
                  partial={snapshot.partial}
                  accountCount={accounts.filter((a) => a.status === "ready").length}
                  address={walletAddress}
                />
                <WalletAllocationCard accounts={accounts} />
              </div>

              <AssetAccountsGrid
                accounts={accounts}
                scope={scope}
                onScopeChange={setScope}
              />

              {funded ? (
                <AssetWorkspace
                  snapshot={view}
                  scopeLabel={scopeLabel}
                  onRetry={feed.refetch}
                />
              ) : (
                <EmptyState
                  icon={Wallet}
                  title="No assets yet"
                  body="Fund this wallet to start using Elyra. Balances, positions and activity appear here once it holds something."
                  action={<DepositOnlyButton address={walletAddress} />}
                  className="rounded-card border border-border-subtle bg-surface-panel py-10"
                />
              )}
            </div>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
