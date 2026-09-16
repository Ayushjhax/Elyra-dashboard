"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { BalancesTable, HistoryTable, PositionsTable } from "@/components/assets/tables";
import {
  Card,
  Segmented,
  SkeletonRows,
  Unavailable,
} from "@/components/portfolio/primitives";
import { venueLabel, type BalanceGrouping } from "@/lib/assets/derive";
import { useWalletActivity } from "@/lib/wallet/useWalletActivity";
import { cn } from "@/lib/utils";
import type { PortfolioSnapshot, SourceNote } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   The lower half: one panel, four tabs.

   Every tab that cannot be filled explains itself from the snapshot's own
   notes, so "Hyperliquid is down" and "Elyra has no order system" never
   render the same way. That distinction is carried from the server in
   `SourceNote.kind` precisely so this component does not have to guess it.

   Filters live with the table they affect rather than above the whole page
   (§20), and a tab switch is a pure render over data already held — nothing
   here refetches.
--------------------------------------------------------------------------- */

const TABS = [
  { value: "balances", label: "Balances" },
  { value: "positions", label: "Positions" },
  { value: "orders", label: "Orders" },
  { value: "history", label: "History" },
] as const;

type Tab = (typeof TABS)[number]["value"];

const GROUPINGS = [
  { value: "asset", label: "Asset" },
  { value: "account", label: "Account" },
] as const;

/** Position categories. Only Perps has a venue behind it today. */
const POSITION_FILTERS = [
  { value: "all", label: "All" },
  { value: "perps", label: "Perps" },
  { value: "prediction", label: "Prediction" },
] as const;

type PositionFilter = (typeof POSITION_FILTERS)[number]["value"];

const HISTORY_FILTERS = [
  { value: "all", label: "All activity" },
  { value: "transfers", label: "Transfers" },
] as const;

type HistoryFilter = (typeof HISTORY_FILTERS)[number]["value"];

function noteFor(notes: SourceNote[], scope: string): SourceNote | undefined {
  return notes.find((note) => note.scope === scope);
}

/** A tab with nothing in it, explained by whichever note applies. */
function EmptyTab({
  note,
  title,
  body,
  onRetry,
}: {
  note: SourceNote | undefined;
  title: string;
  body: string;
  onRetry: () => void;
}) {
  if (note?.kind === "failed") {
    return (
      <Unavailable
        tone="warning"
        title={`${note.scope} unavailable`}
        body={`${note.reason} Other account data is up to date.`}
        onRetry={onRetry}
      />
    );
  }
  return <Unavailable title={title} body={note?.kind === "missing" ? note.reason : body} />;
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2">
      {children}
    </div>
  );
}

export function AssetWorkspace({
  snapshot,
  scopeLabel,
  onRetry,
}: {
  snapshot: PortfolioSnapshot;
  /** The account filter currently applied, for the "showing" note. */
  scopeLabel: string | null;
  onRetry: () => void;
}) {
  const [tab, setTab] = useState<Tab>("balances");
  const [grouping, setGrouping] = useState<BalanceGrouping>("asset");
  const [query, setQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");

  /* The same wallet feed the rest of the app polls — not a second endpoint. */
  const activity = useWalletActivity(25);

  const balances = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length === 0) return snapshot.spot;
    return snapshot.spot.filter(
      (holding) =>
        holding.symbol.toLowerCase().includes(term) ||
        (holding.name ?? "").toLowerCase().includes(term) ||
        venueLabel(holding.venue).toLowerCase().includes(term),
    );
  }, [snapshot.spot, query]);

  const positions = positionFilter === "prediction" ? [] : snapshot.perps;

  return (
    <Card className="min-w-0">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle px-3 py-1.5">
        <Segmented label="Assets workspace" options={TABS} value={tab} onChange={setTab} />
        {scopeLabel !== null && (
          <span className="type-label ml-auto shrink-0 rounded-chip border border-accent-quiet px-1.5 py-0.5 text-accent">
            {scopeLabel}
          </span>
        )}
      </div>

      {tab === "balances" && (
        <>
          <Toolbar>
            <label className="relative flex min-w-0 flex-1 items-center @[34rem]:max-w-56">
              <Search
                size={12}
                strokeWidth={1.5}
                aria-hidden
                className="pointer-events-none absolute left-2 text-text-muted"
              />
              <span className="sr-only">Search assets</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search assets…"
                className={cn(
                  "type-label h-7 w-full rounded-control border border-border-subtle bg-surface-raised",
                  "pl-6 pr-2 text-text-primary placeholder:text-text-muted",
                  "transition-colors duration-[var(--dur-fast)] ease-brand",
                  "hover:border-border-strong focus:border-border-strong",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                )}
              />
            </label>

            <span className="type-label ml-auto shrink-0 text-text-muted">Group by</span>
            <Segmented
              label="Group balances"
              options={GROUPINGS}
              value={grouping}
              onChange={setGrouping}
            />
          </Toolbar>

          {balances.length === 0 ? (
            query.trim().length > 0 ? (
              <Unavailable
                title="No match"
                body={`Nothing held matches “${query.trim()}”.`}
              />
            ) : (
              <EmptyTab
                note={noteFor(snapshot.notes, "wallet")}
                title="No assets yet"
                body="Fund this wallet to start using Elyra. Balances appear here once it holds something."
                onRetry={onRetry}
              />
            )
          ) : (
            <BalancesTable holdings={balances} grouping={grouping} />
          )}
        </>
      )}

      {tab === "positions" && (
        <>
          <Toolbar>
            <Segmented
              label="Position type"
              options={POSITION_FILTERS}
              value={positionFilter}
              onChange={setPositionFilter}
            />
          </Toolbar>

          {positionFilter === "prediction" ? (
            <Unavailable
              title="No prediction positions"
              body="No prediction-market venue is connected to Elyra yet, so there is nothing to read."
            />
          ) : positions.length === 0 ? (
            <EmptyTab
              note={noteFor(snapshot.notes, "venues") ?? noteFor(snapshot.notes, "hyperliquid")}
              title="No active positions"
              body="Open positions at connected venues appear here."
              onRetry={onRetry}
            />
          ) : (
            <PositionsTable positions={positions} />
          )}
        </>
      )}

      {tab === "orders" && (
        <EmptyTab
          note={noteFor(snapshot.notes, "orders")}
          title="No open orders"
          body="Resting limit and trigger orders appear here."
          onRetry={onRetry}
        />
      )}

      {tab === "history" && (
        <>
          <Toolbar>
            <Segmented
              label="Activity type"
              options={HISTORY_FILTERS}
              value={historyFilter}
              onChange={setHistoryFilter}
            />
            {/* Deposits, swaps, trades and funding are not offered as filters:
                the activity feed returns signatures without decoding what each
                one did, so a "Swaps" filter could only ever return nothing and
                would read as "you have never swapped". */}
            <span className="type-label ml-auto text-text-muted">
              On-chain, newest first
            </span>
          </Toolbar>

          {activity.unconfigured ? (
            <Unavailable
              title="Activity unavailable"
              body="SOLANA_RPC_URL is not set, so transaction history cannot be read."
            />
          ) : activity.error !== null ? (
            <Unavailable
              tone="warning"
              title="Activity unavailable"
              body={`${activity.error} Other account data is up to date.`}
              onRetry={activity.refetch}
            />
          ) : activity.isLoading ? (
            <SkeletonRows rows={5} />
          ) : activity.items.length === 0 ? (
            <Unavailable
              title="No account activity yet"
              body="Transactions from this wallet appear here as they confirm."
            />
          ) : (
            <HistoryTable items={activity.items} />
          )}
        </>
      )}
    </Card>
  );
}

export function AssetWorkspaceSkeleton() {
  return (
    <Card className="min-w-0">
      <div className="flex gap-2 border-b border-border-subtle px-3 py-2.5">
        {TABS.map((tab) => (
          <span key={tab.value} className="type-label px-2 text-text-muted">
            {tab.label}
          </span>
        ))}
      </div>
      <SkeletonRows rows={6} />
    </Card>
  );
}
