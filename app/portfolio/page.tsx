"use client";

import { useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { AllocationCard, AllocationCardSkeleton } from "@/components/portfolio/AllocationCard";
import { KpiStrip, KpiStripSkeleton } from "@/components/portfolio/KpiStrip";
import {
  CapitalHealthCard,
  ElyraBriefCard,
  RecentActivityCard,
} from "@/components/portfolio/LowerGrid";
import { PerformanceCard, PerformanceCardSkeleton } from "@/components/portfolio/PerformanceCard";
import {
  PositionsWorkspace,
  PositionsWorkspaceSkeleton,
} from "@/components/portfolio/PositionsWorkspace";
import { PortfolioHeader } from "@/components/portfolio/PortfolioHeader";
import { Unavailable } from "@/components/portfolio/primitives";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { RouteClose } from "@/components/shell/RouteClose";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   Capital Overview.

   Renders in the route column beside the chart, like every other route — the
   chart is mounted by the shell and is never replaced. That is the binding
   constraint on this whole design: the column is 220–640px and resizable, so
   the page cannot assume a 1440px canvas and cannot take the middle column.

   Which is why every breakpoint here is a CONTAINER query, not a media
   query. The panel's width changes when the operator drags a handle, with
   the viewport unchanged — `@[44rem]` asks the only question that matters
   ("how much room do I actually have"), and the same page reads correctly at
   240px and at 640px without a second layout.

   Reading order is §8's: net worth → performance → allocation → positions →
   risk → activity. At width the analytics and lower rows go two-up; narrow,
   everything stacks in that same order.
--------------------------------------------------------------------------- */

/** Scope is a filter over data already held — see the route's own note. */
function scoped(snapshot: PortfolioSnapshot, scope: string): PortfolioSnapshot {
  if (scope === "all") return snapshot;
  return {
    ...snapshot,
    spot: snapshot.spot.filter(
      (holding) => holding.venue === scope || holding.id.startsWith(`${scope}:`),
    ),
    perps: snapshot.perps.filter((position) => position.venue === scope),
  };
}

function Loading() {
  return (
    <div className="flex flex-col gap-2.5">
      <KpiStripSkeleton />
      <div className="grid grid-cols-1 gap-2.5 @[44rem]:grid-cols-[1.7fr_1fr]">
        <PerformanceCardSkeleton />
        <AllocationCardSkeleton />
      </div>
      <PositionsWorkspaceSkeleton />
    </div>
  );
}

export default function PortfolioPage() {
  const auth = useElyraAuth();
  const feed = usePortfolio();
  const [scope, setScope] = useState("all");

  const view = useMemo(
    () => (feed.snapshot === null ? null : scoped(feed.snapshot, scope)),
    [feed.snapshot, scope],
  );

  const empty =
    view !== null && view.spot.length === 0 && view.perps.length === 0 && !view.partial;

  return (
    <Panel label="Portfolio" className="min-h-0 flex-1">
      <PanelHeader>
        <Eyebrow>Portfolio</Eyebrow>
        <RouteClose />
      </PanelHeader>

      {/* The container every `@[…]` below measures against. */}
      <PanelBody className="@container">
        {!auth.ready || (feed.signedIn && feed.snapshot === null && feed.loading) ? (
          <div className="p-3">
            <Loading />
          </div>
        ) : !feed.signedIn ? (
          <EmptyState
            title="No wallet connected"
            body="Connect or create a wallet to view your portfolio."
            action={
              auth.available ? (
                <Button size="sm" onClick={auth.login}>
                  Connect wallet
                </Button>
              ) : undefined
            }
          />
        ) : view === null ? (
          <div className="flex flex-col gap-2 p-3">
            <Unavailable
              tone={feed.unconfigured ? "neutral" : "warning"}
              title={feed.unconfigured ? "Not configured" : "Portfolio unavailable"}
              body={feed.error ?? "The portfolio could not be assembled."}
              onRetry={feed.unconfigured ? undefined : feed.refetch}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            <PortfolioHeader
              scopes={view.scopes}
              scope={scope}
              onScopeChange={setScope}
              fetchedAt={feed.fetchedAt}
              refreshing={feed.loading}
              onRefresh={feed.refetch}
            />

            {feed.stale && (
              <Unavailable
                tone="warning"
                title="Showing the last good reading"
                body={`${feed.error ?? "The refresh failed."} Figures below are from the previous successful read.`}
                onRetry={feed.refetch}
              />
            )}

            {empty ? (
              <div className="px-3 pb-3">
                <EmptyState
                  icon={Wallet}
                  title="Your portfolio is ready"
                  body="Assets and positions will appear here once this wallet is funded."
                  className="rounded-card border border-border-subtle bg-surface-panel py-10"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 px-3 pb-3">
                <KpiStrip snapshot={view} />

                {/* Performance leads and stays dominant; allocation takes the
                    narrower track and drops below it when the column is not
                    wide enough to hold both. */}
                <div className="grid grid-cols-1 gap-2.5 @[44rem]:grid-cols-[1.7fr_1fr]">
                  <PerformanceCard currentValueUsd={view.summary.totalValueUsd} />
                  <AllocationCard snapshot={view} />
                </div>

                <PositionsWorkspace snapshot={view} onRetry={feed.refetch} />

                <div className="grid grid-cols-1 gap-2.5 @[44rem]:grid-cols-2">
                  <CapitalHealthCard snapshot={view} />
                  <ElyraBriefCard snapshot={view} />
                </div>

                <RecentActivityCard />
              </div>
            )}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
