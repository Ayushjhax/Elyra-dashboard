"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { useAccountEvents } from "@/lib/activity/useAccountEvents";
import { formatRelativeTime } from "@/lib/format";
import { useElyraStore } from "@/lib/store";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Notifications.

   The account events that ask for attention: a price alert that fired, an
   action waiting on review, a transaction that failed. Routine confirmations
   stay in the Activity widget and do not ring the bell.

   "Unread" is anything newer than the last time this list was opened, which
   persists, so the dot does not come back on every reload.
--------------------------------------------------------------------------- */

const LIMIT = 8;

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const seenAt = useElyraStore((state) => state.notificationsSeenAt);
  const markSeen = useElyraStore((state) => state.markNotificationsSeen);

  const { events, signedIn } = useAccountEvents();
  const now = useMinute();

  const items = events.filter((event) => event.attention && event.at !== null).slice(0, LIMIT);
  const newest = items[0]?.at ?? null;
  const unread = items.filter(
    (item) => item.at !== null && (seenAt === null || Date.parse(item.at) > Date.parse(seenAt)),
  ).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && newest !== null) markSeen(newest);
  };

  return (
    <Popover
      id="notifications"
      label="Notifications"
      open={open}
      onOpenChange={setOpen}
      className="w-[min(360px,calc(100vw-32px))]"
      trigger={
        <button
          type="button"
          aria-expanded={open}
          aria-controls="notifications"
          aria-haspopup="dialog"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          onClick={toggle}
          className={cn(
            "relative inline-flex size-9 items-center justify-center rounded-control",
            "text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
            "hover:bg-surface-hover hover:text-text-primary",
            open && "bg-surface-hover text-text-primary",
          )}
        >
          <Bell size={18} strokeWidth={1.5} aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute right-2 top-2 size-2 rounded-pill border-2 border-surface-base bg-accent"
            />
          )}
        </button>
      }
    >
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <p className="type-panel-title text-text-primary">Notifications</p>
        <span className="type-label text-text-muted">{items.length} recent</span>
      </div>

      {items.length === 0 ? (
        <p className="type-body-sm px-4 py-6 text-center text-text-secondary">
          {signedIn
            ? "Nothing needs your attention."
            : "Connect a wallet to be told when an alert fires or an action needs review."}
        </p>
      ) : (
        <ul className="max-h-[360px] list-none overflow-y-auto py-1">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex gap-3 px-4 py-2.5",
                item.agent && "agent-rail pl-[14px]",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className={cn("type-body-sm", item.status === "failed" ? "text-negative" : "text-text-primary")}>
                  {item.text}
                </p>
                {item.at !== null && now !== null && (
                  <time dateTime={item.at} className="type-data-sm text-text-muted">
                    {formatRelativeTime(item.at, now)}
                  </time>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border-subtle px-4 py-2.5">
        <Link
          href="/agent"
          onClick={() => setOpen(false)}
          className="type-label text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
        >
          Delivery settings
        </Link>
      </div>
    </Popover>
  );
}
