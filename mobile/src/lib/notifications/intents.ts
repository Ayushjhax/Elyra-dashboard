import type { InboxEntry } from "@/lib/notifications/types";

export interface NotificationIntent {
  identifier: string;
  accountId?: string;
  route: unknown;
  notificationId?: string;
}
export function notificationIntent(request: {
  identifier: string;
  content: { data?: Record<string, unknown> | null };
}): NotificationIntent | null {
  const data = request.content.data ?? {};
  const notificationId =
    typeof data.notificationId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      data.notificationId,
    )
      ? data.notificationId
      : undefined;
  const accountId =
    typeof data.accountId === "string" ? data.accountId : undefined;
  if (!accountId && !notificationId) return null;
  return {
    identifier: request.identifier,
    accountId,
    route: data.route,
    notificationId,
  };
}
/** Older pushes carry no account ID. Their ID and route must come from the
 * authenticated inbox; the payload alone never establishes ownership. */
export function ownedNotification(
  intent: NotificationIntent | null,
  inbox: { accountId: string; notifications: InboxEntry[] } | null,
): NotificationIntent | null {
  if (!intent || !inbox) return null;
  if (intent.accountId)
    return intent.accountId === inbox.accountId ? intent : null;
  const entry = inbox.notifications.find(
    (row) => row.id === intent.notificationId,
  );
  return entry
    ? { ...intent, accountId: inbox.accountId, route: entry.data.route }
    : null;
}
