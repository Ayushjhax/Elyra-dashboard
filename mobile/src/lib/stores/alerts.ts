import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { AlertsResponse, AppDelivery, PriceAlert } from "@/lib/alerts/types";
import { api, ApiError } from "~/lib/api";
import { createAccountStore, SKIP, type AccountFeed } from "~/lib/stores/createAccountStore";

/* ---------------------------------------------------------------------------
   The account's price alerts — the app's useAlerts (lib/alerts/useAlerts.ts
   on the website). The asset screen's alerts, the decision brief and the
   inbox read the same rows; a write by any of them refreshes all of them.

   A minute between reads: the delivery pass runs every five.

   THE RACE GUARD. A read that overlapped a write may describe the list from
   before it — a new alert missing, a removed one back — so it steps aside,
   and the write reads again once it is done.

   writeError is the last change that could not be saved, in words; the next
   write clears it.
--------------------------------------------------------------------------- */

interface AlertsData {
  alerts: PriceAlert[];
  delivery: AlertsResponse["delivery"];
  appDelivery: AppDelivery;
}

/* Bumped as a write starts and again as it ends. */
let writes = 0;
let writeError: string | null = null;
const errorListeners = new Set<() => void>();

function setWriteError(next: string | null): void {
  writeError = next;
  for (const listener of [...errorListeners]) listener();
}

const alertsStore = createAccountStore<AlertsData>({
  pollMs: 60_000,
  retryMs: 120_000,
  onReset: () => setWriteError(null),
  async load(signal) {
    const writesAtStart = writes;
    const body = await api.get<AlertsResponse>("/api/alerts", { signal });
    if (writesAtStart !== writes) return SKIP;
    return { alerts: body.alerts ?? [], delivery: body.delivery ?? null, appDelivery: body.appDelivery ?? "none" };
  },
});

async function writing<T>(work: () => Promise<T>): Promise<T> {
  writes += 1;
  try {
    return await work();
  } finally {
    writes += 1;
  }
}

export interface NewAlert {
  symbol: string;
  direction: "above" | "below";
  target: number;
  currentPrice: number | null;
}

/** Null on success, otherwise what went wrong in words. Re-arming a fired alert is the same call. */
async function createAlert(alert: NewAlert): Promise<string | null> {
  setWriteError(null);
  const failure = await writing(async () => {
    try {
      await api.post("/api/alerts", alert);
      return null;
    } catch (error) {
      return error instanceof ApiError ? error.message : "The alert could not be saved.";
    }
  });
  if (failure === null) await alertsStore.refresh();
  else setWriteError(failure);
  return failure;
}

/* Taken off the list at once, and put back by the read that follows if the
   server kept it — with the reason said, rather than an alert that silently
   reappears. */
async function removeAlert(id: string): Promise<string | null> {
  setWriteError(null);
  alertsStore.update((data) => ({ ...data, alerts: data.alerts.filter((alert) => alert.id !== id) }));
  const failure = await writing(async () => {
    try {
      await api.delete(`/api/alerts?id=${encodeURIComponent(id)}`);
      return null;
    } catch (error) {
      /* 404: already gone, which is what was asked for. */
      if (error instanceof ApiError && error.status === 404) return null;
      return error instanceof ApiError ? error.message : "The alert could not be removed.";
    }
  });
  await alertsStore.refresh();
  if (failure !== null) setWriteError(failure);
  return failure;
}

function subscribeError(listener: () => void): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

export interface AlertsFeed extends Omit<AccountFeed<AlertsData>, "data"> {
  alerts: PriceAlert[];
  delivery: AlertsResponse["delivery"];
  appDelivery: AppDelivery;
  writeError: string | null;
  create: (alert: NewAlert) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
}

export function useAlerts(): AlertsFeed {
  const feed = alertsStore.useFeed();
  const error = useSyncExternalStore(subscribeError, () => writeError);
  const create = useCallback((alert: NewAlert) => createAlert(alert), []);
  const remove = useCallback((id: string) => removeAlert(id), []);
  return useMemo(
    () => ({
      ...feed,
      alerts: feed.data?.alerts ?? [],
      delivery: feed.data?.delivery ?? null,
      appDelivery: feed.data?.appDelivery ?? "none",
      writeError: error,
      create,
      remove,
    }),
    [feed, error, create, remove],
  );
}

export const refetchAlerts = alertsStore.refetch;
