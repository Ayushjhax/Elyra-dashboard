import "server-only";

import { serviceClient } from "@/lib/supabase/server";
import type { NotificationKind, NotificationRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The app's inbox.

   Every notification the app is sent lands here first, so nothing depends on
   a push arriving: a denied permission, a dropped push or a cleared lock
   screen still leaves the message in the app. Every read and write is scoped
   to the account asking.
--------------------------------------------------------------------------- */

export const INBOX_PAGE = 30;
/** The unread badge stops counting here and shows "99+". */
export const UNREAD_CAP = 100;

import type { InboxEntry, InboxPage } from "@/lib/notifications/types";
export type { InboxEntry, InboxPage } from "@/lib/notifications/types";

function toEntry(row: NotificationRow): InboxEntry {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    data: row.data ?? {},
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export async function addToInbox(input: {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown>;
}): Promise<string | null> {
  const { data, error } = await serviceClient()
    .from("notifications")
    .insert({ user_id: input.userId, kind: input.kind, title: input.title, body: input.body, data: input.data })
    .select("id")
    .single();
  if (error) {
    console.error("[inbox] could not add", error.code);
    return null;
  }
  return String((data as { id: string }).id);
}

/** Newest first. `cursor` is the createdAt of the last entry already shown. */
export async function readInbox(userId: string, cursor: string | null): Promise<InboxPage | null> {
  let query = serviceClient()
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(INBOX_PAGE + 1);
  if (cursor !== null) query = query.lt("created_at", cursor);

  const [page, unread] = await Promise.all([
    query,
    serviceClient().from("notifications").select("id").eq("user_id", userId).is("read_at", null).limit(UNREAD_CAP),
  ]);
  if (page.error || unread.error) return null;

  const rows = (page.data ?? []) as NotificationRow[];
  const shown = rows.slice(0, INBOX_PAGE).map(toEntry);
  return {
    notifications: shown,
    nextCursor: rows.length > INBOX_PAGE ? (shown[shown.length - 1]?.createdAt ?? null) : null,
    unread: (unread.data ?? []).length,
  };
}

/** Marks entries read — only the caller's own; anyone else's id changes nothing. */
export async function markRead(userId: string, target: { ids: string[] } | { all: true }): Promise<boolean> {
  let query = serviceClient()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if ("ids" in target) query = query.in("id", target.ids);
  const { error } = await query;
  return !error;
}
