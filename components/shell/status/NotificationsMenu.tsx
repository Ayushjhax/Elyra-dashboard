"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  BellRing,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  groupByDay,
  isUnread,
  notificationsFrom,
  type NotificationCategory,
  type NotificationItem,
} from "@/lib/activity/notifications";
import { useAccountEvents, type AccountFeed } from "@/lib/activity/useAccountEvents";
import { formatRelativeTime } from "@/lib/format";
import { useElyraStore } from "@/lib/store";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Notifications.

   The account events that ask for attention — a price alert that fired, an
   action waiting on review, a transaction that failed — from the same shared
   stores the Activity widget reads, so the bell costs no request of its own.
   lib/activity/notifications.ts names them, routes them and decides what is
   unread; this file draws them on the header's forest glass.

   Opening the menu no longer marks everything read: a notification is read
   when it is opened, or when Mark all read is pressed. That is what lets the
   Unread tab mean something.
--------------------------------------------------------------------------- */

const SETTINGS_HREF = "/agent";

const CATEGORY: Record<NotificationCategory, { icon: LucideIcon; tone: string; label: string }> = {
  alert: { icon: BellRing, tone: "text-accent", label: "Price alert" },
  action: { icon: ClipboardCheck, tone: "text-accent", label: "Action" },
  failed: { icon: CircleAlert, tone: "text-negative", label: "Failure" },
  agent: { icon: Sparkles, tone: "text-agent-accent", label: "Elyra" },
};

function absolute(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function CaughtUp({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <svg viewBox="0 0 96 64" aria-hidden className="h-14 w-auto">
        <g className="text-border-strong" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M14 26l6 3M12 34h7M14 42l6-3M82 26l-6 3M84 34h-7M82 42l-6-3" />
        </g>
        <circle cx="48" cy="34" r="22" className="fill-surface-hover" />
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" className="text-text-secondary">
          <path d="M40 40V33a8 8 0 0 1 16 0v7l2 3H38l2-3Z" />
          <path d="M45.5 46a2.6 2.6 0 0 0 5 0M48 22.5v2" />
        </g>
        <circle cx="56.5" cy="44" r="6" className="fill-surface-panel text-accent" stroke="currentColor" strokeWidth="1.6" />
        <path d="M53.8 44l1.8 1.8 3.4-3.6" fill="none" className="text-accent" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="type-h2 mt-3 font-sans text-text-primary">{title}</p>
      <p className="type-body-sm mt-1 text-text-secondary">{body}</p>
    </div>
  );
}

function Row({
  item,
  unread,
  now,
  onOpen,
}: {
  item: NotificationItem;
  unread: boolean;
  now: number | null;
  onOpen: (item: NotificationItem) => void;
}) {
  const meta = CATEGORY[item.category];
  const Icon = meta.icon;
  const hasDestination = item.target !== null;

  const body = (
    <>
      <span aria-hidden className="glass-inset grid size-10 shrink-0 place-items-center rounded-[10px] border">
        <Icon size={18} strokeWidth={1.5} className={cn(meta.tone, !unread && "opacity-80")} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn("type-body-sm min-w-0 flex-1 truncate font-medium", unread ? "text-text-primary" : "text-text-secondary")}>
            {item.title}
          </span>
          <time dateTime={item.at} title={absolute(item.at)} className="type-label shrink-0 tabular-nums text-text-muted">
            {now === null ? "" : formatRelativeTime(item.at, now)}
          </time>
        </span>
        <span className={cn("type-label mt-0.5 line-clamp-2 break-words", unread ? "text-text-secondary" : "text-text-muted")}>
          {item.description}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 self-center">
        <span aria-hidden className={cn("size-2 rounded-pill", unread ? "bg-accent" : "bg-transparent")} />
        {hasDestination ? (
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-muted" />
        ) : (
          <span aria-hidden className="w-4" />
        )}
      </span>
      <span className="sr-only">
        {unread ? ", unread" : ", read"}
        {item.target?.kind === "link" && item.target.external ? ", opens in a new tab" : ""}
      </span>
    </>
  );

  const rowClass = "glass-row flex w-full items-start gap-3 rounded-[12px] px-3 py-3 text-left";
  const open = () => onOpen(item);

  if (item.target?.kind === "link") {
    return item.target.external ? (
      <a href={item.target.href} target="_blank" rel="noopener noreferrer" onClick={open} className={rowClass}>
        {body}
      </a>
    ) : (
      <Link href={item.target.href} onClick={open} className={rowClass}>
        {body}
      </Link>
    );
  }
  if (item.target?.kind === "alerts") {
    return (
      <Link href="/" onClick={open} className={rowClass}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={open} className={rowClass}>
      {body}
    </button>
  );
}

export function NotificationsMenu() {
  return <NotificationsMenuView feed={useAccountEvents()} />;
}

/** The menu with its feed passed in, so every state renders from fixtures too. */
export function NotificationsMenuView({ feed }: { feed: AccountFeed }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const seenAt = useElyraStore((state) => state.notificationsSeenAt);
  const readIds = useElyraStore((state) => state.notificationsReadIds);
  const markAllRead = useElyraStore((state) => state.markNotificationsSeen);
  const markRead = useElyraStore((state) => state.markNotificationRead);
  const reviewPendingActions = useElyraStore((state) => state.reviewPendingActions);
  const now = useMinute();

  const items = useMemo(() => notificationsFrom(feed.events), [feed.events]);
  const unreadItems = items.filter((item) => isUnread(item, seenAt, readIds));
  const unread = unreadItems.length;
  const shown = tab === "unread" ? unreadItems : items;
  const groups = now === null ? [{ label: "", items: shown }] : groupByDay(shown, now);

  const onOpen = (item: NotificationItem) => {
    markRead(item.id);
    if (item.target?.kind === "review-actions") reviewPendingActions();
    if (item.target !== null) setOpen(false);
  };

  let body: React.ReactNode;
  if (!feed.signedIn && !feed.loading) {
    body = <CaughtUp title="Nothing to show yet" body="Connect a wallet to hear when an alert fires or an action needs review." />;
  } else if (feed.loading && items.length === 0) {
    body = (
      <ul aria-busy="true" aria-label="Loading notifications" className="flex list-none flex-col gap-1 p-2">
        {[0, 1, 2].map((index) => (
          <li key={index} aria-hidden className="flex items-start gap-3 px-3 py-3">
            <span className="skeleton size-10 rounded-[10px]" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="skeleton h-3.5 w-2/3" />
              <span className="skeleton h-3 w-full" />
            </span>
          </li>
        ))}
      </ul>
    );
  } else if (feed.error !== null && items.length === 0) {
    body = (
      <div role="alert" className="flex flex-col items-center gap-2 px-6 py-8 text-center">
        <CircleAlert size={22} strokeWidth={1.5} aria-hidden className="text-negative" />
        <p className="type-h2 font-sans text-text-primary">Notifications couldn&rsquo;t load</p>
        <p className="type-body-sm text-text-secondary">{feed.error}</p>
        <button
          type="button"
          onClick={() => void feed.refetch()}
          disabled={feed.refreshing}
          className="glass-outline type-body-sm mt-1 inline-flex h-9 items-center gap-2 rounded-[10px] border px-3.5 text-text-primary disabled:opacity-60"
        >
          <RefreshCw size={14} strokeWidth={1.5} aria-hidden className={cn(feed.refreshing && "motion-safe:animate-spin")} />
          Try again
        </button>
      </div>
    );
  } else if (items.length === 0) {
    body = <CaughtUp title="You’re all caught up" body="New alerts and updates will appear here." />;
  } else if (shown.length === 0) {
    body = <CaughtUp title="No unread notifications" body="You’re up to date." />;
  } else {
    body = (
      <div className="flex flex-col gap-1 px-2 pb-2">
        {groups.map((group) => (
          <section key={group.label || "all"} aria-label={group.label || "Notifications"}>
            {group.label !== "" && (
              <h3 className="type-eyebrow px-3 pb-1.5 pt-3 uppercase text-text-muted">{group.label}</h3>
            )}
            <ul className="flex list-none flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <Row item={item} unread={isUnread(item, seenAt, readIds)} now={now} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <Popover
      id="notifications"
      label="Notifications"
      open={open}
      onOpenChange={setOpen}
      surface="glass"
      pinOnPhone
      className="flex max-h-[min(600px,calc(100dvh-var(--header-h)-24px))] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden"
      trigger={
        <button
          type="button"
          aria-expanded={open}
          aria-controls="notifications"
          aria-haspopup="dialog"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "relative inline-flex size-9 items-center justify-center rounded-control",
            "text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
            "hover:bg-surface-hover hover:text-text-primary",
            open && "bg-surface-hover text-text-primary",
          )}
        >
          <Bell size={18} strokeWidth={1.5} aria-hidden />
          {unread > 0 && (
            <span aria-hidden className="absolute right-2 top-2 size-2 rounded-pill border-2 border-surface-base bg-accent" />
          )}
        </button>
      }
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-4 py-3.5">
        <span aria-hidden className="glass-inset grid size-9 shrink-0 place-items-center rounded-[10px] border text-text-primary">
          <Bell size={18} strokeWidth={1.5} />
        </span>
        <h2 className="type-h2 font-sans text-text-primary">Notifications</h2>
        <span className="glass-inset type-label rounded-pill border px-2.5 py-0.5 tabular-nums text-text-secondary">
          {unread} unread
        </span>
        <Link
          href={SETTINGS_HREF}
          onClick={() => setOpen(false)}
          aria-label="Notification settings"
          title="Notification settings"
          className="glass-row glass-outline ml-auto grid size-9 shrink-0 place-items-center rounded-[10px] border text-text-secondary hover:text-text-primary"
        >
          <Settings size={17} strokeWidth={1.5} aria-hidden />
        </Link>
      </header>

      <Tabs value={tab} onValueChange={(value) => setTab(value as "all" | "unread")} className="shrink-0">
        <div className="flex items-center gap-2 border-b border-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-4">
          <TabsList aria-label="Which notifications" className="-mb-px gap-3">
            <TabsTrigger value="all" data-autofocus className="type-body-sm h-11 px-1.5">
              All
            </TabsTrigger>
            <TabsTrigger value="unread" className="type-body-sm h-11 gap-2 px-1.5">
              Unread
              {unread > 0 && (
                <span className="glass-inset type-label min-w-5 rounded-[6px] border px-1.5 text-center tabular-nums text-accent">{unread}</span>
              )}
            </TabsTrigger>
          </TabsList>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => {
                if (items[0] !== undefined) markAllRead(items[0].at);
              }}
              className="type-body-sm ml-auto rounded-[8px] px-2 py-1 font-medium text-accent transition-colors duration-[var(--dur-fast)] ease-brand hover:text-accent-hover"
            >
              Mark all read
            </button>
          )}
        </div>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>

      <Link
        href={SETTINGS_HREF}
        onClick={() => setOpen(false)}
        className="glass-row flex shrink-0 items-center gap-3 border-t border-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-4 py-3"
      >
        <span aria-hidden className="glass-inset grid size-10 shrink-0 place-items-center rounded-[10px] border text-text-secondary">
          <SlidersHorizontal size={18} strokeWidth={1.5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="type-body-sm block font-medium text-text-primary">Delivery settings</span>
          <span className="type-label block text-text-secondary">Choose where you get updates</span>
        </span>
        <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-muted" />
      </Link>
    </Popover>
  );
}
