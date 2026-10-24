import { useMemo } from "react";
import { create } from "zustand";
import type {
  InboxEntry,
  InboxPage,
  NotificationPreferences,
} from "@/lib/notifications/types";
import { api } from "~/lib/api";
import { currentAccount, sessionVersion } from "~/lib/session";
import {
  createAccountStore,
  SKIP,
  type AccountStore,
} from "~/lib/stores/createAccountStore";

export interface InboxData extends InboxPage {
  accountId: string;
}
let generation = 0;
let writes = 0;
const useInboxUi = create<{ more: boolean; error: string | null }>(() => ({
  more: false,
  error: null,
}));
export const inboxStore: AccountStore<InboxData> =
  createAccountStore<InboxData>({
    pollMs: 30_000,
    onReset: () => {
      generation++;
      useInboxUi.setState({ more: false, error: null });
    },
    async load(signal) {
      const version = writes;
      const previous = inboxStore.snapshot().data;
      const page = await api.get<InboxData>("/api/notifications", { signal });
      if (version !== writes) return SKIP;
      // Keep older pages while refreshing the newest page and unread count.
      const older =
        previous?.accountId === page.accountId
          ? previous.notifications.filter(
              (entry) =>
                entry.createdAt < (page.notifications.at(-1)?.createdAt ?? ""),
            )
          : [];
      return {
        ...page,
        notifications: [...page.notifications, ...older],
        nextCursor: older.length > 0 ? previous!.nextCursor : page.nextCursor,
      };
    },
  });
export const preferencesStore = createAccountStore<NotificationPreferences>({
  pollMs: 60_000,
  load: (signal) =>
    api.get<NotificationPreferences>("/api/notifications/preferences", {
      signal,
    }),
});
export function useNotificationPreferences() {
  return preferencesStore.useFeed();
}
let preferenceQueue: Promise<unknown> = Promise.resolve();
export function saveNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<void> {
  const account = currentAccount();
  const ticket = sessionVersion();
  const work = preferenceQueue
    .catch(() => {})
    .then(async () => {
      if (
        account === null ||
        currentAccount() !== account ||
        sessionVersion() !== ticket
      )
        throw new Error("Your account changed. Open settings again.");
      const result = await api.patch<NotificationPreferences>(
        "/api/notifications/preferences",
        patch,
      );
      if (currentAccount() === account && sessionVersion() === ticket)
        preferencesStore.replace(result);
    });
  preferenceQueue = work;
  return work;
}
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const ticket = generation;
  writes++;
  try {
    await api.post("/api/notifications/read", ids ? { ids } : { all: true });
    if (ticket !== generation) return;
    useInboxUi.setState({ error: null });
  } catch (failure) {
    if (ticket === generation)
      useInboxUi.setState({
        error:
          failure instanceof Error
            ? failure.message
            : "Could not mark these read.",
      });
    throw failure;
  } finally {
    writes++;
  }
  if (ticket === generation) await inboxStore.refresh();
}
export async function loadOlderNotifications() {
  const cursor = inboxStore.snapshot().data?.nextCursor;
  if (!cursor || useInboxUi.getState().more) return;
  const ticket = generation;
  const version = writes;
  useInboxUi.setState({ more: true, error: null });
  try {
    const page = await api.get<InboxData>(
      `/api/notifications?cursor=${encodeURIComponent(cursor)}`,
    );
    if (ticket !== generation || version !== writes) return;
    inboxStore.update((data) => {
      const seen = new Set(data.notifications.map((entry) => entry.id));
      return {
        ...data,
        unread: page.unread,
        notifications: [
          ...data.notifications,
          ...page.notifications.filter((entry) => !seen.has(entry.id)),
        ],
        nextCursor: page.nextCursor,
      };
    });
  } catch (failure) {
    if (ticket === generation)
      useInboxUi.setState({
        error:
          failure instanceof Error
            ? failure.message
            : "Could not load older notifications.",
      });
  } finally {
    if (ticket === generation) useInboxUi.setState({ more: false });
  }
}
export function useInbox() {
  const feed = inboxStore.useFeed();
  const state = useInboxUi();
  return useMemo(
    () => ({
      ...feed,
      entries: feed.data?.notifications ?? ([] as InboxEntry[]),
      unread: feed.data?.unread ?? 0,
      loadingMore: state.more,
      error: state.error ?? feed.error,
      more: loadOlderNotifications,
      markRead: markNotificationsRead,
    }),
    [feed, state],
  );
}
