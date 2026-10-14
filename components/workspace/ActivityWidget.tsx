"use client";

import { useId, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BellRing,
  ChevronRight,
  ClipboardList,
  Coins,
  ExternalLink,
  Image as ImageIcon,
  KeyRound,
  Sparkles,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import { Section } from "@/components/ui/Section";
import type { WidgetProps } from "@/components/workspace/WidgetColumn";
import type { AccountEvent } from "@/lib/activity/events";
import { useAccountEvents } from "@/lib/activity/useAccountEvents";
import { formatDayGroup, formatRelativeTime, formatTimestamp } from "@/lib/format";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { assetName, formatAmount, shortAddress, type TxAmount, type TxKind } from "@/lib/wallet/summarise";

/* ---------------------------------------------------------------------------
   Activity: what happened on the account, newest first.

   Wallet transactions say what they did — "Swapped 2 SOL for 290 USDC",
   "Sent 1 SOL to 7xKX…9fGh" — read from their net effect on the wallet
   (lib/wallet/summarise.ts), led by the token's own mark and a badge for
   the direction. Fired alerts and actions awaiting review sit in the same
   feed. A strip at the top shows the last three weeks at a glance.

   A row expands in place to the rest: the fee, the route, the counterparty,
   the exact time and the explorer.
--------------------------------------------------------------------------- */

const STRIP_DAYS = 21;
const DAY = 86_400_000;
/** SOL's mark, from the same CoinMarketCap artwork as the watchlist. */
const SOL_LOGO = "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png";

const KIND_ICON: Record<TxKind, LucideIcon> = {
  receive: ArrowDownLeft,
  send: ArrowUpRight,
  swap: ArrowLeftRight,
  stake: Coins,
  unstake: Coins,
  nft: ImageIcon,
  account: KeyRound,
  other: Zap,
};

const KIND_WORD: Record<TxKind, string> = {
  receive: "Received",
  send: "Sent",
  swap: "Swap",
  stake: "Staked",
  unstake: "Withdrawn",
  nft: "NFT",
  account: "Account",
  other: "Interaction",
};

/** The asset the row is about: what came in, else what went out. */
function headline(event: AccountEvent): TxAmount | null {
  const amounts = event.summary?.amounts ?? [];
  return amounts.find((entry) => entry.amount > 0) ?? amounts.find((entry) => entry.amount < 0) ?? null;
}

/* ---- The mark at the start of a row ---- */

function Avatar({ event }: { event: AccountEvent }) {
  const failed = event.status === "failed";
  const summary = event.summary ?? null;

  if (event.kind === "transaction" && summary !== null && !failed) {
    const lead = headline(event);
    const Badge = KIND_ICON[summary.kind];
    const logo = lead === null ? null : lead.symbol === "SOL" && lead.mint === null ? SOL_LOGO : lead.icon;
    return (
      <span className="relative mt-0.5 shrink-0">
        {lead !== null ? (
          <CoinMark symbol={assetName(lead)} logo={logo} size={32} className={cn(summary.unverifiedOnly && "opacity-60")} />
        ) : (
          <span className="inline-flex size-8 items-center justify-center rounded-pill border border-border-subtle bg-surface-raised text-text-secondary">
            <Badge size={15} strokeWidth={1.5} aria-hidden />
          </span>
        )}
        {lead !== null && (
          <span
            aria-hidden
            className={cn(
              "absolute -bottom-1 -right-1 inline-flex size-[18px] items-center justify-center rounded-pill border-2 border-surface-panel",
              summary.kind === "receive" || summary.kind === "unstake"
                ? "bg-sage text-surface-base"
                : "bg-surface-active text-text-primary",
            )}
          >
            <Badge size={10} strokeWidth={2.25} />
          </span>
        )}
      </span>
    );
  }

  const Icon: LucideIcon = failed
    ? TriangleAlert
    : event.kind === "alert"
      ? BellRing
      : event.kind === "action"
        ? Sparkles
        : event.kind === "venue"
          ? ClipboardList
          : ArrowLeftRight;
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-pill border",
        failed
          ? "border-negative/40 bg-negative-bg text-negative"
          : event.agent
            ? "border-border-subtle bg-surface-active text-agent-accent"
            : "border-border-subtle bg-surface-raised text-text-secondary",
      )}
    >
      <Icon size={15} strokeWidth={1.5} />
    </span>
  );
}

/* ---- One row ---- */

function Amounts({ event }: { event: AccountEvent }) {
  const amounts = event.summary?.amounts ?? [];
  if (event.status === "failed") {
    return <span className="type-label rounded-chip bg-negative-bg px-1.5 text-negative">Failed</span>;
  }
  const incoming = amounts.filter((entry) => entry.amount > 0);
  const outgoing = amounts.filter((entry) => entry.amount < 0);
  if (incoming.length === 0 && outgoing.length === 0) return null;
  return (
    <span className="flex flex-col items-end leading-tight">
      {incoming.slice(0, 1).map((entry) => (
        <span key={`in-${entry.mint ?? "sol"}`} className={cn("type-data-sm", event.summary?.unverifiedOnly ? "text-text-muted" : "text-positive")}>
          +{formatAmount(entry.amount)} {assetName(entry)}
        </span>
      ))}
      {outgoing.slice(0, 1).map((entry) => (
        <span key={`out-${entry.mint ?? "sol"}`} className="type-data-sm text-text-secondary">
          −{formatAmount(entry.amount)} {assetName(entry)}
        </span>
      ))}
    </span>
  );
}

function ActivityRow({ event, now }: { event: AccountEvent; now: number }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const summary = event.summary ?? null;
  const spam = summary?.unverifiedOnly === true;

  const context = [
    summary?.via,
    summary?.counterparty && summary.kind === "receive" ? `from ${shortAddress(summary.counterparty)}` : null,
    event.at ? formatRelativeTime(event.at, now) : "Processing",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className={cn("border-b border-border-subtle last:border-b-0", event.agent && "agent-rail")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-start gap-3 py-2.5 pr-3 text-left",
          event.agent ? "pl-[10px]" : "pl-3",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
        )}
      >
        <Avatar event={event} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "type-body-sm block",
              !open && "line-clamp-1",
              spam ? "text-text-secondary" : "text-text-primary",
            )}
          >
            {event.text}
          </span>
          <span className="type-label mt-0.5 flex items-center gap-1.5 text-text-muted">
            {spam && <span className="rounded-chip border border-border-subtle px-1 text-text-secondary">Possible spam</span>}
            <span className="truncate">{context}</span>
          </span>
        </span>
        <span className="mt-0.5 flex shrink-0 items-start gap-1.5">
          <Amounts event={event} />
          <ChevronRight
            size={14}
            strokeWidth={1.5}
            aria-hidden
            className={cn(
              "mt-0.5 text-text-muted transition-transform duration-[var(--dur-base)] ease-brand",
              open && "rotate-90",
            )}
          />
        </span>
      </button>

      <div id={detailId} hidden={!open} className={cn("pb-3 pr-3", event.agent ? "pl-[54px]" : "pl-14")}>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-control border border-border-subtle bg-surface-raised p-2.5">
          {summary && (
            <>
              <dt className="type-label text-text-muted">Kind</dt>
              <dd className="type-label text-text-secondary">{KIND_WORD[summary.kind]}</dd>
              {summary.amounts.map((entry) => (
                <FragmentRow key={`${entry.mint ?? "sol"}-${entry.amount}`} entry={entry} />
              ))}
              {summary.via && (
                <>
                  <dt className="type-label text-text-muted">Via</dt>
                  <dd className="type-label text-text-secondary">{summary.via}</dd>
                </>
              )}
              {summary.counterparty && (
                <>
                  <dt className="type-label text-text-muted">{summary.kind === "receive" ? "From" : "To"}</dt>
                  <dd className="type-mono-addr truncate text-text-secondary" title={summary.counterparty}>
                    {shortAddress(summary.counterparty)}
                  </dd>
                </>
              )}
              {summary.feeSol !== null && (
                <>
                  <dt className="type-label text-text-muted">Network fee</dt>
                  <dd className="type-data-sm text-text-secondary">{formatAmount(summary.feeSol)} SOL</dd>
                </>
              )}
            </>
          )}
          <dt className="type-label text-text-muted">Status</dt>
          <dd className={cn("type-label capitalize", event.status === "failed" ? "text-negative" : "text-text-secondary")}>
            {event.status}
          </dd>
          <dt className="type-label text-text-muted">Time</dt>
          <dd className="type-data-sm text-text-secondary">
            {event.at === null ? "Not yet in a block" : `${formatTimestamp(event.at)} UTC`}
          </dd>
        </dl>
        {event.href !== null && (
          <a
            href={event.href}
            target="_blank"
            rel="noopener noreferrer"
            className="type-label mt-2 inline-flex items-center gap-1 text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            View on explorer
            <ExternalLink size={11} strokeWidth={1.5} aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}

function FragmentRow({ entry }: { entry: TxAmount }) {
  return (
    <>
      <dt className="type-label text-text-muted">{entry.amount > 0 ? "In" : "Out"}</dt>
      <dd className={cn("type-data-sm", entry.amount > 0 ? "text-positive" : "text-text-secondary")}>
        {entry.amount > 0 ? "+" : "−"}
        {formatAmount(entry.amount)} {assetName(entry)}
        {entry.symbol === null && <span className="text-text-muted"> · unverified</span>}
      </dd>
    </>
  );
}

/* ---- Three weeks at a glance ---- */

function ActivityStrip({ events, now }: { events: AccountEvent[]; now: number }) {
  const { days, total, counts, last } = useMemo(() => {
    const startOfToday = Math.floor(now / DAY) * DAY;
    const buckets = new Array<number>(STRIP_DAYS).fill(0);
    const tally: Record<string, number> = {};
    let latest: string | null = null;
    for (const event of events) {
      if (event.at === null) continue;
      const at = Date.parse(event.at);
      const index = STRIP_DAYS - 1 - Math.floor((startOfToday - Math.floor(at / DAY) * DAY) / DAY);
      if (index < 0 || index >= STRIP_DAYS) continue;
      buckets[index] += 1;
      const key = event.status === "failed" ? "failed" : event.summary?.kind ?? event.kind;
      tally[key] = (tally[key] ?? 0) + 1;
      if (latest === null || at > Date.parse(latest)) latest = event.at;
    }
    return { days: buckets, total: buckets.reduce((sum, count) => sum + count, 0), counts: tally, last: latest };
  }, [events, now]);

  const max = Math.max(1, ...days);
  const chips: Array<[string, string]> = [
    ["swap", "swaps"],
    ["receive", "received"],
    ["send", "sent"],
    ["alert", "alerts"],
    ["action", "to review"],
    ["failed", "failed"],
  ];

  return (
    <div className="border-b border-border-subtle px-3 pb-3 pt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="type-label text-text-secondary">
          <span className="type-data text-text-primary">{total}</span> in the last {STRIP_DAYS} days
        </p>
        {last && <p className="type-label text-text-muted">last {formatRelativeTime(last, now)}</p>}
      </div>
      <div
        role="img"
        aria-label={`Activity per day over the last ${STRIP_DAYS} days, ${total} in all`}
        className="mt-2 flex h-9 items-end gap-[3px]"
      >
        {days.map((count, index) => (
          <span
            key={index}
            className={cn(
              "flex-1 rounded-[2px]",
              count === 0 ? "bg-surface-hover" : index === STRIP_DAYS - 1 ? "bg-accent" : "bg-accent-quiet",
            )}
            style={{ height: count === 0 ? 3 : `${Math.max(18, (count / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {chips
          .filter(([key]) => (counts[key] ?? 0) > 0)
          .map(([key, word]) => (
            <span
              key={key}
              className={cn(
                "type-label rounded-chip px-1.5",
                key === "failed" ? "bg-negative-bg text-negative" : "bg-surface-hover text-text-secondary",
              )}
            >
              {counts[key]} {word}
            </span>
          ))}
      </div>
    </div>
  );
}

/* ---- The widget ---- */

export function ActivityWidget({ open, onOpenChange, controls }: WidgetProps) {
  const auth = useElyraAuth();
  const { events, signedIn, loading, error } = useAccountEvents();
  const now = useMinute();

  const groups = useMemo(() => {
    if (now === null) return [];
    const out: Array<{ label: string; items: AccountEvent[] }> = [];
    for (const event of events) {
      const label = event.at === null ? "Processing" : formatDayGroup(event.at, now);
      const last = out.at(-1);
      if (last && last.label === label) last.items.push(event);
      else out.push({ label, items: [event] });
    }
    return out;
  }, [events, now]);

  return (
    <Section
      title="Activity"
      icon={<Activity size={16} strokeWidth={1.5} />}
      meta={signedIn && events.length > 0 ? events.length : undefined}
      open={open}
      onOpenChange={onOpenChange}
      actions={controls}
    >
      {!auth.available ? (
        <p className="type-body-sm px-3 py-4 text-text-secondary">Sign-in is not configured, so there is no account to follow.</p>
      ) : loading || now === null ? (
        <div className="flex flex-col gap-2.5 px-3 py-4" aria-label="Loading activity">
          {[0, 1, 2].map((row) => (
            <span key={row} className="flex items-center gap-3">
              <span className="skeleton size-8 rounded-pill" />
              <span className="skeleton h-4 flex-1" />
            </span>
          ))}
        </div>
      ) : !signedIn ? (
        <div className="px-3 py-4">
          <p className="type-body-sm text-text-secondary">
            Connect a wallet to follow its swaps, transfers, fired alerts and actions awaiting review.
          </p>
          <Button className="mt-3" size="sm" variant="accent" onClick={auth.login}>
            Connect wallet
          </Button>
        </div>
      ) : events.length === 0 ? (
        <p className="type-body-sm px-3 py-4 text-text-secondary">
          {error ?? "Nothing yet. Swaps, transfers, fired alerts and actions awaiting review land here."}
        </p>
      ) : (
        <>
          <ActivityStrip events={events} now={now} />
          <div className="max-h-[360px] overflow-y-auto">
            {groups.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h3 className="type-eyebrow sticky top-0 z-[1] border-b border-border-subtle bg-surface-panel px-3 py-1.5 text-text-muted">
                  {group.label}
                </h3>
                <ul className="list-none">
                  {group.items.map((item) => (
                    <ActivityRow key={item.id} event={item} now={now} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}
