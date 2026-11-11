"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Coins,
  ExternalLink,
  KeyRound,
  MoreHorizontal,
  Network as NetworkIcon,
  RefreshCw,
  Search,
  Sparkles,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useElyraAuth, type ElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { Section, SectionControl } from "@/components/ui/Section";
import type { WidgetProps } from "@/components/workspace/WidgetColumn";
import type { AccountEvent } from "@/lib/activity/events";
import {
  DEFAULT_FILTERS,
  RANGE_LABEL,
  directionOf,
  filterEvents,
  formatTokenAmount,
  type ActivityFilters,
  type DateRange,
  type Direction,
  type Network,
} from "@/lib/activity/filter";
import { useAccountEvents, type AccountFeed } from "@/lib/activity/useAccountEvents";
import { EVM_CHAINS } from "@/lib/evm/chains";
import { formatClock, formatDayGroup, formatRelativeTime, formatTimestamp } from "@/lib/format";
import { accountExplorerUrl } from "@/lib/solana/address";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { assetName, type TxAmount } from "@/lib/wallet/summarise";

/* ---------------------------------------------------------------------------
   Activity: the account's transactions, filterable, newest first.

   Header: count of what the filters show, search, and a menu. Filters: All /
   Received / Sent, a date range and the network. Rows: a direction mark,
   what happened ("Sent SOL"), its real status and time, and the full signed
   amount on the right in figures — never cut short. A row opens its details
   in place; the explorer link beside it opens the explorer and nothing else.
   Footer: the full history on Assets, when the feed last updated, refresh.

   Everything is the wallet's own data (lib/wallet/summarise.ts decodes
   what each transaction did). Fired alerts and actions awaiting review sit
   in the same list under All.
--------------------------------------------------------------------------- */

const DIRECTIONS: Array<{ id: Direction; label: string }> = [
  { id: "all", label: "All" },
  { id: "received", label: "Received" },
  { id: "sent", label: "Sent" },
];

/* ---- What a row says ---- */

/** Where a row's explorer link goes, by its network. */
function explorerName(event: AccountEvent): string {
  return event.network === undefined || event.network === "solana" ? "Solscan" : EVM_CHAINS[event.network].explorer.name;
}

function primarySymbol(amounts: TxAmount[], sign: 1 | -1): string | null {
  const entry = amounts.find((amount) => Math.sign(amount.amount) === sign);
  return entry ? assetName(entry) : null;
}

/** "Sent SOL", "Received USDC", "Swapped SOL → USDC" — the amount lives in the right column. */
function actionLabel(event: AccountEvent): string {
  const summary = event.summary;
  if (event.kind !== "transaction" || !summary) return event.text;
  const incoming = primarySymbol(summary.amounts, 1);
  const outgoing = primarySymbol(summary.amounts, -1);
  switch (summary.kind) {
    case "receive":
      return summary.unverifiedOnly ? "Received unverified token" : `Received ${incoming ?? ""}`.trim();
    case "send":
      return `Sent ${outgoing ?? ""}`.trim();
    case "swap":
      return `Swapped ${outgoing ?? "?"} → ${incoming ?? "?"}`;
    case "stake":
      return `Staked ${outgoing ?? ""}`.trim();
    case "unstake":
      return `Withdrew ${incoming ?? ""}`.trim();
    default:
      return summary.title;
  }
}

const STATUS: Record<AccountEvent["status"], { label: string; icon: LucideIcon; tone: string }> = {
  confirmed: { label: "Confirmed", icon: CheckCircle2, tone: "text-text-secondary" },
  pending: { label: "Pending", icon: Clock3, tone: "text-text-primary" },
  failed: { label: "Failed", icon: XCircle, tone: "text-negative" },
};

function statusOf(event: AccountEvent): { label: string; icon: LucideIcon; tone: string } {
  if (event.kind === "alert") return { label: "Alert fired", icon: BellRing, tone: "text-text-secondary" };
  if (event.kind === "action") return { label: "Awaiting review", icon: Sparkles, tone: "text-text-primary" };
  return STATUS[event.status];
}

function DirectionMark({ event }: { event: AccountEvent }) {
  const direction = directionOf(event);
  const kind = event.summary?.kind;
  const Icon: LucideIcon =
    event.status === "failed"
      ? XCircle
      : event.status === "pending"
        ? Clock3
        : event.kind === "alert"
          ? BellRing
          : event.kind === "action"
            ? Sparkles
            : direction === "received"
              ? ArrowDownLeft
              : direction === "sent"
                ? ArrowUpRight
                : kind === "swap"
                  ? ArrowLeftRight
                  : kind === "account"
                    ? KeyRound
                    : kind === "stake" || kind === "unstake"
                      ? Coins
                      : Zap;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-pill border @max-[300px]:size-6",
        event.status === "failed"
          ? "border-negative/40 bg-negative-bg text-negative"
          : direction === "received"
            ? "border-border-subtle bg-positive-bg text-positive"
            : event.agent
              ? "border-border-subtle bg-surface-active text-agent-accent"
              : "border-border-subtle bg-surface-raised text-text-secondary",
      )}
    >
      <Icon size={13} strokeWidth={2} />
    </span>
  );
}

/** The signed amounts, in full. Wraps rather than cutting a digit. */
function Amounts({ event }: { event: AccountEvent }) {
  const amounts = event.summary?.amounts ?? [];
  const incoming = amounts.filter((entry) => entry.amount > 0);
  const outgoing = amounts.filter((entry) => entry.amount < 0);
  if (incoming.length === 0 && outgoing.length === 0) return null;
  const line = (entry: TxAmount, sign: "+" | "−") => (
    <span
      key={`${sign}${entry.mint ?? "sol"}`}
      className={cn(
        "type-mono-addr block break-all text-right",
        sign === "+" && !event.summary?.unverifiedOnly ? "text-positive" : "text-text-primary",
        event.status === "failed" && "text-text-muted line-through",
      )}
    >
      {sign}
      {formatTokenAmount(entry.amount)} {assetName(entry)}
    </span>
  );
  /* Shares a wrapping line with the label: beside it when both fit, on its
     own line under it when they do not — never squeezing the label. */
  return (
    <span className="ml-auto flex min-w-0 max-w-full flex-col items-end gap-0.5">
      {incoming.slice(0, 1).map((entry) => line(entry, "+"))}
      {outgoing.slice(0, 1).map((entry) => line(entry, "−"))}
    </span>
  );
}

function Details({ event }: { event: AccountEvent }) {
  const summary = event.summary ?? null;
  const signature = event.id.startsWith("tx:") ? event.id.slice(3) : null;
  const rows: Array<[string, React.ReactNode]> = [];
  if (summary) {
    for (const entry of summary.amounts) {
      rows.push([
        entry.amount > 0 ? "In" : "Out",
        <span key="a" className={cn("type-mono-addr break-all", entry.amount > 0 ? "text-positive" : "text-text-primary")}>
          {entry.amount > 0 ? "+" : "−"}
          {formatTokenAmount(entry.amount)} {assetName(entry)}
          {entry.symbol === null && <span className="text-text-muted"> (unverified)</span>}
        </span>,
      ]);
    }
    if (summary.counterparty) {
      rows.push([
        summary.kind === "receive" ? "From" : "To",
        <span key="c" className="type-mono-addr break-all text-text-secondary">{summary.counterparty}</span>,
      ]);
    }
    if (summary.via) rows.push(["Via", summary.via]);
    if (summary.feeSol !== null) rows.push(["Network fee", `${formatTokenAmount(summary.feeSol)} SOL`]);
  }
  if (event.kind === "transaction" && event.network !== undefined && event.network !== "solana") {
    rows.push(["Network", EVM_CHAINS[event.network].name]);
  }
  rows.push(["Status", statusOf(event).label]);
  rows.push(["Time", event.at === null ? "Not yet in a block" : `${formatTimestamp(event.at)} UTC`]);
  if (signature) {
    rows.push([
      event.network === undefined || event.network === "solana" ? "Signature" : "Transaction hash",
      <span key="s" className="type-mono-addr break-all text-text-secondary">{signature}</span>,
    ]);
  }
  if (event.kind === "transaction" && !summary) {
    rows.push(["Details", "This transaction could not be decoded; the explorer has the full record."]);
  }

  if (event.href) {
    rows.push([
      "Explorer",
      <a
        key="x"
        href={event.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
      >
        Open in {explorerName(event)}
        <ExternalLink size={11} strokeWidth={1.5} aria-hidden />
      </a>,
    ]);
  }

  return (
    <dl className="transaction-details mx-3 mb-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-control border border-border-subtle bg-surface-raised p-2.5 @max-[300px]:mx-2.5 @max-[300px]:gap-x-3">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="type-label text-text-muted">{label}</dt>
          <dd className="type-label min-w-0 text-text-secondary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Row({ event }: { event: AccountEvent }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const status = statusOf(event);
  const StatusIcon = status.icon;

  return (
    <li data-expanded={open} className={cn("metallic activity-row border-b border-border-subtle last:border-b-0", open && "bg-surface-raised/40")}>
      <div className="flex items-start">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailId}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "flex min-w-0 flex-1 items-start gap-2.5 py-2.5 pl-3 pr-1.5 text-left @max-[300px]:gap-2 @max-[300px]:pl-2.5",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          )}
        >
          <DirectionMark event={event} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="type-body-sm font-medium leading-5 text-text-primary [overflow-wrap:normal]">{actionLabel(event)}</span>
              <Amounts event={event} />
            </span>
            <span className={cn("type-label mt-0.5 flex flex-wrap items-center gap-x-1", status.tone)}>
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <StatusIcon size={11} strokeWidth={2} aria-hidden className="shrink-0" />
                {status.label}
              </span>
              {event.at && <span className="whitespace-nowrap text-text-muted">· {formatClock(event.at)}</span>}
            </span>
          </span>
          <ChevronDown size={14} aria-hidden className={cn("activity-chevron mt-1 shrink-0 text-text-secondary", open && "rotate-180")} />
        </button>
        {event.href ? (
          <a
            href={event.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open in ${explorerName(event)}`}
            title={`Open in ${explorerName(event)}`}
            /* In a narrow column the link moves into the row's details, so
               the label and the amount keep the width. */
            className="mr-1.5 mt-2 inline-flex size-7 shrink-0 items-center justify-center rounded-control text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] @max-[300px]:hidden"
          >
            <ExternalLink size={13} strokeWidth={1.5} aria-hidden />
          </a>
        ) : (
          <span aria-hidden className="mr-1.5 mt-2 inline-flex w-1 shrink-0" />
        )}
      </div>
      <div id={detailId} hidden={!open} className="transaction-expansion">
        <Details event={event} />
      </div>
    </li>
  );
}

/* ---- Filters ---- */

function Segmented({ value, onChange }: { value: Direction; onChange: (value: Direction) => void }) {
  return (
    <div role="radiogroup" aria-label="Direction" className="grid grid-cols-3 gap-0.5 rounded-control border border-border-subtle bg-surface-base p-0.5">
      {DIRECTIONS.map((option, index) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const next = DIRECTIONS[(index + (event.key === "ArrowRight" ? 1 : DIRECTIONS.length - 1)) % DIRECTIONS.length];
              onChange(next.id);
              (event.currentTarget.parentElement?.children[DIRECTIONS.indexOf(next)] as HTMLElement | undefined)?.focus();
            }}
            className={cn(
              "type-label h-7 rounded-chip transition-colors duration-[var(--dur-fast)] ease-brand",
              "focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
              active ? "bg-surface-active text-text-primary" : "text-text-secondary hover:text-text-primary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  icon: Icon,
}: {
  label: string;
  value: T;
  /** Value, full label, and a short label for a narrow column. */
  options: Array<[T, string, string]>;
  onChange: (value: T) => void;
  icon: LucideIcon;
}) {
  const current = options.find(([option]) => option === value) ?? options[0];
  return (
    /* The native select stays on top, invisible, so the platform picker and
       keyboard behaviour are untouched; the face underneath shows the value
       in whichever length fits. */
    <label
      className={cn(
        "relative flex h-7 min-w-0 items-center gap-1.5 rounded-control border border-border-subtle bg-surface-base pl-2 pr-6",
        "hover:border-border-strong focus-within:outline-2 focus-within:outline-[var(--focus-ring)]",
      )}
    >
      <span className="sr-only">{label}</span>
      <Icon size={12} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
      <span aria-hidden className="type-label truncate whitespace-nowrap text-text-secondary">
        <span className="@max-[300px]:hidden">{current[1]}</span>
        <span className="hidden @max-[300px]:inline">{current[2]}</span>
      </span>
      <ChevronDown size={12} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      >
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

const RANGE_SHORT: Record<DateRange, string> = { all: "All time", today: "Today", "7d": "7 days", "30d": "30 days" };

/* ---- The widget ---- */

function emptyMessage(filters: ActivityFilters): string {
  const what = filters.direction === "received" ? "received transactions" : filters.direction === "sent" ? "sent transactions" : "activity";
  const when = filters.range === "all" ? "" : ` ${RANGE_LABEL[filters.range].toLowerCase()}`;
  const query = filters.query.trim() ? ` matching “${filters.query.trim()}”` : "";
  return `No ${what}${when}${query}.`;
}

export function ActivityWidget(props: WidgetProps) {
  return <ActivityView {...props} auth={useElyraAuth()} feed={useAccountEvents()} />;
}

/** The widget with its data passed in, so it renders the same from fixtures. */
export function ActivityView({
  open,
  onOpenChange,
  controls,
  auth,
  feed,
}: WidgetProps & {
  auth: Pick<ElyraAuth, "available" | "login" | "solanaAddress">;
  feed: AccountFeed;
}) {
  const now = useMinute();
  const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_FILTERS);
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuId = useId();

  const set = <K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const shown = useMemo(
    () => (now === null ? feed.events : filterEvents(feed.events, filters, now)),
    [feed.events, filters, now],
  );

  const groups = useMemo(() => {
    if (now === null) return [];
    const out: Array<{ label: string; items: AccountEvent[] }> = [];
    /* Newest first, not-yet-in-a-block before everything — so each day is
       one group whatever order the feed arrived in. */
    const ordered = [...shown].sort(
      (a, b) => (b.at === null ? Infinity : Date.parse(b.at)) - (a.at === null ? Infinity : Date.parse(a.at)),
    );
    for (const event of ordered) {
      const label = event.at === null ? "Processing" : formatDayGroup(event.at, now);
      const last = out.at(-1);
      if (last && last.label === label) last.items.push(event);
      else out.push({ label, items: [event] });
    }
    return out;
  }, [shown, now]);

  const filtered =
    filters.direction !== "all" || filters.range !== "all" || filters.network !== "all" || filters.query.trim() !== "";
  const refresh = () => void feed.refetch();

  const header = (
    <>
      <SectionControl
        label={searching ? "Close search" : "Search activity"}
        onClick={() => {
          const next = !searching;
          setSearching(next);
          if (!next) set("query", "");
          else requestAnimationFrame(() => searchRef.current?.focus());
        }}
        className={cn("size-7 @max-[300px]:hidden", searching && "bg-surface-hover text-text-primary")}
      >
        <Search size={14} strokeWidth={1.5} aria-hidden />
      </SectionControl>
      <Popover
        id={menuId}
        label="Activity options"
        open={menuOpen}
        onOpenChange={setMenuOpen}
        className="w-52 p-1"
        trigger={
          <SectionControl
            label="More activity options"
            className="size-7"
            onClick={() => setMenuOpen((value) => !value)}
            aria-expanded={menuOpen}
            aria-controls={menuId}
          >
            <MoreHorizontal size={14} strokeWidth={1.5} aria-hidden />
          </SectionControl>
        }
      >
        <ul className="list-none">
          {/* In a narrow column the header has no room for the search button. */}
          <li className="hidden @max-[300px]:block">
            <button
              type="button"
              onClick={() => {
                setSearching(true);
                setMenuOpen(false);
                requestAnimationFrame(() => searchRef.current?.focus());
              }}
              className="type-label flex h-8 w-full items-center gap-2 rounded-control px-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <Search size={13} strokeWidth={1.5} aria-hidden /> Search activity
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                refresh();
                setMenuOpen(false);
              }}
              className="type-label flex h-8 w-full items-center gap-2 rounded-control px-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <RefreshCw size={13} strokeWidth={1.5} aria-hidden /> Refresh now
            </button>
          </li>
          {filtered && (
            <li>
              <button
                type="button"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setSearching(false);
                  setMenuOpen(false);
                }}
                className="type-label flex h-8 w-full items-center gap-2 rounded-control px-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              >
                <X size={13} strokeWidth={1.5} aria-hidden /> Clear filters
              </button>
            </li>
          )}
          <li>
            <Link
              href="/assets"
              onClick={() => setMenuOpen(false)}
              className="type-label flex h-8 items-center gap-2 rounded-control px-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <Activity size={13} strokeWidth={1.5} aria-hidden /> Full history
            </Link>
          </li>
          {auth.solanaAddress && (
            <li>
              <a
                href={accountExplorerUrl(auth.solanaAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="type-label flex h-8 items-center gap-2 rounded-control px-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              >
                <ExternalLink size={13} strokeWidth={1.5} aria-hidden /> Wallet on Solscan
              </a>
            </li>
          )}
        </ul>
      </Popover>
      {controls}
    </>
  );

  const ready = auth.available && feed.signedIn && !feed.loading && now !== null;

  return (
    <Section
      title="Activity"
      className="@container"
      icon={<Activity size={16} strokeWidth={1.5} />}
      meta={
        ready && feed.events.length > 0 ? (
          <span
            aria-label={`${shown.length} ${filtered ? "matching" : "items"}`}
            className="type-data-sm rounded-pill bg-surface-active px-1.5 text-text-primary @max-[250px]:hidden"
          >
            {shown.length}
          </span>
        ) : undefined
      }
      open={open}
      onOpenChange={onOpenChange}
      actions={ready ? header : controls}
    >
      {!auth.available ? (
        <p className="type-body-sm px-3 py-4 text-text-secondary">Sign-in is not configured, so there is no account to follow.</p>
      ) : !feed.signedIn && !feed.loading ? (
        <div className="px-3 py-4">
          <p className="type-body-sm text-text-secondary">Connect a wallet to follow its transfers, swaps, fired alerts and actions awaiting review.</p>
          <Button className="mt-3" size="sm" variant="accent" onClick={auth.login}>
            Connect wallet
          </Button>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-col gap-2 border-b border-border-subtle px-3 pb-2.5 pt-2.5">
            {searching && (
              <label className="flex h-8 items-center gap-2 rounded-control border border-border-strong bg-surface-base px-2 focus-within:border-accent-quiet">
                <Search size={13} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
                <span className="sr-only">Search by token, address or signature</span>
                <input
                  ref={searchRef}
                  value={filters.query}
                  onChange={(event) => set("query", event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      set("query", "");
                      setSearching(false);
                    }
                  }}
                  placeholder="Token, address or signature"
                  className="type-label min-w-0 flex-1 bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none"
                />
                {filters.query && (
                  <button type="button" aria-label="Clear search" onClick={() => set("query", "")} className="text-text-muted hover:text-text-primary">
                    <X size={12} strokeWidth={1.5} aria-hidden />
                  </button>
                )}
              </label>
            )}
            <Segmented value={filters.direction} onChange={(value) => set("direction", value)} />
            <div className="flex items-center justify-between gap-2">
              <Select<DateRange>
                label="Date range"
                icon={CalendarDays}
                value={filters.range}
                onChange={(value) => set("range", value)}
                options={(Object.keys(RANGE_LABEL) as DateRange[]).map((range) => [range, RANGE_LABEL[range], RANGE_SHORT[range]])}
              />
              <Select<Network>
                label="Network"
                icon={NetworkIcon}
                value={filters.network}
                onChange={(value) => set("network", value)}
                options={[
                  ["all", "All networks", "All"],
                  ["solana", "Solana", "Solana"],
                  ["ethereum", "Ethereum", "Ethereum"],
                  ["robinhood", "Robinhood Chain", "Robinhood"],
                ]}
              />
            </div>
          </div>

          {/* List */}
          <div aria-busy={feed.loading || feed.refreshing} className="max-h-[340px] overflow-y-auto overscroll-contain">
            {feed.loading || now === null ? (
              <ul aria-label="Loading activity" className="list-none">
                {[0, 1, 2, 3].map((row) => (
                  <li key={row} className="flex items-center gap-2.5 border-b border-border-subtle px-3 py-2.5 last:border-b-0">
                    <span className="skeleton size-7 rounded-pill" />
                    <span className="flex flex-1 flex-col gap-1.5">
                      <span className="skeleton h-3.5 w-24" />
                      <span className="skeleton h-3 w-16" />
                    </span>
                    <span className="skeleton h-3.5 w-20" />
                  </li>
                ))}
              </ul>
            ) : feed.error !== null && feed.events.length === 0 ? (
              <div role="alert" className="px-3 py-5 text-center">
                <p className="type-body-sm text-text-secondary">Activity could not be loaded.</p>
                <p className="type-label mt-1 break-words text-text-muted">{feed.error}</p>
                <Button className="mt-3" size="sm" variant="quiet" onClick={refresh} disabled={feed.refreshing}>
                  {feed.refreshing ? "Retrying…" : "Retry"}
                </Button>
              </div>
            ) : shown.length === 0 ? (
              <div className="px-3 py-5 text-center">
                <p className="type-body-sm text-text-secondary">
                  {feed.events.length === 0 ? "No activity yet. Transfers and swaps from this wallet land here." : emptyMessage(filters)}
                </p>
                {filtered && feed.events.length > 0 && (
                  <Button className="mt-3" size="sm" variant="quiet" onClick={() => setFilters(DEFAULT_FILTERS)}>
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.label} aria-label={group.label}>
                  <h3 className="type-eyebrow sticky top-0 z-[1] flex items-center gap-2 bg-surface-panel px-3 pb-1 pt-2 text-text-muted">
                    <span className="shrink-0">{group.label}</span>
                    <span aria-hidden className="h-px flex-1 bg-border-subtle" />
                  </h3>
                  <ul className="list-none">
                    {group.items.map((event) => (
                      <Row key={event.id} event={event} />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>

          {/* A network whose history could not be read, named — so the list
              above is not taken for the whole of this account's activity. */}
          {feed.notes.length > 0 && (
            <ul className="list-none border-t border-border-subtle px-3 py-2">
              {feed.notes.map((note) => (
                <li key={note} className="type-label text-text-muted">
                  {note}
                </li>
              ))}
            </ul>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 border-t border-border-subtle px-3 py-2">
            <Link
              href="/assets"
              className="type-label inline-flex min-w-0 items-center gap-1 rounded-control px-1 py-1 text-text-primary hover:text-accent focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <span className="whitespace-nowrap">
                View all<span className="@max-[300px]:hidden"> activity</span>
              </span>
              <ArrowRight size={12} strokeWidth={1.75} aria-hidden />
            </Link>
            <span className="type-label ml-auto truncate text-text-muted" aria-live="polite">
              {feed.refreshing
                ? "Updating…"
                : feed.fetchedAt !== null && now !== null
                  ? (
                      <>
                        <span className="@max-[300px]:hidden">Updated </span>
                        {formatRelativeTime(new Date(feed.fetchedAt).toISOString(), Math.max(now, feed.fetchedAt))}
                      </>
                    )
                  : feed.error
                    ? "Not updated"
                    : ""}
            </span>
            <SectionControl label="Refresh activity" onClick={refresh} disabled={feed.refreshing} className="size-7 shrink-0">
              <RefreshCw size={13} strokeWidth={1.5} aria-hidden className={cn(feed.refreshing && "animate-spin")} />
            </SectionControl>
          </div>
        </>
      )}
    </Section>
  );
}
