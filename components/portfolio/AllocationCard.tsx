"use client";

import { useMemo, useState } from "react";
import { Card, CardHead, Money, Segmented, ShareBar, Skeleton } from "@/components/portfolio/primitives";
import { CoinMark } from "@/components/ui/CoinMark";
import { allocationFor, availableModes } from "@/lib/portfolio/derive";
import type { AllocationMode, PortfolioSnapshot } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   Where the capital sits.

   Ranked rows with a thin share bar, not a donut. §12 asks for this directly,
   and it is the right call independently: a donut compares slices to the
   whole, which is one comparison, while a ranked list also gives order,
   exact share and exact value at a glance — and stays readable at 220px,
   which a donut with six labels does not.

   A mode with fewer than two buckets is not offered. `availableModes` decides
   that from the data, so a Solana-only wallet never sees a Chain tab reading
   "Solana 100%" — a control that looks like an insight and contains none.
--------------------------------------------------------------------------- */

const LABELS: Record<AllocationMode, string> = {
  asset: "Asset",
  venue: "Venue",
  strategy: "Strategy",
  chain: "Chain",
};

export function AllocationCardSkeleton() {
  return (
    <Card>
      <CardHead title="Allocation" />
      <div className="flex flex-col gap-3 p-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded-pill" />
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="ml-auto h-2.5 w-14" />
            </div>
            <Skeleton className="h-0.5 w-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AllocationCard({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const modes = useMemo(() => availableModes(snapshot), [snapshot]);
  const [mode, setMode] = useState<AllocationMode>("asset");

  /* The stored mode may stop existing — a venue disconnects, a chain empties
     — so the effective mode is always one the data still supports. Derived
     rather than corrected in an effect, which would be a render-phase write
     chasing its own state. */
  const active = modes.includes(mode) ? mode : (modes[0] ?? "asset");
  const rows = useMemo(() => allocationFor(snapshot, active), [snapshot, active]);

  return (
    <Card className="min-w-0">
      <CardHead
        title="Allocation"
        right={
          modes.length > 1 ? (
            <Segmented
              label="Allocation breakdown"
              options={modes.map((entry) => ({ value: entry, label: LABELS[entry] }))}
              value={active}
              onChange={setMode}
            />
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <p className="type-label px-3 py-6 text-center text-text-muted">
          Allocation needs at least two priced holdings to compare.
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-2.5 p-3">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {active === "asset" && (
                  <CoinMark symbol={row.label} logo={row.logo} size={16} />
                )}
                <span className="type-data-sm min-w-0 flex-1 truncate text-text-primary">
                  {row.label}
                </span>
                <span className="type-data-sm shrink-0 tabular-nums text-text-secondary">
                  {row.pct.toFixed(1)}%
                </span>
                <Money
                  value={row.valueUsd}
                  compact
                  className="type-data-sm w-16 shrink-0 text-right text-text-muted"
                />
              </div>
              <ShareBar pct={row.pct} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
