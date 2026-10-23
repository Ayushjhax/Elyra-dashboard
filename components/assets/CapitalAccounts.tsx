"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  ChartSpline,
  Database,
  Eye,
  EyeOff,
  Info,
  History,
  RefreshCw,
  Rocket,
  Search,
  SlidersHorizontal,
  Wallet,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { AssetActionBar } from "@/components/assets/ActionDialogs";
import { BalancesTable, HistoryTable, PositionsTable } from "@/components/assets/tables";
import { Delta, Money, useBalancesHidden } from "@/components/portfolio/primitives";
import { ReceiveDialog } from "@/components/portfolio/ReceiveDialog";
import { useElyraAuth, type ElyraAuth } from "@/components/providers/PrivyClientProvider";
import { IconButton, InfoTip, Tip } from "@/components/shell/RouteDrawer";
import { CoinMark } from "@/components/ui/CoinMark";
import { OptionMenu } from "@/components/ui/OptionMenu";
import { Popover } from "@/components/ui/Popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ALL_ACCOUNTS,
  capitalAllocation,
  change24hOf,
  deriveAccounts,
  scopeSnapshot,
  syncSummary,
  venueLabel,
  walletHoldings,
  type BalanceGrouping,
  type CapitalAllocation,
} from "@/lib/assets/derive";
import type { AssetAccount, AssetAccountType } from "@/lib/assets/types";
import { formatAge, formatPct } from "@/lib/format";
import { hyperliquidIcon, useTickerLogos } from "@/lib/market/tickerLogos";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";
import { usePortfolio, type PortfolioFeed } from "@/lib/portfolio/usePortfolio";
import { useElyraStore } from "@/lib/store";
import { useSecond } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { useWalletActivity, type ActivityFeed } from "@/lib/wallet/useWalletActivity";
import { useWalletDashboard, type WalletDashboard } from "@/lib/wallet/useWalletDashboard";

/* ---------------------------------------------------------------------------
   Capital Accounts — balances, venues and capital movement in one place.

   One read: the shared `usePortfolio` snapshot (the same store the header,
   the Portfolio drawer and Capital Intelligence hold open), regrouped into
   four capital accounts by lib/assets/derive.ts. Choosing an account narrows
   every section at once — equity, allocation, the venue cards, holdings,
   positions and activity — as a render over data already held.

   A venue is connected, not connected, not available in Elyra yet, or failed
   to sync, and each looks different: a failed read is never a $0.00.
--------------------------------------------------------------------------- */

const SOL = ["SOL"] as const;

const card = "min-w-0 rounded-panel border border-border-subtle bg-surface-panel";

const outlined = cn(
  "type-body-sm inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control border font-medium",
  "border-border-strong text-text-primary transition-colors duration-[var(--dur-fast)] ease-brand",
  "hover:border-accent-quiet hover:bg-surface-hover active:bg-surface-raised",
);

/* ---------------------------------------------------------------------------
   Header
--------------------------------------------------------------------------- */

function Header({
  feed,
  accounts,
  scope,
  onScope,
}: {
  feed: PortfolioFeed;
  accounts: AssetAccount[];
  scope: string;
  onScope: (scope: string) => void;
}) {
  const hidden = useBalancesHidden();
  const setHidden = useElyraStore((state) => state.setBalancesHidden);
  const now = useSecond();
  const options = [
    { id: ALL_ACCOUNTS, label: "All accounts" },
    ...accounts.filter((entry) => entry.connection === "connected").map((entry) => ({ id: entry.id, label: entry.label })),
  ];

  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 items-center gap-3.5">
        <Database size={34} strokeWidth={1.4} aria-hidden className="shrink-0 text-accent" />
        <div className="min-w-0">
          <h1 className="type-h1 text-text-primary">Capital Accounts</h1>
          <p className="type-body text-text-secondary">Balances, venues, and capital movement in one place.</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <OptionMenu label="Account" options={options} value={scope} onChange={onScope} align="end" className="min-w-36 justify-between" />
          <IconButton
            label={hidden ? "Show balances" : "Hide balances"}
            aria-pressed={hidden}
            onClick={() => setHidden(!hidden)}
            className={cn("size-9 border border-border-subtle", hidden && "text-accent")}
          >
            {hidden ? <EyeOff size={16} strokeWidth={1.5} aria-hidden /> : <Eye size={16} strokeWidth={1.5} aria-hidden />}
          </IconButton>
          <IconButton
            label={feed.refreshing ? "Refreshing balances" : "Refresh balances"}
            onClick={feed.refetch}
            disabled={feed.refreshing}
            className="size-9 border border-border-subtle"
          >
            <RefreshCw size={16} strokeWidth={1.5} aria-hidden className={cn(feed.refreshing && "motion-safe:animate-spin")} />
          </IconButton>
        </div>
        <p className="type-label min-h-4 text-text-secondary" aria-live="polite">
          {feed.refreshing
            ? "Refreshing…"
            : feed.stale
              ? `Refresh failed · showing the reading from ${feed.fetchedAt === null || now === null ? "earlier" : formatAge(feed.fetchedAt, now)}`
              : feed.fetchedAt !== null && now !== null
                ? `Updated ${formatAge(feed.fetchedAt, now)}`
                : ""}
        </p>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------------------
   Equity
--------------------------------------------------------------------------- */

function EquityCard({
  snapshot,
  accounts,
  scope,
  address,
  onExecuted,
}: {
  snapshot: PortfolioSnapshot;
  accounts: AssetAccount[];
  scope: string;
  address: string | null;
  onExecuted: () => void;
}) {
  const sync = syncSummary(accounts);
  const scoped = accounts.find((entry) => entry.id === scope) ?? null;
  const view = scopeSnapshot(snapshot, scope);

  const total = scoped === null ? snapshot.summary.totalValueUsd : scoped.valueUsd;
  const available = scoped === null ? snapshot.summary.availableCapitalUsd : scoped.availableUsd;
  const positions =
    scoped === null
      ? snapshot.perps.length + snapshot.defi.length + (snapshot.prediction.connected ? (snapshot.prediction.activeMarkets ?? 0) : 0)
      : scoped.positions;
  const change = change24hOf(view.spot);
  const nothingHeld =
    total === 0 && view.spot.length === 0 && view.perps.length === 0 && (scoped !== null || snapshot.defi.length === 0);
  const walletFunded = walletHoldings(snapshot).some((holding) => holding.verified && (holding.valueUsd ?? 0) > 0);

  return (
    <section aria-label="Total equity" className={cn(card, "flex flex-col p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-body text-text-primary">{scoped === null ? "Total equity" : `${scoped.label} equity`}</p>
          <Money
            value={total}
            reason={scoped?.errorReason ?? "No source returned a value that could be totalled."}
            className="type-display mt-1 block font-sans text-text-primary"
          />
          <p className="type-body-sm mt-1 text-text-secondary">
            {nothingHeld ? (
              "No performance history yet."
            ) : change === null && scoped !== null && view.spot.length === 0 ? (
              <span className="text-text-muted">24h change is measured for wallet balances.</span>
            ) : change === null ? (
              <span className="text-text-muted">No 24h price for what&rsquo;s held, so change can&rsquo;t be measured.</span>
            ) : (
              <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
                <Delta pct={change.pnlPct} usd={change.pnlUsd} />
                <span>past 24h</span>
                {change.coveragePct < 95 && <span className="text-text-muted">· over {change.coveragePct.toFixed(0)}% of value</span>}
              </span>
            )}
            {snapshot.partial && scoped === null && (
              <Tip openOnTap label={snapshot.notes.filter((note) => note.kind === "failed").map((note) => note.reason).join(" ")}>
                <span tabIndex={0} className="type-label ml-2 inline-flex rounded-chip text-caution">· Partial total</span>
              </Tip>
            )}
          </p>
        </div>
        <span className="type-label inline-flex items-center gap-2 rounded-pill border border-border-subtle px-3 py-1.5 text-text-secondary">
          <span aria-hidden className={cn("size-2 rounded-pill", sync.connected > 0 ? "bg-sage" : "bg-text-muted")} />
          {sync.connected} of {sync.total} venues connected
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 border-t border-border-subtle pt-3">
        <div className="min-w-0 border-r border-border-subtle pr-4">
          <p className="type-body-sm flex items-center gap-1.5 text-text-secondary">
            Available to deploy
            <InfoTip text="Stablecoins held plus free collateral at connected venues — what could be deployed without selling anything." />
          </p>
          <Money
            value={available ?? (total === 0 ? 0 : null)}
            reason="No stablecoin balance or venue collateral was readable."
            className="type-h2 mt-1 block font-sans text-text-primary"
          />
        </div>
        <div className="min-w-0 pl-6">
          <p className="type-body-sm text-text-secondary">Open positions</p>
          <p className="type-h2 mt-1 font-sans tabular-nums text-text-primary">
            {positions === null ? <span className="text-text-muted">—</span> : positions}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <AssetActionBar address={address} walletFunded={walletFunded} onExecuted={onExecuted} />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Allocation
--------------------------------------------------------------------------- */

/* Tokens, in order — lime first, then the forest's own greens and neutrals. */
const SLICE_COLOURS = ["var(--accent)", "var(--sage)", "var(--accent-quiet)", "var(--positive)", "var(--text-secondary)", "var(--border-strong)"];

function Ring({ allocation, size = 112 }: { allocation: CapitalAllocation | null; size?: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const label =
    allocation === null
      ? "No allocation yet"
      : `Allocation: ${allocation.slices.map((slice) => `${slice.label} ${slice.pct.toFixed(1)}%`).join(", ")}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label} className="shrink-0 -rotate-90">
      <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" style={{ stroke: "var(--border-subtle)" }} />
      {allocation?.slices.map((slice, index) => {
        const length = (slice.pct / 100) * circumference;
        /* A hairline gap between segments, never on a single full ring. */
        const gap = allocation.slices.length > 1 ? Math.min(1.5, length / 3) : 0;
        const segment = (
          <circle
            key={slice.key}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="9"
            strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`}
            strokeDashoffset={-offset}
            style={{ stroke: SLICE_COLOURS[index % SLICE_COLOURS.length] }}
          />
        );
        offset += length;
        return segment;
      })}
    </svg>
  );
}

function AllocationCard({
  allocation,
  accounts,
  scopeLabel,
}: {
  allocation: CapitalAllocation | null;
  accounts: AssetAccount[];
  scopeLabel: string | null;
}) {
  const connected = accounts.filter((entry) => entry.connection === "connected");
  return (
    <section aria-label="Allocation" className={cn(card, "flex flex-col p-5")}>
      <h2 className="type-h1 text-text-primary">Allocation</h2>
      <p className="type-body-sm text-text-secondary">
        {scopeLabel === null ? "Where your capital is held." : `What ${scopeLabel} holds.`}
      </p>

      <div className="flex flex-1 items-center gap-6 py-3">
        <Ring allocation={allocation} size={100} />
        {allocation === null ? (
          <p className="type-body-sm text-text-secondary">Allocation appears once funded.</p>
        ) : (
          <ul className="flex min-w-0 flex-1 list-none flex-col gap-1.5">
            {allocation.slices.map((slice, index) => (
              <li key={slice.key} className="type-body-sm flex items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-pill" style={{ background: SLICE_COLOURS[index % SLICE_COLOURS.length] }} />
                <span className="min-w-0 flex-1 truncate text-text-primary" title={slice.label}>
                  {slice.label}
                </span>
                <Money value={slice.valueUsd} className="hidden text-text-secondary @[40rem]:inline" />
                <span className="w-12 shrink-0 text-right tabular-nums text-text-secondary">
                  {slice.pct < 0.05 ? "<0.1" : slice.pct.toFixed(1)}%
                </span>
              </li>
            ))}
            <li className="type-label mt-1 text-text-muted">
              {allocation.by === "account" ? "Share of total equity, by account." : "Share of this account, by holding."}
            </li>
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <span className="type-body-sm flex min-w-0 items-center gap-2 text-text-primary">
          <span aria-hidden className={cn("size-2.5 shrink-0 rounded-pill", connected.length > 0 ? "bg-sage" : "bg-text-muted")} />
          <span className="min-w-0 truncate">
            {connected.length === 0
              ? "No venues connected"
              : connected.length === 1
                ? `${connected[0].label} connected`
                : `${connected.map((entry) => entry.label).join(", ")} connected`}
          </span>
        </span>
        <Link
          href="/agent"
          className="type-body-sm relative inline-flex items-center gap-1 rounded-chip font-medium text-accent transition-colors duration-[var(--dur-fast)] ease-brand after:absolute after:-inset-x-1 after:-inset-y-2 hover:text-accent-hover"
        >
          Manage connections
          <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Venues
--------------------------------------------------------------------------- */

const VENUE_COPY: Record<AssetAccountType, string> = {
  spot: "Wallet token balances",
  "solana-perps": "Perpetual positions on Solana",
  hyperliquid: "Perpetuals and balances on Hyperliquid",
  prediction: "Prediction market balances",
};

function VenueIcon({ type }: { type: AssetAccountType }) {
  const logos = useTickerLogos(SOL);
  const tile = "grid size-9 shrink-0 place-items-center rounded-control border border-border-subtle bg-surface-raised text-text-primary";
  if (type === "spot") {
    return (
      <span aria-hidden className={tile}>
        <Database size={20} strokeWidth={1.5} />
      </span>
    );
  }
  if (type === "prediction") {
    return (
      <span aria-hidden className={tile}>
        <ChartSpline size={20} strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <span aria-hidden className={tile}>
      {type === "hyperliquid" ? (
        <CoinMark symbol="HYPE" logo={hyperliquidIcon("HYPE")} size={24} className="border-0 bg-transparent" />
      ) : (
        <CoinMark symbol="SOL" {...logos("SOL")} size={24} className="border-0 bg-transparent" />
      )}
    </span>
  );
}

function VenueBadge({ account, feed }: { account: AssetAccount; feed: PortfolioFeed }) {
  const pill = "type-label inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1";
  if (account.status === "error") {
    return <span className={cn(pill, "border-negative/40 text-negative")}>Sync failed</span>;
  }
  if (account.connection === "unsupported") {
    return <span className={cn(pill, "border-border-subtle text-text-muted")}>Not available</span>;
  }
  if (account.connection === "disconnected") {
    return <span className={cn(pill, "border-border-subtle text-text-secondary")}>Not connected</span>;
  }
  if (feed.refreshing) {
    return (
      <span className={cn(pill, "border-border-subtle text-text-secondary")}>
        <RefreshCw size={11} strokeWidth={1.75} aria-hidden className="motion-safe:animate-spin" />
        Syncing
      </span>
    );
  }
  if (feed.stale) {
    return (
      <span className={cn(pill, "border-caution/40 text-caution")}>
        <span aria-hidden className="size-1.5 rounded-pill bg-caution" />
        Stale
      </span>
    );
  }
  return (
    <span className={cn(pill, "border-sage/40 bg-positive-bg text-positive")}>
      <span aria-hidden className="size-1.5 rounded-pill bg-sage" />
      Synced
    </span>
  );
}

function VenueCard({
  account,
  feed,
  selected,
  dimmed,
  onView,
  onConnectWallet,
}: {
  account: AssetAccount;
  feed: PortfolioFeed;
  selected: boolean;
  dimmed: boolean;
  onView: () => void;
  onConnectWallet: () => void;
}) {
  const connected = account.connection === "connected" && account.status !== "error";
  const action =
    account.status === "error" ? (
      <button type="button" onClick={feed.refetch} disabled={feed.refreshing} className={cn(outlined, "h-9 w-full disabled:opacity-60")}>
        <RefreshCw size={15} strokeWidth={1.5} aria-hidden className={cn(feed.refreshing && "motion-safe:animate-spin")} />
        Retry sync
      </button>
    ) : connected ? (
      <button type="button" onClick={onView} aria-pressed={selected} className={cn(outlined, "h-9 w-full", selected && "border-accent-quiet bg-surface-hover")}>
        {selected ? "Viewing this account" : "View account"}
        <ArrowRight size={15} strokeWidth={1.5} aria-hidden />
      </button>
    ) : account.connection === "unsupported" ? (
      <Tip openOnTap label={account.detail ?? "Not available in Elyra yet."}>
        <button type="button" aria-disabled className={cn(outlined, "h-9 w-full cursor-not-allowed border-border-subtle text-text-muted hover:border-border-subtle hover:bg-transparent")}>
          <BriefcaseBusiness size={15} strokeWidth={1.5} aria-hidden />
          Not available yet
        </button>
      </Tip>
    ) : account.type === "spot" ? (
      <button type="button" onClick={onConnectWallet} className={cn(outlined, "h-9 w-full")}>
        <WalletCards size={15} strokeWidth={1.5} aria-hidden />
        Connect wallet
        <ArrowRight size={15} strokeWidth={1.5} aria-hidden />
      </button>
    ) : (
      <Link href="/agent" className={cn(outlined, "h-9 w-full")}>
        <ChartSpline size={15} strokeWidth={1.5} aria-hidden />
        Connect venue
        <ArrowRight size={15} strokeWidth={1.5} aria-hidden />
      </Link>
    );


  return (
    <article
      aria-label={account.label}
      className={cn(
        card,
        "flex flex-col gap-2.5 p-4 transition-[opacity,border-color,background-color] duration-[var(--dur-fast)] ease-brand compact:px-5",
        connected ? "border-sage/45 hover:border-sage/70" : "hover:border-border-strong",
        selected && "border-accent-quiet bg-surface-raised",
        dimmed && "opacity-55",
      )}
    >
      <header className="flex items-center gap-3">
        <VenueIcon type={account.type} />
        <h3 className="type-h2 min-w-0 flex-1 truncate font-sans text-text-primary">{account.label}</h3>
        <VenueBadge account={account} feed={feed} />
      </header>

      <div className="min-h-11 flex-1">
        {account.status === "error" ? (
          <p role="alert" className="type-body-sm line-clamp-2 text-negative" title={account.errorReason ?? undefined}>
            {account.errorReason ?? "The last read failed."}
          </p>
        ) : connected ? (
          <>
            <Money value={account.valueUsd} className="type-h1 block font-sans text-text-primary" />
            <p className="type-body-sm text-text-secondary">
              {account.positions === null ? (
                (account.detail ?? VENUE_COPY[account.type])
              ) : (
                <>
                  {account.availableUsd !== null && (
                    <>
                      Available <Money value={account.availableUsd} /> ·{" "}
                    </>
                  )}
                  {account.positions} {account.type === "prediction" ? "active" : ""} position{account.positions === 1 ? "" : "s"}
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="type-body-sm text-text-secondary">{VENUE_COPY[account.type]}</p>
            {account.detail !== null && account.connection === "disconnected" && (
              <p className="type-label mt-0.5 text-text-muted">{account.detail}</p>
            )}
          </>
        )}
      </div>

      {action}
    </article>
  );
}

/* ---------------------------------------------------------------------------
   The data panel
--------------------------------------------------------------------------- */

type Tab = "holdings" | "positions" | "activity";
type PositionKind = "all" | "perps" | "defi" | "prediction";
type ActivityKind = "all" | "transfers" | "swaps";

interface Filters {
  grouping: BalanceGrouping;
  hideUnverified: boolean;
  hideSmall: boolean;
  positions: PositionKind;
  activity: ActivityKind;
}

const DEFAULT_FILTERS: Filters = { grouping: "asset", hideUnverified: false, hideSmall: false, positions: "all", activity: "all" };

const SMALL_USD = 1;

function FilterMenu({ tab, filters, onChange }: { tab: Tab; filters: Filters; onChange: (next: Filters) => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const active =
    tab === "holdings"
      ? filters.grouping !== "asset" || filters.hideUnverified || filters.hideSmall
      : tab === "positions"
        ? filters.positions !== "all"
        : filters.activity !== "all";

  const radio = <T extends string>(name: string, value: T, current: T, label: string, set: (value: T) => void) => (
    <label key={value} className="type-body-sm flex cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-text-primary hover:bg-surface-hover">
      <input type="radio" name={name} checked={current === value} onChange={() => set(value)} className="size-4 accent-[var(--accent)]" />
      {label}
    </label>
  );

  return (
    <Popover
      id={id}
      open={open}
      onOpenChange={setOpen}
      label="Filters"
      align="end"
      className="w-64"
      trigger={
        <IconButton
          label={active ? "Filters (some applied)" : "Filters"}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className={cn("relative size-9 border border-border-subtle", active && "text-accent")}
        >
          <SlidersHorizontal size={16} strokeWidth={1.5} aria-hidden />
          {active && <span aria-hidden className="absolute right-1.5 top-1.5 size-1.5 rounded-pill bg-accent" />}
        </IconButton>
      }
    >
      <div className="flex flex-col gap-1 p-2">
        {tab === "holdings" && (
          <>
            <p className="type-label px-2 pt-1 text-text-muted">Group by</p>
            {radio("grouping", "asset", filters.grouping, "Asset", (grouping) => onChange({ ...filters, grouping }))}
            {radio("grouping", "account", filters.grouping, "Account", (grouping) => onChange({ ...filters, grouping }))}
            <p className="type-label mt-1 px-2 text-text-muted">Show</p>
            <label className="type-body-sm flex cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-text-primary hover:bg-surface-hover">
              <input type="checkbox" checked={filters.hideSmall} onChange={() => onChange({ ...filters, hideSmall: !filters.hideSmall })} className="size-4 accent-[var(--accent)]" />
              Hide balances under $1
            </label>
            <label className="type-body-sm flex cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-text-primary hover:bg-surface-hover">
              <input type="checkbox" checked={filters.hideUnverified} onChange={() => onChange({ ...filters, hideUnverified: !filters.hideUnverified })} className="size-4 accent-[var(--accent)]" />
              Hide unverified tokens
            </label>
          </>
        )}
        {tab === "positions" &&
          (["all", "perps", "defi", "prediction"] as const).map((kind) =>
            radio("positions", kind, filters.positions, { all: "All positions", perps: "Perpetuals", defi: "DeFi", prediction: "Prediction markets" }[kind], (positions) =>
              onChange({ ...filters, positions }),
            ),
          )}
        {tab === "activity" &&
          (["all", "transfers", "swaps"] as const).map((kind) =>
            radio("activity", kind, filters.activity, { all: "All activity", transfers: "Sends and receives", swaps: "Swaps" }[kind], (activity) =>
              onChange({ ...filters, activity }),
            ),
          )}
        {active && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="type-label mt-1 self-start rounded-chip px-2 py-1 text-text-secondary hover:text-text-primary"
          >
            Reset filters
          </button>
        )}
      </div>
    </Popover>
  );
}

function WalletIllustration() {
  return (
    <svg viewBox="0 0 64 56" aria-hidden className="h-14 w-auto text-text-secondary">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M10 18h40a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5V16a5 5 0 0 1 5-5h32" />
        <path d="M44 28h12v10H44a5 5 0 0 1 0-10Z" />
      </g>
      <circle cx="45.5" cy="33" r="1.6" fill="currentColor" />
    </svg>
  );
}

function PanelMessage({
  icon: Icon,
  illustration,
  title,
  body,
  action,
  alert,
}: {
  icon?: LucideIcon;
  illustration?: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div role={alert ? "alert" : undefined} className="flex flex-col items-center px-6 py-8 text-center">
      {illustration ?? (Icon !== undefined && <Icon size={24} strokeWidth={1.5} aria-hidden className={alert ? "text-negative" : "text-text-muted"} />)}
      <h3 className="type-h2 mt-3 font-sans text-text-primary">{title}</h3>
      <p className="type-body-sm mt-1 max-w-sm text-text-secondary">{body}</p>
      {action !== undefined && <div className="mt-3">{action}</div>}
    </div>
  );
}

const quietLink = "type-body-sm inline-flex items-center gap-1.5 rounded-chip font-medium text-accent transition-colors duration-[var(--dur-fast)] ease-brand hover:text-accent-hover";

function GetStarted({ connected, total, onDeposit }: { connected: number; total: number; onDeposit: () => void }) {
  return (
    <aside aria-label="Get started" className="flex flex-col gap-4 border-t border-border-subtle p-5 @[60rem]:border-l @[60rem]:border-t-0">
      <h3 className="type-h2 flex items-center gap-2.5 font-sans text-text-primary">
        <Rocket size={18} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
        Get started
      </h3>
      <ol className="flex list-none flex-col gap-3">
        <li>
          <Link href="/agent" className="group flex items-start gap-3 rounded-control">
            <span aria-hidden className={cn("type-body-sm grid size-8 shrink-0 place-items-center rounded-pill border", connected > 0 ? "border-sage text-positive" : "border-border-strong text-text-secondary")}>
              1
            </span>
            <span className="min-w-0">
              <span className="type-body-sm block font-medium text-text-primary group-hover:text-accent">Connect your accounts</span>
              <span className="type-label block text-text-secondary">
                {connected} of {total} connected
              </span>
            </span>
          </Link>
        </li>
        <li>
          <button type="button" onClick={onDeposit} className="group flex items-start gap-3 rounded-control text-left">
            <span aria-hidden className="type-body-sm grid size-8 shrink-0 place-items-center rounded-pill border border-border-strong text-text-secondary">
              2
            </span>
            <span className="min-w-0">
              <span className="type-body-sm block font-medium text-text-primary group-hover:text-accent">Add funds</span>
              <span className="type-label block text-text-secondary">Choose a venue to deposit.</span>
            </span>
          </button>
        </li>
      </ol>
      <p className="type-label flex items-start gap-2 border-t border-border-subtle pt-3 text-text-secondary">
        <Info size={14} strokeWidth={1.5} aria-hidden className="mt-px shrink-0" />
        Balances refresh every 30 seconds while Elyra is open.
      </p>
    </aside>
  );
}

function DataPanel({
  snapshot,
  view,
  accounts,
  scope,
  scopeLabel,
  activity,
  unfunded,
  onClearScope,
  onReceive,
  onRetry,
  panelRef,
}: {
  snapshot: PortfolioSnapshot;
  view: PortfolioSnapshot;
  accounts: AssetAccount[];
  scope: string;
  scopeLabel: string | null;
  activity: ActivityFeed;
  unfunded: boolean;
  onClearScope: () => void;
  onReceive: () => void;
  onRetry: () => void;
  panelRef: React.RefObject<HTMLElement | null>;
}) {
  const [tab, setTab] = useState<Tab>("holdings");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const term = query.trim().toLowerCase();
  const sync = syncSummary(accounts);

  const allHoldings = view.spot;
  const holdings = useMemo(
    () =>
      allHoldings.filter(
        (holding) =>
          (!filters.hideUnverified || holding.verified) &&
          (!filters.hideSmall || (holding.valueUsd ?? 0) >= SMALL_USD) &&
          (term.length === 0 ||
            holding.symbol.toLowerCase().includes(term) ||
            (holding.name ?? "").toLowerCase().includes(term) ||
            venueLabel(holding.venue).toLowerCase().includes(term)),
      ),
    [allHoldings, filters.hideUnverified, filters.hideSmall, term],
  );

  const showDefi = scope === ALL_ACCOUNTS;
  const prediction = (scope === ALL_ACCOUNTS || scope === "prediction") && snapshot.prediction.connected ? snapshot.prediction : null;
  const perps = view.perps.filter(
    (position) =>
      (filters.positions === "all" || filters.positions === "perps") &&
      (term.length === 0 || position.market.toLowerCase().includes(term) || venueLabel(position.venue).toLowerCase().includes(term)),
  );
  const defi = (showDefi ? snapshot.defi : []).filter(
    (position) =>
      (filters.positions === "all" || filters.positions === "defi") &&
      (term.length === 0 || `${position.protocol} ${position.label}`.toLowerCase().includes(term)),
  );
  const predictionShown =
    prediction !== null && (prediction.activeMarkets ?? 0) > 0 && (filters.positions === "all" || filters.positions === "prediction") && (term.length === 0 || "prediction markets".includes(term));
  const positionCount = view.perps.length + (showDefi ? snapshot.defi.length : 0) + (prediction?.activeMarkets ?? 0);

  /* Activity is the Solana wallet's — a venue's own history lives at the venue. */
  const activityApplies = scope === ALL_ACCOUNTS || scope === "spot";
  const activityItems = activity.items.filter((item) => {
    const kind = item.summary?.kind ?? null;
    if (filters.activity === "transfers" && kind !== "send" && kind !== "receive") return false;
    if (filters.activity === "swaps" && kind !== "swap") return false;
    if (term.length === 0) return true;
    return item.signature.toLowerCase().includes(term) || (item.summary?.title ?? "").toLowerCase().includes(term);
  });

  const placeholder = tab === "holdings" ? "Search assets" : tab === "positions" ? "Search markets" : "Search activity";
  const clearSearch = (
    <button type="button" onClick={() => setQuery("")} className={cn(outlined, "h-9 px-3.5")}>
      Clear search
    </button>
  );

  const failed = (scopes: string[]) => snapshot.notes.find((note) => note.kind === "failed" && scopes.includes(note.scope));

  let holdingsBody: React.ReactNode;
  if (sync.connected === 0) {
    holdingsBody = (
      <PanelMessage
        icon={Wallet}
        title="No accounts connected"
        body="Link a wallet or connect a venue, and its balances appear here."
        action={
          <Link href="/agent" className={cn(outlined, "h-9 px-3.5")}>
            Manage connections
          </Link>
        }
      />
    );
  } else if (allHoldings.length === 0 && failed(["wallet", "wallet tokens", "hyperliquid", "venues"]) !== undefined) {
    const note = failed(["wallet", "wallet tokens", "hyperliquid", "venues"]);
    holdingsBody = (
      <PanelMessage
        icon={RefreshCw}
        alert
        title="Balances couldn't be read"
        body={note?.reason ?? "The last read failed."}
        action={
          <button type="button" onClick={onRetry} className={cn(outlined, "h-9 px-3.5")}>
            Try again
          </button>
        }
      />
    );
  } else if (allHoldings.length === 0) {
    holdingsBody = (
      <PanelMessage
        illustration={<WalletIllustration />}
        title="Your assets will appear here"
        body={
          scopeLabel === null
            ? "Deposit funds to a connected account to see your balances and allocation."
            : scope === "spot"
              ? "The wallet holds no tokens yet."
              : `${scopeLabel} holds no spot tokens here — its positions are under Positions.`
        }
        action={
          /* The deposit address is the Solana wallet's — offered where a
             deposit lands, never under a venue it would not reach. */
          scope === ALL_ACCOUNTS || scope === "spot" ? (
            <button type="button" onClick={onReceive} className={quietLink}>
              View deposit address
              <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />
            </button>
          ) : undefined
        }
      />
    );
  } else if (holdings.length === 0) {
    holdingsBody = (
      <PanelMessage
        icon={Search}
        title={term.length > 0 ? `No assets match “${query.trim()}”` : "Everything here is filtered out"}
        body={term.length > 0 ? "Try a symbol, a name or an account." : "Change the filters to see these holdings."}
        action={term.length > 0 ? clearSearch : (
          <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className={cn(outlined, "h-9 px-3.5")}>
            Reset filters
          </button>
        )}
      />
    );
  } else {
    holdingsBody = <BalancesTable holdings={holdings} grouping={filters.grouping} />;
  }

  let positionsBody: React.ReactNode;
  if (positionCount === 0) {
    const note = failed(["hyperliquid", "venues", "defi", "prediction"]);
    positionsBody = note !== undefined ? (
      <PanelMessage
        icon={RefreshCw}
        alert
        title="Some positions couldn't be read"
        body={note.reason}
        action={
          <button type="button" onClick={onRetry} className={cn(outlined, "h-9 px-3.5")}>
            Try again
          </button>
        }
      />
    ) : (
      <PanelMessage
        icon={BriefcaseBusiness}
        title="No open positions"
        body="Perpetuals at connected venues, DeFi deposits and prediction-market shares appear here with their value and open PnL."
      />
    );
  } else if (perps.length === 0 && defi.length === 0 && !predictionShown) {
    positionsBody = (
      <PanelMessage
        icon={Search}
        title={term.length > 0 ? `No positions match “${query.trim()}”` : "Nothing of this kind is open"}
        body={term.length > 0 ? "Try a market or a venue." : "Choose another kind in the filters."}
        action={term.length > 0 ? clearSearch : undefined}
      />
    );
  } else {
    positionsBody = (
      <div className="flex flex-col">
        {perps.length > 0 && <PositionsTable positions={perps} />}
        {(defi.length > 0 || predictionShown) && (
          <ul aria-label="DeFi and prediction positions" className="flex list-none flex-col border-t border-border-subtle">
            {defi.map((position) => (
              <li key={position.id} className="flex items-center gap-3 border-b border-border-subtle px-5 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="type-body-sm truncate text-text-primary">{position.label}</p>
                  <p className="type-label text-text-secondary">
                    {position.protocol} · DeFi
                    {position.apyPct !== null && <span className="tabular-nums"> · {formatPct(position.apyPct, { sign: false })} APY, variable</span>}
                  </p>
                </div>
                <Money value={position.valueUsd} reason="The protocol reported no value." className="type-body-sm text-text-primary" />
              </li>
            ))}
            {predictionShown && prediction !== null && (
              <li className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="type-body-sm text-text-primary">Prediction markets</p>
                  <p className="type-label text-text-secondary">
                    {prediction.activeMarkets} active {prediction.activeMarkets === 1 ? "market" : "markets"}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <Money value={prediction.valueUsd} reason="Not valued." className="type-body-sm text-text-primary" />
                  <Delta pct={null} usd={prediction.unrealisedPnlUsd} reason="No PnL reported." className="type-label" />
                </div>
              </li>
            )}
          </ul>
        )}
      </div>
    );
  }

  let activityBody: React.ReactNode;
  if (!activityApplies) {
    activityBody = (
      <PanelMessage
        icon={History}
        title={`${scopeLabel ?? "This venue"} keeps its own history`}
        body="Activity here is the Solana wallet's transactions. Choose All accounts or Spot to see them."
        action={
          <button type="button" onClick={onClearScope} className={cn(outlined, "h-9 px-3.5")}>
            Show all accounts
          </button>
        }
      />
    );
  } else if (activity.unconfigured) {
    activityBody = <PanelMessage icon={History} title="History isn't configured" body="Transaction history needs SOLANA_RPC_URL on the server." />;
  } else if (activity.error !== null && activity.items.length === 0) {
    activityBody = (
      <PanelMessage
        icon={RefreshCw}
        alert
        title="Activity couldn't be read"
        body={activity.error}
        action={
          <button type="button" onClick={() => void activity.refetch()} className={cn(outlined, "h-9 px-3.5")}>
            Try again
          </button>
        }
      />
    );
  } else if (activity.isLoading) {
    activityBody = (
      <div aria-busy="true" aria-label="Reading activity" className="flex flex-col gap-2 p-5">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} aria-hidden className="skeleton h-9 w-full rounded-control" />
        ))}
      </div>
    );
  } else if (activity.items.length === 0) {
    activityBody = <PanelMessage icon={History} title="No activity yet" body="Transactions this wallet signs or receives appear here, newest first." />;
  } else if (activityItems.length === 0) {
    activityBody = (
      <PanelMessage
        icon={Search}
        title={term.length > 0 ? `Nothing matches “${query.trim()}”` : "Nothing of this kind yet"}
        body={term.length > 0 ? "Try a signature or what it did — “swap”, “received”." : "Choose another kind in the filters."}
        action={term.length > 0 ? clearSearch : undefined}
      />
    );
  } else {
    activityBody = <HistoryTable items={activityItems} />;
  }

  const counts: Record<Tab, number | null> = { holdings: allHoldings.length, positions: positionCount, activity: null };
  const TAB_META: Array<{ value: Tab; label: string; icon: LucideIcon }> = [
    { value: "holdings", label: "Holdings", icon: Database },
    { value: "positions", label: "Positions", icon: BriefcaseBusiness },
    { value: "activity", label: "Activity", icon: History },
  ];

  return (
    <section ref={panelRef} aria-label="Holdings, positions and activity" className={cn(card, "scroll-mt-4 overflow-hidden")}>
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-3 compact:px-5">
          <TabsList aria-label="Account data" className="-mb-px min-w-0 gap-1 compact:gap-2">
            {TAB_META.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="type-body-sm h-12 gap-2 px-2 compact:px-3">
                <Icon size={16} strokeWidth={1.5} aria-hidden className="hidden compact:block" />
                {label}
                {counts[value] !== null && (
                  <span className="type-label min-w-5 rounded-chip bg-surface-hover px-1.5 text-center tabular-nums text-text-secondary">
                    {counts[value]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 py-2 compact:flex-none">
            <label className="relative min-w-0 flex-1 compact:w-64 compact:flex-none">
              <span className="sr-only">{placeholder}</span>
              <Search size={15} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
                className={cn(
                  "type-body-sm h-9 w-full rounded-control border border-border-subtle bg-surface-base pl-9 pr-3 text-text-primary",
                  "placeholder:text-text-muted transition-colors duration-[var(--dur-fast)] ease-brand hover:border-border-strong focus-visible:border-accent-quiet",
                )}
              />
            </label>
            <FilterMenu tab={tab} filters={filters} onChange={setFilters} />
          </div>
        </div>

        <div className={cn("grid grid-cols-1", unfunded && tab === "holdings" && "@[60rem]:grid-cols-[minmax(0,1fr)_340px]")}>
          <div className="min-w-0 @container">
            <TabsContent value="holdings">{holdingsBody}</TabsContent>
            <TabsContent value="positions">{positionsBody}</TabsContent>
            <TabsContent value="activity">{activityBody}</TabsContent>
          </div>
          {unfunded && tab === "holdings" && <GetStarted connected={sync.connected} total={sync.total} onDeposit={onReceive} />}
        </div>
      </Tabs>

      <footer className="type-label flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border-subtle px-5 py-3 text-text-secondary">
        <span className="flex min-w-0 items-center gap-2">
          <Database size={15} strokeWidth={1.5} aria-hidden className="shrink-0" />
          <span className="truncate">{scopeLabel === null ? "Showing all accounts" : `Showing ${scopeLabel}`}</span>
          {scopeLabel !== null && (
            <button type="button" onClick={onClearScope} aria-label="Show all accounts" className="grid size-6 place-items-center rounded-chip hover:bg-surface-hover hover:text-text-primary">
              <X size={13} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </span>
        <span className="tabular-nums">
          {sync.ready} {sync.ready === 1 ? "venue" : "venues"} synced
          {sync.failed.length > 0 && <span className="text-negative"> · {sync.failed.length} failed</span>}
          {" · "}
          {sync.notConnected} awaiting connection
        </span>
      </footer>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Loading and signed-out
--------------------------------------------------------------------------- */

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Reading your accounts" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 @[60rem]:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
        <div className={cn(card, "flex flex-col gap-3 p-6")}>
          <span className="skeleton h-4 w-28" />
          <span className="skeleton h-9 w-44 rounded-control" />
          <span className="skeleton h-3.5 w-48" />
          <span className="skeleton mt-4 h-12 w-full rounded-control" />
          <span className="skeleton mt-2 h-10 w-full rounded-control" />
        </div>
        <div className={cn(card, "flex flex-col gap-3 p-6")}>
          <span className="skeleton h-5 w-28" />
          <span className="skeleton size-28 rounded-pill" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 @[44rem]:grid-cols-2 @[76rem]:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={cn(card, "flex h-44 flex-col gap-3 p-5")}>
            <span className="skeleton h-10 w-40 rounded-control" />
            <span className="skeleton h-4 w-32" />
            <span className="skeleton mt-auto h-10 w-full rounded-control" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The page
--------------------------------------------------------------------------- */

export function CapitalAccounts() {
  return (
    <CapitalAccountsView auth={useElyraAuth()} feed={usePortfolio()} wallet={useWalletDashboard()} activity={useWalletActivity(25)} />
  );
}

/** The page with its data passed in, so it renders the same from fixtures. */
export function CapitalAccountsView({
  auth,
  feed,
  wallet,
  activity,
}: {
  auth: Pick<ElyraAuth, "available" | "ready" | "login">;
  feed: PortfolioFeed;
  wallet: WalletDashboard;
  activity: ActivityFeed;
}) {
  const [scope, setScope] = useState<string>(ALL_ACCOUNTS);
  const [receiving, setReceiving] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const openSheet = useElyraStore((state) => state.setWalletSheetOpen);

  const snapshot = feed.snapshot;
  const accounts = useMemo(() => (snapshot === null ? [] : deriveAccounts(snapshot)), [snapshot]);
  /* A chosen account that has since disconnected falls back to all of them. */
  const activeScope = accounts.some((entry) => entry.id === scope && entry.connection === "connected") ? scope : ALL_ACCOUNTS;
  const scoped = accounts.find((entry) => entry.id === activeScope) ?? null;
  const view = useMemo(() => (snapshot === null ? null : scopeSnapshot(snapshot, activeScope)), [snapshot, activeScope]);
  const allocation = useMemo(() => (snapshot === null ? null : capitalAllocation(snapshot, activeScope)), [snapshot, activeScope]);
  const address = wallet.address ?? snapshot?.scopes.find((entry) => entry.venue === "wallet")?.address ?? null;

  const unfunded =
    snapshot !== null &&
    snapshot.summary.totalValueUsd === 0 &&
    !snapshot.partial &&
    snapshot.spot.length === 0 &&
    snapshot.perps.length === 0 &&
    snapshot.defi.length === 0;

  const viewAccount = (id: string) => {
    setScope(id === activeScope ? ALL_ACCOUNTS : id);
    requestAnimationFrame(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panelRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  };

  const signedIn = feed.signedIn;

  return (
    <div className="min-h-0 overflow-y-auto overflow-x-hidden @container">
      <div className="flex flex-col gap-4 pb-2">
        <Header feed={feed} accounts={accounts} scope={activeScope} onScope={setScope} />

        {!auth.ready || (signedIn && snapshot === null && feed.loading) ? (
          <PageSkeleton />
        ) : !signedIn ? (
          <section className={cn(card, "flex flex-col items-center gap-3 px-6 py-16 text-center")}>
            <WalletIllustration />
            <h2 className="type-h1 text-text-primary">Connect to see your capital</h2>
            <p className="type-body max-w-md text-text-secondary">
              {auth.available
                ? "Sign in, and your wallet, venues and positions are gathered here — balances, allocation and what you can move."
                : "Sign-in isn't configured on this deployment, so there is no account to read."}
            </p>
            {auth.available && (
              <button type="button" onClick={auth.login} className="type-body-sm inline-flex h-10 items-center gap-2 rounded-control bg-accent px-4 font-medium text-text-on-accent hover:bg-accent-hover">
                <Wallet size={16} strokeWidth={1.5} aria-hidden />
                Connect wallet
              </button>
            )}
          </section>
        ) : snapshot === null || view === null ? (
          <section role="alert" className={cn(card, "flex flex-col items-center gap-3 px-6 py-14 text-center")}>
            <h2 className="type-h1 text-text-primary">{feed.unconfigured ? "Accounts aren't configured" : "Your accounts couldn't be read"}</h2>
            <p className="type-body max-w-md text-text-secondary">{feed.error ?? "The portfolio could not be assembled."}</p>
            {!feed.unconfigured && (
              <button type="button" onClick={feed.refetch} disabled={feed.refreshing} className={cn(outlined, "h-10 px-4 disabled:opacity-60")}>
                <RefreshCw size={15} strokeWidth={1.5} aria-hidden className={cn(feed.refreshing && "motion-safe:animate-spin")} />
                Try again
              </button>
            )}
          </section>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 @[60rem]:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
              <EquityCard snapshot={snapshot} accounts={accounts} scope={activeScope} address={address} onExecuted={feed.refetch} />
              <AllocationCard allocation={allocation} accounts={accounts} scopeLabel={scoped?.label ?? null} />
            </div>

            <section aria-labelledby="venues-heading" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id="venues-heading" className="type-h1 text-text-primary">
                  Your venues
                </h2>
                <span className="type-body-sm text-text-secondary">
                  {syncSummary(accounts).connected} connected · {syncSummary(accounts).notConnected} not connected
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 @[44rem]:grid-cols-2 @[76rem]:grid-cols-4">
                {accounts.map((account) => (
                  <VenueCard
                    key={account.id}
                    account={account}
                    feed={feed}
                    selected={account.id === activeScope}
                    dimmed={activeScope !== ALL_ACCOUNTS && account.id !== activeScope}
                    onView={() => viewAccount(account.id)}
                    onConnectWallet={() => (auth.ready && !signedIn ? auth.login() : openSheet(true))}
                  />
                ))}
              </div>
            </section>

            <DataPanel
              snapshot={snapshot}
              view={view}
              accounts={accounts}
              scope={activeScope}
              scopeLabel={scoped?.label ?? null}
              activity={activity}
              unfunded={unfunded}
              onClearScope={() => setScope(ALL_ACCOUNTS)}
              onReceive={() => setReceiving(true)}
              onRetry={feed.refetch}
              panelRef={panelRef}
            />
          </>
        )}
      </div>

      <ReceiveDialog open={receiving} onOpenChange={setReceiving} address={address} cluster={wallet.cluster} />
    </div>
  );
}

