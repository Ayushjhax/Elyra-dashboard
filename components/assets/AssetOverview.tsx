"use client";

import { AlertTriangle } from "lucide-react";
import { AssetActionBar } from "@/components/assets/ActionDialogs";
import { AccountStatus } from "@/components/assets/primitives";
import {
  Card,
  CardHead,
  Delta,
  Money,
  ShareBar,
  Skeleton,
} from "@/components/portfolio/primitives";
import { allocationRows, syncSummary, type Change24h } from "@/lib/assets/derive";
import type { AssetAccount } from "@/lib/assets/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Asset Overview — the page's opening statement.

   Two cards, 65/35 at width and stacked below it. The Total Equity card is
   the only surface on this page carrying a gradient (§9), and it is a dark
   Forest one: a radial of Elyra Green from the top-left over near-black,
   with a single lime hairline along the top edge. Everything else on the
   page stays solid, which is what makes this one read as the primary
   object rather than as one of six decorated boxes.
--------------------------------------------------------------------------- */

export function TotalEquityCard({
  totalUsd,
  availableUsd,
  change,
  partial,
  accountCount,
  address,
}: {
  totalUsd: number | null;
  availableUsd: number | null;
  change: Change24h | null;
  partial: boolean;
  accountCount: number;
  address: string | null;
}) {
  return (
    <section
      aria-label="Total equity"
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-card",
        "border border-border-subtle bg-surface-panel",
      )}
    >

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <span className="type-label flex items-center gap-1.5 uppercase tracking-[0.08em] text-text-muted">
            Total equity
            {partial && (
              <span className="type-label flex items-center gap-1 rounded-chip border border-negative/40 px-1.5 py-0.5 text-negative">
                <AlertTriangle size={9} strokeWidth={2} aria-hidden />
                Partial data
              </span>
            )}
          </span>

          <Money
            value={totalUsd}
            reason="No source returned a value that could be totalled."
            className="type-price text-text-primary"
          />

          <span className="type-label flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {change === null ? (
              <span className="text-text-muted">
                No 24h price for anything held — change cannot be computed
              </span>
            ) : (
              <>
                <Delta pct={change.pnlPct} usd={change.pnlUsd} />
                <span className="text-text-muted">today</span>
                {change.coveragePct < 95 && (
                  <span className="text-text-muted">
                    · over {change.coveragePct.toFixed(0)}% of value
                  </span>
                )}
              </>
            )}
          </span>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="type-label uppercase tracking-[0.08em] text-text-muted">
                Available to deploy
              </span>
              <Money
                value={availableUsd}
                reason="No stablecoin balance or venue collateral was readable."
                className="type-data text-text-primary"
              />
            </div>
            {accountCount > 0 && (
              <span className="type-label text-text-muted">
                Across {accountCount} account{accountCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <AssetActionBar address={address} />
        </div>
      </div>
    </section>
  );
}

export function TotalEquityCardSkeleton() {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-card border border-border-subtle bg-surface-panel p-4">
      <Skeleton className="h-2.5 w-24" />
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-2.5 w-36" />
      <div className="mt-auto flex flex-col gap-3">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-1.5">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-8 flex-1" />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Wallet Allocation
--------------------------------------------------------------------------- */

export function WalletAllocationCard({ accounts }: { accounts: AssetAccount[] }) {
  const rows = allocationRows(accounts);
  const sync = syncSummary(accounts);

  return (
    <Card className="min-w-0">
      <CardHead title="Wallet Allocation" sub="Where your capital currently lives" />

      {rows.length === 0 ? (
        <p className="type-label px-4 py-6 text-center text-text-muted">
          No account is holding a readable balance yet.
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-2.5 p-4">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="type-data-sm min-w-0 flex-1 truncate text-text-primary">
                  {row.label}
                </span>
                <span className="type-data-sm shrink-0 tabular-nums text-text-secondary">
                  {row.allocationPct === null ? "—" : `${row.allocationPct.toFixed(1)}%`}
                </span>
                <Money
                  value={row.valueUsd}
                  compact
                  className="type-data-sm w-16 shrink-0 text-right text-text-muted"
                />
              </div>
              <ShareBar pct={row.allocationPct ?? 0} />
            </li>
          ))}
        </ul>
      )}

      {/* §10 Section B: how much of the picture this actually is. */}
      <footer className="mt-auto flex flex-col gap-1 border-t border-border-subtle px-4 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="type-label text-text-muted">
            {sync.ready} of {sync.total} accounts synced
          </span>
          <AccountStatus status={sync.failed.length > 0 ? "error" : "ready"} />
        </div>
        {sync.failed.length > 0 && (
          <p className="type-label text-negative">{sync.failed.join(", ")} unavailable</p>
        )}
        {sync.unintegrated.length > 0 && (
          <p className="type-label text-text-muted">
            {sync.unintegrated.join(", ")} not connected yet
          </p>
        )}
      </footer>
    </Card>
  );
}

export function WalletAllocationCardSkeleton() {
  return (
    <Card className="min-w-0">
      <CardHead title="Wallet Allocation" sub="Where your capital currently lives" />
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="ml-auto h-2.5 w-12" />
            </div>
            <Skeleton className="h-0.5 w-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}
