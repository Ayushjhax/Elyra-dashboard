"use client";

import { Delta, Hint, Money, Skeleton } from "@/components/portfolio/primitives";
import { change24h } from "@/lib/portfolio/derive";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Five figures, one panel.

   §10 asks for a strip rather than five independent cards, and for net value
   to dominate without becoming a hero. It gets `type-price` and its own row;
   the other four sit under it in a grid that goes two-up in a narrow column
   and four-up in a wide one — container queries, because this page lives in
   a resizable shell column and the viewport says nothing useful about how
   much room it actually has.

   Every metric that cannot be computed renders an em dash with a hint saying
   why. Three of the five are in that state today, which is the honest
   picture of what this product can currently measure — and a far better one
   than five confident numbers, two of them invented.
--------------------------------------------------------------------------- */

function Metric({
  label,
  hint,
  children,
  sub,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 px-3 py-2.5", className)}>
      <span className="type-label flex items-center gap-1 text-text-muted">
        <span className="truncate uppercase tracking-[0.08em]">{label}</span>
        {hint !== undefined && <Hint text={hint} />}
      </span>
      <span className="type-data truncate text-text-primary">{children}</span>
      {sub !== undefined && <span className="type-label truncate">{sub}</span>}
    </div>
  );
}

export function KpiStripSkeleton() {
  return (
    <div className="rim rounded-card border border-border-subtle bg-surface-panel">
      <div className="flex flex-col gap-1.5 border-b border-border-subtle px-3 py-3">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-2.5 w-32" />
      </div>
      <div className="grid grid-cols-2 @[30rem]:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5 px-3 py-2.5">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function KpiStrip({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const { summary } = snapshot;
  const change = change24h(snapshot);

  return (
    <section
      aria-label="Portfolio summary"
      className="rim relative isolate overflow-hidden rounded-card border border-border-subtle bg-surface-panel"
    >
      {/* §7: a faint lime bloom behind the total, as ambient depth only. It
          sits on its own layer behind the text and lightens the surface by a
          few percent at its core — far below where --text-muted stops
          clearing 4.5:1 on this panel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-0 -z-10 h-40 w-64 rounded-full opacity-[0.07] blur-3xl"
        style={{ background: "var(--accent)" }}
      />

      <div className="flex flex-col gap-0.5 border-b border-border-subtle px-3 py-3">
        <span className="type-label flex items-center gap-1 uppercase tracking-[0.08em] text-text-muted">
          Net portfolio value
          {snapshot.partial && (
            <Hint text="One or more sources could not be read, so this total is of what was readable — not of everything held." />
          )}
        </span>
        <Money
          value={summary.totalValueUsd}
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
          {snapshot.partial && <span className="text-negative">· partial data</span>}
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-border-subtle @[30rem]:grid-cols-4 @[30rem]:divide-y-0">
        <Metric
          label="Available"
          hint="Stablecoins held plus free collateral at connected venues. What could be deployed without selling anything."
        >
          <Money
            value={summary.availableCapitalUsd}
            reason="No stablecoin balance or venue collateral was readable."
          />
        </Metric>

        <Metric
          label="Unrealized PnL"
          hint="Open-position PnL as each venue reports it. Wallet holdings are excluded: no cost basis is recorded for them yet."
        >
          <Money
            value={summary.unrealizedPnlUsd}
            reason="No venue reported an unrealized PnL figure."
            sign
            className={cn(
              summary.unrealizedPnlUsd === null
                ? undefined
                : summary.unrealizedPnlUsd >= 0
                  ? "text-positive"
                  : "text-negative",
            )}
          />
        </Metric>

        <Metric
          label="24H PnL"
          hint="Computed from 24h price moves on holdings a market source prices. Deposits and withdrawals are not netted out."
        >
          <Money
            value={change?.pnlUsd ?? null}
            reason="Nothing held carries a 24h price."
            sign
            className={cn(
              change === null
                ? undefined
                : change.pnlUsd >= 0
                  ? "text-positive"
                  : "text-negative",
            )}
          />
        </Metric>

        <Metric
          label="Agent exposure"
          hint="Capital under agent-managed strategies. Elyra runs none against live capital yet, so there is nothing to report."
          sub={
            summary.agentManagedPct === null ? (
              <span className="text-text-muted">none active</span>
            ) : (
              <Money value={summary.agentManagedValueUsd} reason="Not reported" />
            )
          }
        >
          {summary.agentManagedPct === null ? (
            <span className="text-text-muted">—</span>
          ) : (
            <span className="tabular-nums">{summary.agentManagedPct.toFixed(1)}%</span>
          )}
        </Metric>
      </div>
    </section>
  );
}
