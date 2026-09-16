"use client";

import { useState } from "react";
import { Card, Money, Segmented, SkeletonRows, Unavailable } from "@/components/portfolio/primitives";
import { PerpsTable, SpotTable } from "@/components/portfolio/tables";
import { sumValued } from "@/lib/portfolio/derive";
import type { PortfolioSnapshot, SourceNote } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   The operational half of the page.

   One workspace with tabs rather than four stacked full-width modules: in a
   column this narrow, four tables one under another is a scroll, not a view.
   §14's "do not create three giant independent modules if a compact grouped
   table reads better" applies to the whole section, not just Overview.

   Every tab that has no data explains itself from the snapshot's own notes,
   so "Kamino is down" and "Elyra has no Kamino integration" never render the
   same way. That distinction is carried from the server in `SourceNote.kind`
   precisely so this component does not have to guess it.
--------------------------------------------------------------------------- */

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "spot", label: "Spot" },
  { value: "perps", label: "Perps" },
  { value: "defi", label: "DeFi" },
  { value: "orders", label: "Orders" },
] as const;

type Tab = (typeof TABS)[number]["value"];

function noteFor(notes: SourceNote[], scope: string): SourceNote | undefined {
  return notes.find((note) => note.scope === scope);
}

/** A tab with nothing in it, explained by whichever note applies. */
function EmptyTab({
  note,
  emptyTitle,
  emptyBody,
  onRetry,
}: {
  note: SourceNote | undefined;
  emptyTitle: string;
  emptyBody: string;
  onRetry: () => void;
}) {
  if (note?.kind === "failed") {
    return (
      <Unavailable
        tone="warning"
        title={`${note.scope} unavailable`}
        body={`${note.reason} Other portfolio data is up to date.`}
        onRetry={onRetry}
      />
    );
  }

  return (
    <Unavailable
      title={emptyTitle}
      body={note?.kind === "missing" ? note.reason : emptyBody}
    />
  );
}

function GroupHead({
  label,
  count,
  valueUsd,
  onViewAll,
}: {
  label: string;
  count: number;
  valueUsd: number | null;
  onViewAll?: () => void;
}) {
  return (
    <div className="flex items-baseline gap-2 border-b border-border-subtle px-2 py-1.5">
      <span className="type-label uppercase tracking-[0.08em] text-text-secondary">
        {label}
      </span>
      <span className="type-label text-text-muted">{count}</span>
      <Money
        value={valueUsd}
        reason="Nothing in this group carries a value."
        className="type-data-sm ml-auto text-text-secondary"
      />
      {onViewAll !== undefined && count > 0 && (
        <button
          type="button"
          onClick={onViewAll}
          className="type-label rounded-chip px-1 text-text-muted transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          View all
        </button>
      )}
    </div>
  );
}

export function PositionsWorkspaceSkeleton() {
  return (
    <Card>
      <div className="flex gap-1 border-b border-border-subtle px-2 py-2">
        {TABS.map((tab) => (
          <span key={tab.value} className="type-label px-2 text-text-muted">
            {tab.label}
          </span>
        ))}
      </div>
      <SkeletonRows rows={5} />
    </Card>
  );
}

export function PositionsWorkspace({
  snapshot,
  onRetry,
}: {
  snapshot: PortfolioSnapshot;
  onRetry: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  const spotValue = sumValued(snapshot.spot.filter((holding) => holding.verified));
  const perpValue = snapshot.perps.reduce(
    (sum, position) => sum + (position.marginUsd ?? 0) + (position.unrealizedPnlUsd ?? 0),
    0,
  );

  const topSpot = [...snapshot.spot]
    .filter((holding) => holding.verified)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
    .slice(0, 4);

  return (
    <Card className="min-w-0">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle px-2 py-1.5">
        <Segmented label="Positions" options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === "overview" && (
        <div className="flex flex-col">
          <GroupHead
            label="Spot"
            count={snapshot.spot.length}
            valueUsd={spotValue}
            onViewAll={() => setTab("spot")}
          />
          {topSpot.length === 0 ? (
            <p className="type-label px-2 py-4 text-center text-text-muted">
              No spot holdings.
            </p>
          ) : (
            <SpotTable holdings={topSpot} />
          )}

          <GroupHead
            label="Perps"
            count={snapshot.perps.length}
            valueUsd={snapshot.perps.length > 0 ? perpValue : null}
            onViewAll={() => setTab("perps")}
          />
          {snapshot.perps.length === 0 ? (
            <p className="type-label px-2 py-4 text-center text-text-muted">
              No open perpetual positions.
            </p>
          ) : (
            <PerpsTable positions={snapshot.perps.slice(0, 3)} />
          )}

          <GroupHead label="DeFi" count={0} valueUsd={null} />
          <p className="type-label px-2 py-4 text-center text-text-muted">
            {noteFor(snapshot.notes, "defi")?.reason ?? "No DeFi positions."}
          </p>
        </div>
      )}

      {tab === "spot" &&
        (snapshot.spot.length === 0 ? (
          <EmptyTab
            note={noteFor(snapshot.notes, "wallet")}
            emptyTitle="No spot holdings"
            emptyBody="Assets will appear here once this wallet is funded."
            onRetry={onRetry}
          />
        ) : (
          <SpotTable holdings={snapshot.spot} />
        ))}

      {tab === "perps" &&
        (snapshot.perps.length === 0 ? (
          <EmptyTab
            note={noteFor(snapshot.notes, "venues") ?? noteFor(snapshot.notes, "hyperliquid")}
            emptyTitle="No open perpetual positions"
            emptyBody="Positions at Hyperliquid and other connected venues appear here."
            onRetry={onRetry}
          />
        ) : (
          <PerpsTable positions={snapshot.perps} />
        ))}

      {tab === "defi" && (
        <EmptyTab
          note={noteFor(snapshot.notes, "defi")}
          emptyTitle="No DeFi positions"
          emptyBody="Lending, LP and yield positions will appear here."
          onRetry={onRetry}
        />
      )}

      {tab === "orders" && (
        <EmptyTab
          note={noteFor(snapshot.notes, "orders")}
          emptyTitle="No open orders"
          emptyBody="Resting limit and trigger orders will appear here."
          onRetry={onRetry}
        />
      )}
    </Card>
  );
}
