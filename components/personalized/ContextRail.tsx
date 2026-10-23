"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  ChevronRight,
  Clock3,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { EditorIntent } from "@/components/personalized/PreferenceEditor";
import { Money } from "@/components/portfolio/primitives";
import { CopyButton, StatusDot } from "@/components/shell/RouteDrawer";
import { CoinMark } from "@/components/ui/CoinMark";
import { Popover } from "@/components/ui/Popover";
import { formatAge, truncateMiddle } from "@/lib/format";
import { useTickerLogos } from "@/lib/market/tickerLogos";
import type { MemoryFeed } from "@/lib/personalized/client";
import type { SourceKey, SourceState, SourceStatus } from "@/lib/personalized/sources";
import type { MemoryType } from "@/lib/personalized/types";
import type { DrawerView } from "@/lib/portfolio/drawer";
import type { PortfolioFeed } from "@/lib/portfolio/usePortfolio";
import { accountExplorerUrl } from "@/lib/solana/address";
import { CLUSTER_LABEL, EXPECTED_CLUSTER, type Cluster } from "@/lib/solana/cluster";
import { useElyraStore } from "@/lib/store";
import { useSecond } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Your context: what Elyra can see, beside the conversation that uses it.

   Every figure is a read the rest of the app already makes — the portfolio
   from the shared `usePortfolio` store (the same one the Portfolio drawer
   and the header read), activity and the wallet from theirs — so this rail
   costs no request of its own, and cannot disagree with the Portfolio page.
--------------------------------------------------------------------------- */

const SOL = ["SOL"] as const;

export const card = "min-w-0 rounded-panel border border-border-subtle bg-surface-raised px-4 py-3.5";

const outlined = cn(
  "type-body-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control border font-medium",
  "border-border-strong text-text-primary transition-colors duration-[var(--dur-fast)] ease-brand",
  "hover:border-accent-quiet hover:bg-surface-hover active:bg-surface-panel",
);

function CardHead({ icon: Icon, title, right }: { icon: LucideIcon; title: string; right?: React.ReactNode }) {
  return (
    <header className="flex min-h-7 items-center gap-2.5">
      <Icon size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent" />
      <h3 className="type-h2 min-w-0 flex-1 truncate text-text-primary">{title}</h3>
      {right}
    </header>
  );
}

/* ---- Portfolio ---- */

function PortfolioCard({ feed, view }: { feed: PortfolioFeed; view: DrawerView | null }) {
  const now = useSecond();
  const positions =
    view === null ? 0 : view.perps.length + view.defi.length + (view.prediction?.activeMarkets ?? 0);

  const sync =
    feed.refreshing && feed.snapshot !== null ? (
      <StatusDot tone="muted">Syncing…</StatusDot>
    ) : feed.stale ? (
      <StatusDot tone="caution">Refresh failed</StatusDot>
    ) : feed.snapshot === null ? (
      feed.loading ? <StatusDot tone="muted">Reading…</StatusDot> : <StatusDot tone="negative">Unavailable</StatusDot>
    ) : feed.snapshot.partial ? (
      <StatusDot tone="caution">Partial</StatusDot>
    ) : (
      <StatusDot tone="positive">
        Synced {feed.fetchedAt === null || now === null ? "just now" : formatAge(feed.fetchedAt, now)}
      </StatusDot>
    );

  return (
    <section aria-label="Portfolio" className={card}>
      <CardHead icon={BarChart3} title="Portfolio" right={sync} />

      {view === null ? (
        feed.loading ? (
          <div aria-busy="true" aria-label="Reading your portfolio" className="mt-3 flex flex-col gap-2">
            <span className="skeleton h-8 w-32 rounded-control" />
            <span className="skeleton h-3 w-20" />
            <span className="skeleton mt-2 h-4 w-full" />
            <span className="skeleton h-4 w-full" />
          </div>
        ) : (
          <div role="alert" className="mt-3 flex flex-col items-start gap-2">
            <p className="type-body-sm text-text-secondary">
              {feed.unconfigured ? "The portfolio isn't configured on this deployment." : (feed.error ?? "Your portfolio couldn't be read.")}
            </p>
            {!feed.unconfigured && (
              <button type="button" onClick={feed.refetch} disabled={feed.refreshing} className={cn(outlined, "h-8 px-3 disabled:opacity-60")}>
                <RefreshCw size={13} strokeWidth={1.5} aria-hidden className={cn(feed.refreshing && "motion-safe:animate-spin")} />
                Retry
              </button>
            )}
          </div>
        )
      ) : (
        <>
          <div className="mt-1.5">
            <Money
              value={view.totalUsd}
              reason="No source returned a value that could be totalled."
              className="type-display block truncate font-sans text-text-primary"
            />
            <p className="type-body-sm text-text-secondary">Total equity</p>
          </div>
          <dl className="mt-2.5 flex flex-col gap-1 border-b border-border-subtle pb-3">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="type-body-sm text-text-secondary">Available</dt>
              <dd className="type-body-sm tabular-nums text-text-primary">
                <Money value={view.availableUsd} reason="No stablecoin balance or venue collateral was readable." />
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="type-body-sm text-text-secondary">Open positions</dt>
              <dd className="type-body-sm tabular-nums text-text-primary">{positions}</dd>
            </div>
          </dl>

          {view.unfunded ? (
            <div className="mt-2.5 flex gap-3">
              <WalletCards size={20} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-secondary" />
              <div className="min-w-0">
                <p className="type-body-sm text-text-primary">No assets yet.</p>
                <p className="type-label text-text-secondary">Add funds to start building your portfolio.</p>
                <Link href="/portfolio" className={cn(outlined, "mt-2 h-8 px-3.5")}>
                  Open portfolio
                  <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />
                </Link>
              </div>
            </div>
          ) : (
            <Link href="/portfolio" className={cn(outlined, "mt-3 h-9 w-full px-3.5")}>
              Open portfolio
              <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />
            </Link>
          )}
        </>
      )}
    </section>
  );
}

/* ---- Preferences ---- */

const SUGGESTIONS: Array<{ label: string; intent: EditorIntent; covers: MemoryType[] }> = [
  { label: "Risk tolerance", intent: { mode: "risk" }, covers: ["leverage_limit", "stablecoin_buffer"] },
  { label: "Allocation limits", intent: { mode: "allocation" }, covers: ["concentration_limit"] },
];

function PreferencesCard({ memory, onEdit }: { memory: MemoryFeed; onEdit: (intent: EditorIntent) => void }) {
  const saved = new Set(memory.memories.map((entry) => entry.type));
  /* A suggestion stays only while nothing it covers is saved — once it is,
     the saved row below is the place to change it. */
  const suggestions = SUGGESTIONS.filter((suggestion) => !suggestion.covers.some((type) => saved.has(type)));

  return (
    <section aria-label="Preferences" className={card}>
      <CardHead
        icon={Settings}
        title="Preferences"
        right={
          memory.loading ? (
            <span aria-hidden className="skeleton h-6 w-16 rounded-pill" />
          ) : memory.error !== null ? null : (
            <span className="type-label rounded-pill border border-border-subtle px-2.5 py-0.5 tabular-nums text-text-secondary">
              {memory.memories.length} saved
            </span>
          )
        }
      />
      <p className="type-body-sm mt-1 text-text-secondary">Make Elyra work your way.</p>

      {memory.error !== null && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2">
          <p className="type-label flex-1 text-negative">{memory.error}</p>
          <button type="button" onClick={memory.refetch} className={cn(outlined, "h-7 px-2.5")}>
            Retry
          </button>
        </div>
      )}

      {memory.memories.length > 0 && (
        <ul className="mt-2.5 flex list-none flex-col gap-1">
          {memory.memories.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onEdit({ mode: "edit", memory: entry })}
                aria-label={`Edit preference: ${entry.label}`}
                className="group flex w-full items-center gap-2 rounded-control border border-border-subtle px-3 py-2 text-left transition-colors duration-[var(--dur-fast)] ease-brand hover:border-accent-quiet hover:bg-surface-hover"
              >
                <span className="type-body-sm min-w-0 flex-1 truncate text-text-primary" title={entry.label}>
                  {entry.label}
                </span>
                <Pencil size={13} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted group-hover:text-text-primary" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.label}
              type="button"
              onClick={() => onEdit(suggestion.intent)}
              className={cn(outlined, "h-9 border-border-subtle px-2.5 font-normal", suggestions.length === 1 && "col-span-2")}
            >
              <Plus size={14} strokeWidth={1.5} aria-hidden className="shrink-0" />
              <span className="truncate">{suggestion.label}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onEdit({ mode: "new" })}
        className="type-body-sm mt-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-control text-text-primary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover"
      >
        <Plus size={14} strokeWidth={1.5} aria-hidden />
        Add preference
      </button>
      <p className="type-label mt-1 text-text-muted">Saved only when you choose.</p>
    </section>
  );
}

/* ---- Data sources ---- */

const DOT: Record<SourceState, "positive" | "accent" | "caution" | "negative" | "muted"> = {
  connected: "positive",
  available: "accent",
  empty: "muted",
  unavailable: "caution",
  failed: "negative",
  loading: "muted",
};

const SOURCE_ROWS: Array<{ key: SourceKey; label: string; icon: LucideIcon }> = [
  { key: "wallet", label: "Wallet", icon: Wallet },
  { key: "positions", label: "Positions", icon: BriefcaseBusiness },
  { key: "activity", label: "Activity", icon: Clock3 },
  { key: "memory", label: "Memory", icon: BookOpen },
];

function AccountSelector({ address, cluster }: { address: string | null; cluster: Cluster | null }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const logos = useTickerLogos(SOL);
  const openSheet = useElyraStore((state) => state.setWalletSheetOpen);
  const network = CLUSTER_LABEL[cluster ?? EXPECTED_CLUSTER];

  if (address === null) {
    return (
      <p className="type-body-sm mt-3 rounded-control border border-border-subtle px-3 py-2.5 text-text-muted">
        No wallet on this account yet.
      </p>
    );
  }

  return (
    <Popover
      id={id}
      open={open}
      onOpenChange={setOpen}
      label="Selected account"
      side="top"
      align="start"
      className="w-[min(320px,calc(100vw-48px))]"
      trigger={
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={`Selected account: ${network} wallet ${address}`}
          onClick={() => setOpen((value) => !value)}
          className="mt-2.5 flex h-9 w-full items-center gap-2.5 rounded-control border border-border-subtle px-3 transition-colors duration-[var(--dur-fast)] ease-brand hover:border-accent-quiet hover:bg-surface-hover"
        >
          <CoinMark symbol="SOL" {...logos("SOL")} size={20} />
          <span className="type-mono-addr min-w-0 flex-1 truncate text-left text-text-primary">{truncateMiddle(address, 4, 4)}</span>
          <ChevronRight size={15} strokeWidth={1.5} aria-hidden className={cn("shrink-0 text-text-secondary transition-transform duration-[var(--dur-fast)] motion-reduce:transition-none", open && "-rotate-90")} />
        </button>
      }
    >
      <div className="flex flex-col gap-2 p-3">
        <p className="type-label text-text-secondary">{network} · your Elyra wallet</p>
        <div className="flex items-start gap-1 rounded-control border border-border-subtle bg-surface-base px-2.5 py-2">
          <p className="type-mono-addr min-w-0 flex-1 select-all break-all text-text-primary">{address}</p>
          <CopyButton value={address} label="wallet address" className="-my-1 -mr-1.5" />
        </div>
        <p className="type-label text-text-muted">
          This account has one wallet, so there is nothing to switch to. Context and answers read this address.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openSheet(true);
            }}
            className={cn(outlined, "h-8 px-3")}
          >
            Wallet details
          </button>
          <a href={accountExplorerUrl(address, cluster)} target="_blank" rel="noopener noreferrer" className={cn(outlined, "h-8 px-3")}>
            Solscan
            <ExternalLink size={12} strokeWidth={1.5} aria-hidden />
          </a>
        </div>
      </div>
    </Popover>
  );
}

function DataSourcesCard({
  statuses,
  address,
  cluster,
}: {
  statuses: Record<SourceKey, SourceStatus>;
  address: string | null;
  cluster: Cluster | null;
}) {
  return (
    <section aria-label="Data sources" className={card}>
      <CardHead icon={Link2} title="Data sources" />
      <ul className="mt-1.5 flex list-none flex-col divide-y divide-border-subtle">
        {SOURCE_ROWS.map(({ key, label, icon: Icon }) => {
          const status = statuses[key];
          return (
            <li key={key} className="flex h-7 items-center gap-2.5">
              <Icon size={15} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
              <span className="type-body-sm min-w-0 flex-1 truncate text-text-primary">{label}</span>
              <StatusDot tone={DOT[status.state]}>{status.label}</StatusDot>
            </li>
          );
        })}
      </ul>
      <AccountSelector address={address} cluster={cluster} />
      <p className="type-label mt-1.5 text-text-muted">Context follows your selected account.</p>
    </section>
  );
}

/* ---- The rail ---- */

export function ContextCards({
  portfolio,
  view,
  memory,
  statuses,
  address,
  cluster,
  onEditPreference,
}: {
  portfolio: PortfolioFeed;
  view: DrawerView | null;
  memory: MemoryFeed;
  statuses: Record<SourceKey, SourceStatus>;
  address: string | null;
  cluster: Cluster | null;
  onEditPreference: (intent: EditorIntent) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <PortfolioCard feed={portfolio} view={view} />
      <PreferencesCard memory={memory} onEdit={onEditPreference} />
      <DataSourcesCard statuses={statuses} address={address} cluster={cluster} />
    </div>
  );
}

