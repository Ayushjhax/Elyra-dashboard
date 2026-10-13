"use client";

import { useId, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  BellRing,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import type { WidgetProps } from "@/components/workspace/WidgetColumn";
import type { AccountEvent, AccountEventKind } from "@/lib/activity/events";
import { useAccountEvents } from "@/lib/activity/useAccountEvents";
import { formatDayGroup, formatRelativeTime, formatTimestamp } from "@/lib/format";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Activity: the signed-in account's own events — wallet transactions, venue
   activity, price alerts that fired and actions awaiting review — newest
   first, grouped by day. See lib/activity/events.ts for what each source
   can and cannot say.

   A row is one line so the feed scans, and expands in place to the whole
   event: the full description, its kind and status, the exact time and the
   explorer link where there is one.
--------------------------------------------------------------------------- */

const KIND: Record<AccountEventKind, { icon: LucideIcon; label: string }> = {
  transaction: { icon: ArrowLeftRight, label: "Wallet transaction" },
  venue: { icon: ClipboardList, label: "Venue" },
  alert: { icon: BellRing, label: "Price alert" },
  action: { icon: Sparkles, label: "Awaiting review" },
};

const STATUS_TONE: Record<AccountEvent["status"], string> = {
  confirmed: "bg-surface-hover text-text-secondary",
  pending: "bg-surface-hover text-text-muted",
  failed: "bg-negative-bg text-negative",
};

type Group = { label: string; items: AccountEvent[] };

/** Grouped by day, newest first. Undated (still processing) events lead. */
function groupByDay(items: AccountEvent[], now: number): Group[] {
  const groups: Group[] = [];
  for (const item of items) {
    const label = item.at === null ? "Processing" : formatDayGroup(item.at, now);
    const last = groups.at(-1);
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function ActivityRow({ item, now }: { item: AccountEvent; now: number }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const kind = KIND[item.kind];
  const Icon = item.status === "failed" ? TriangleAlert : kind.icon;

  return (
    <li className={cn("border-b border-border-subtle last:border-b-0", item.agent && "agent-rail")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-start gap-2.5 py-2.5 pr-3 text-left",
          item.agent ? "pl-[10px]" : "pl-3",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
        )}
      >
        <Icon
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className={cn(
            "mt-px shrink-0",
            item.status === "failed" ? "text-negative" : item.agent ? "text-agent-accent" : "text-text-muted",
          )}
        />
        <span className={cn("type-body-sm min-w-0 flex-1 text-text-primary", !open && "line-clamp-1")}>
          {item.text}
        </span>
        {item.at !== null && (
          <time dateTime={item.at} className="type-data-sm mt-px shrink-0 text-text-muted">
            {formatRelativeTime(item.at, now)}
          </time>
        )}
        <ChevronRight
          size={14}
          strokeWidth={1.5}
          aria-hidden
          className={cn(
            "mt-0.5 shrink-0 text-text-muted transition-transform duration-[var(--dur-base)] ease-brand",
            open && "rotate-90",
          )}
        />
      </button>

      <div id={detailId} hidden={!open} className={cn("pb-3 pr-3", item.agent ? "pl-[36px]" : "pl-[38px]")}>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt className="type-label text-text-muted">Kind</dt>
          <dd className="type-label text-text-secondary">{kind.label}</dd>
          <dt className="type-label text-text-muted">Status</dt>
          <dd>
            <span className={cn("type-label rounded-chip px-1.5 py-0.5 capitalize", STATUS_TONE[item.status])}>
              {item.status}
            </span>
          </dd>
          <dt className="type-label text-text-muted">Time</dt>
          <dd className="type-data-sm text-text-secondary">
            {item.at === null ? "Not yet in a block" : `${formatTimestamp(item.at)} UTC`}
          </dd>
        </dl>
        {item.href !== null && (
          <a
            href={item.href}
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

export function ActivityWidget({ open, onOpenChange, controls }: WidgetProps) {
  const auth = useElyraAuth();
  const { events, signedIn, loading, error } = useAccountEvents();
  const now = useMinute();
  const groups = now === null ? [] : groupByDay(events, now);

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
        <div className="flex flex-col gap-2 px-3 py-4" aria-label="Loading activity">
          <span className="skeleton block h-4 w-4/5" />
          <span className="skeleton block h-4 w-3/5" />
        </div>
      ) : !signedIn ? (
        <div className="px-3 py-4">
          <p className="type-body-sm text-text-secondary">
            Connect a wallet to follow its transactions, fired alerts and actions awaiting review.
          </p>
          <Button className="mt-3" size="sm" variant="accent" onClick={auth.login}>
            Connect wallet
          </Button>
        </div>
      ) : events.length === 0 ? (
        <p className="type-body-sm px-3 py-4 text-text-secondary">
          {error ?? "Nothing yet. Transactions, fired alerts and actions awaiting review land here."}
        </p>
      ) : (
        <div className="max-h-[320px] overflow-y-auto">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="type-eyebrow sticky top-0 z-[1] border-b border-border-subtle bg-surface-panel px-3 py-2 text-text-muted">
                {group.label}
              </h3>
              <ul className="list-none">
                {group.items.map((item) => (
                  <ActivityRow key={item.id} item={item} now={now} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Section>
  );
}
