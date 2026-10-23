import type { AccountEvent } from "@/lib/activity/events";
import { formatDayGroup } from "@/lib/format";

/* ---------------------------------------------------------------------------
   What the bell shows, made from the account events that ask for attention.

   Pure, so the rules are tested: which events ring the bell, what each is
   called, where it leads, and when it counts as unread. The events come from
   the shared stores (`useAccountEvents`) — nothing here fetches.

   Read state is this browser's: a watermark ("everything up to here has been
   read", set by Mark all read) plus the ids opened one at a time since. It
   persists with the rest of the workspace, so a dot does not come back on
   reload — and it is local, so there is no request that can fail.
--------------------------------------------------------------------------- */

export type NotificationCategory = "alert" | "action" | "failed" | "agent";

export type NotificationTarget =
  /** A page or an outside link. */
  | { kind: "link"; href: string; external: boolean }
  /** The agent's pending actions, which live in its panel rather than at a URL. */
  | { kind: "review-actions" }
  /** Workspace alert rules, on Home. */
  | { kind: "alerts" };

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  description: string;
  at: string;
  target: NotificationTarget | null;
}

/** How many the menu keeps — the newest, after filtering to what asks for attention. */
export const NOTIFICATION_LIMIT = 30;

/** How many individually-read ids are remembered; older ones fall under the watermark anyway. */
export const READ_ID_LIMIT = 200;

export function toNotification(event: AccountEvent): NotificationItem | null {
  if (!event.attention || event.at === null) return null;

  const external = event.href !== null && /^https?:\/\//.test(event.href);
  const link: NotificationTarget | null =
    event.href === null ? null : { kind: "link", href: event.href, external };

  switch (event.kind) {
    case "alert": {
      /* "SOL crossed above $150 at $151.20 — alert sent to Telegram" →
         title, and the detail after the symbol as the description. */
      return {
        id: event.id,
        category: "alert",
        title: "Price alert triggered",
        description: event.text,
        at: event.at,
        target: { kind: "alerts" },
      };
    }
    case "action":
      return {
        id: event.id,
        category: "action",
        title: "Action awaiting your review",
        description: event.text.replace(/ — awaiting your review$/, ""),
        at: event.at,
        target: { kind: "review-actions" },
      };
    case "transaction":
      return {
        id: event.id,
        category: "failed",
        title: "Transaction failed",
        description: event.text.replace(/^Failed: /, "").replace(/^./, (first) => first.toUpperCase()),
        at: event.at,
        target: link,
      };
    case "venue":
      return {
        id: event.id,
        category: event.status === "failed" ? "failed" : "agent",
        title: event.status === "failed" ? "Venue action failed" : "Elyra completed an action",
        description: event.text,
        at: event.at,
        target: link,
      };
  }
}

export function notificationsFrom(events: readonly AccountEvent[]): NotificationItem[] {
  return events
    .map(toNotification)
    .filter((item): item is NotificationItem => item !== null)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, NOTIFICATION_LIMIT);
}

export function isUnread(item: NotificationItem, seenAt: string | null, readIds: readonly string[]): boolean {
  if (readIds.includes(item.id)) return false;
  return seenAt === null || Date.parse(item.at) > Date.parse(seenAt);
}

/** Today, Yesterday, then dates — newest first, one group per day. */
export function groupByDay(
  items: readonly NotificationItem[],
  now: number,
): Array<{ label: string; items: NotificationItem[] }> {
  const groups: Array<{ label: string; items: NotificationItem[] }> = [];
  for (const item of items) {
    const label = formatDayGroup(item.at, now);
    const last = groups.at(-1);
    if (last !== undefined && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/** The ids to remember after reading one: newest first, bounded. */
export function rememberRead(readIds: readonly string[], id: string): string[] {
  return [id, ...readIds.filter((entry) => entry !== id)].slice(0, READ_ID_LIMIT);
}
