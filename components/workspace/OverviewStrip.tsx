"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
  RefreshCw,
} from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPct, formatUsd } from "@/lib/format";
import { useOpenActionCount } from "@/lib/actions/useOpenActions";
import { change24h } from "@/lib/portfolio/derive";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";
import { usePortfolioHistory } from "@/lib/portfolio/useHistory";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The account strip: one compact row between the header and the chart.

   Left, the account's own figures from /api/portfolio — the same snapshot the
   Portfolio and Assets pages read, through the same reference-counted store,
   so the strip costs no extra request. Nothing here is a sample: a figure
   that cannot be computed is a dash, a signed-out operator sees an
   invitation, and a genuine zero reads as zero rather than as a dash.

   Right, the workspace's own controls: what is waiting for review, the two
   side columns, and focus. It stays in focus mode, because that is where the
   way out of focus mode lives.
--------------------------------------------------------------------------- */

const MASK = "••••••";
const WIDE = "(min-width: 1280px)";

function subscribeWide(callback: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** Whether the agent is a column at this width. False on the server. */
function useAgentIsColumn(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
}

function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton inline-block", className)} />;
}

/** One figure: a quiet label over the number. */
function Figure({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-center", className)}>
      <span className="type-label whitespace-nowrap text-text-muted">{label}</span>
      <div className="flex min-w-0 items-baseline gap-2">{children}</div>
    </div>
  );
}

/** The 1W history as a line; the label says what it is. */
function Sparkline({ values, rising }: { values: number[]; rising: boolean }) {
  const width = 96;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - 3 - ((value - min) / span) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden
      className={cn("overflow-visible", rising ? "text-positive" : "text-negative")}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Performance({ enabled }: { enabled: boolean }) {
  const history = usePortfolioHistory("1W");
  const values = history.points.map((point) => point.totalValueUsd).filter(Number.isFinite);

  let body: React.ReactNode;
  if (!enabled) {
    body = <span className="type-data text-text-muted">—</span>;
  } else if (history.loading) {
    body = <Skeleton className="h-7 w-24 rounded-control" />;
  } else if (values.length >= 2) {
    body = <Sparkline values={values} rising={values[values.length - 1] >= values[0]} />;
  } else {
    body = <span className="type-label text-text-muted">No history yet</span>;
  }

  return (
    <Figure label="7-day" className="hidden mid:flex">
      {body}
    </Figure>
  );
}

function positionCount(snapshot: PortfolioSnapshot) {
  return (
    snapshot.spot.length +
    snapshot.perps.length +
    snapshot.defi.length +
    (snapshot.prediction.activeMarkets ?? 0)
  );
}

function AccountFigures() {
  const auth = useElyraAuth();
  const feed = usePortfolio();
  const hidden = useElyraStore((state) => state.balancesHidden);
  const snapshot = feed.snapshot;
  const change = useMemo(() => (snapshot ? change24h(snapshot) : null), [snapshot]);

  if (!auth.available || (auth.ready && !auth.authenticated)) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <p className="type-body-sm text-text-secondary">
          {auth.available
            ? "Connect a wallet to see your portfolio, balance and positions."
            : "Sign-in is not configured (NEXT_PUBLIC_PRIVY_APP_ID)."}
        </p>
        {auth.available && (
          <Button size="sm" variant="accent" onClick={auth.login}>
            Connect wallet
          </Button>
        )}
      </div>
    );
  }

  if (feed.unconfigured) {
    return (
      <p className="type-body-sm text-text-secondary">
        Balances are not configured: SOLANA_RPC_URL is not set on the server.
      </p>
    );
  }

  if (snapshot === null && feed.error !== null && !feed.loading) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <AlertTriangle size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-negative" />
        <p className="type-body-sm min-w-0 truncate text-text-secondary" title={feed.error}>
          Portfolio unavailable — {feed.error}
        </p>
        <Button size="sm" variant="quiet" onClick={feed.refetch}>
          <RefreshCw size={13} strokeWidth={1.5} aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  const summary = snapshot?.summary ?? null;
  const notes = [feed.stale && "last known values", snapshot?.partial && "some sources failed"].filter(
    (note): note is string => typeof note === "string",
  );

  return (
    <div className="flex min-w-0 items-center gap-x-6">
      <Figure label="Portfolio value">
        {summary === null ? (
          <Skeleton className="h-6 w-28" />
        ) : (
          <span className="font-sans text-[20px] font-semibold leading-7 tabular-nums text-text-primary">
            {summary.totalValueUsd === null ? "—" : hidden ? MASK : formatUsd(summary.totalValueUsd)}
          </span>
        )}
        {change !== null && (
          <span
            title={
              change.coveragePct < 99
                ? `24h change over the ${Math.round(change.coveragePct)}% of value with a price history`
                : "24h change"
            }
            className={cn(
              "type-data-sm flex items-center gap-0.5 whitespace-nowrap",
              change.pnlUsd >= 0 ? "text-positive" : "text-negative",
            )}
          >
            {change.pnlUsd >= 0 ? (
              <ArrowUpRight size={13} strokeWidth={1.5} aria-hidden />
            ) : (
              <ArrowDownRight size={13} strokeWidth={1.5} aria-hidden />
            )}
            {hidden ? MASK : formatUsd(change.pnlUsd, { sign: true })} ({formatPct(change.pnlPct)})
          </span>
        )}
        {notes.length > 0 && (
          <span title={notes.join(", ")} className="text-text-muted">
            <AlertTriangle size={12} strokeWidth={1.5} aria-label={notes.join(", ")} />
          </span>
        )}
      </Figure>

      <span aria-hidden className="hidden h-8 w-px bg-border-subtle compact:block" />

      <Figure label="Available" className="hidden compact:flex">
        {summary === null ? (
          <Skeleton className="h-5 w-20" />
        ) : (
          <span className="type-data whitespace-nowrap text-text-primary">
            {summary.availableCapitalUsd === null
              ? "—"
              : hidden
                ? MASK
                : formatUsd(summary.availableCapitalUsd)}
          </span>
        )}
      </Figure>

      <span aria-hidden className="hidden h-8 w-px bg-border-subtle compact:block" />

      <Figure label="Open positions" className="hidden compact:flex">
        {snapshot === null ? (
          <Skeleton className="h-5 w-8" />
        ) : (
          <span className="type-data text-text-primary">{positionCount(snapshot)}</span>
        )}
      </Figure>

      <span aria-hidden className="hidden h-8 w-px bg-border-subtle mid:block" />

      <Performance enabled={snapshot !== null} />
    </div>
  );
}

function Toggle({
  pressed,
  label,
  onClick,
  className,
  children,
}: {
  pressed: boolean;
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={pressed}
          aria-label={label}
          onClick={onClick}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-control",
            "transition-colors duration-[var(--dur-fast)] ease-brand",
            pressed
              ? "bg-surface-active text-accent"
              : "text-text-muted hover:bg-surface-hover hover:text-text-primary",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/** "1 action awaiting review" — opens the agent on the review card. */
function PendingBadge() {
  const reviewPendingActions = useElyraStore((state) => state.reviewPendingActions);
  const count = useOpenActionCount();
  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={reviewPendingActions}
      className={cn(
        "type-label inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-pill border border-accent-quiet px-3",
        "text-text-primary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-pill bg-agent-accent" />
      {count} {count === 1 ? "action" : "actions"} awaiting review
    </button>
  );
}

export function OverviewStrip({ focus }: { focus: boolean }) {
  const widgetsOpen = useElyraStore((state) => state.widgetsOpen);
  const setWidgetsOpen = useElyraStore((state) => state.setWidgetsOpen);
  const agentOpen = useElyraStore((state) => state.agentOpen);
  const setAgentOpen = useElyraStore((state) => state.setAgentOpen);
  const agentDrawerOpen = useElyraStore((state) => state.agentDrawerOpen);
  const setAgentDrawerOpen = useElyraStore((state) => state.setAgentDrawerOpen);
  const setFocusMode = useElyraStore((state) => state.setFocusMode);
  const agentIsColumn = useAgentIsColumn();
  const agentShown = agentIsColumn ? agentOpen : agentDrawerOpen;

  return (
    <section
      aria-label="Account overview"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-panel border border-border-subtle bg-surface-panel px-4 py-2.5"
    >
      <AccountFigures />

      <div className="flex flex-wrap items-center gap-2">
        <PendingBadge />

        {!focus && (
          <div role="group" aria-label="Workspace columns" className="flex items-center gap-0.5">
            {/* Below 900px the widgets stack under the chart, so there is
                nothing to switch. */}
            <Toggle
              pressed={widgetsOpen}
              label={widgetsOpen ? "Hide widgets" : "Show widgets"}
              onClick={() => setWidgetsOpen(!widgetsOpen)}
              className="hidden mid:inline-flex"
            >
              <PanelLeft size={16} strokeWidth={1.5} aria-hidden />
            </Toggle>
            <Toggle
              pressed={agentShown}
              label={agentShown ? "Hide Elyra" : "Show Elyra"}
              onClick={() =>
                agentIsColumn ? setAgentOpen(!agentOpen) : setAgentDrawerOpen(!agentDrawerOpen)
              }
            >
              <PanelRight size={16} strokeWidth={1.5} aria-hidden />
            </Toggle>
          </div>
        )}

        <button
          type="button"
          aria-pressed={focus}
          onClick={() => setFocusMode(!focus)}
          className={cn(
            "type-label inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-control border px-3",
            "transition-colors duration-[var(--dur-fast)] ease-brand",
            focus
              ? "border-accent-quiet bg-surface-active text-text-primary"
              : "border-border-subtle text-text-primary hover:bg-surface-hover",
          )}
        >
          {focus ? (
            <Minimize2 size={14} strokeWidth={1.5} aria-hidden />
          ) : (
            <Maximize2 size={14} strokeWidth={1.5} aria-hidden />
          )}
          {focus ? "Exit focus" : "Focus chart"}
        </button>
      </div>
    </section>
  );
}
