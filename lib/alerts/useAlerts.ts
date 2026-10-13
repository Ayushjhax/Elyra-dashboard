"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import type { AlertsResponse } from "@/app/api/alerts/route";
import type { PriceAlert } from "@/lib/telegram/alerts";

/* ---------------------------------------------------------------------------
   The signed-in account's price alerts, read once for the workspace.

   The chart's Alerts, the Automation list, the decision brief and the
   notifications menu all show the same rows, so this is one reference-
   counted store like `usePortfolio`: one request however many read it, and
   a write by any of them refreshes all of them.

   A minute between reads: the delivery worker that fires them runs every
   five, so a faster poll would only find the same answer.
--------------------------------------------------------------------------- */

const POLL_MS = 60_000;
const RETRY_MS = 120_000;

interface StoreState {
  alerts: PriceAlert[];
  delivery: AlertsResponse["delivery"];
  error: string | null;
  loading: boolean;
}

const INITIAL: StoreState = { alerts: [], delivery: null, error: null, loading: true };

let state: StoreState = INITIAL;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let subscribers = 0;
let inFlight: Promise<void> | null = null;
let enabled = false;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher | null = null;

function emit(next: Partial<StoreState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  subscribers += 1;
  ensurePolling();
  return () => {
    listeners.delete(listener);
    subscribers -= 1;
    if (subscribers <= 0 && timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

const getSnapshot = (): StoreState => state;
const getServerSnapshot = (): StoreState => INITIAL;

function poll(): Promise<void> {
  if (inFlight !== null) return inFlight;
  if (!enabled || fetcher === null) return Promise.resolve();
  const read = fetcher;

  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }

  inFlight = (async () => {
    let delay = POLL_MS;
    try {
      const response = await read("/api/alerts", { cache: "no-store" });
      const body = (await response.json()) as Partial<AlertsResponse>;
      if (response.ok) {
        emit({ alerts: body.alerts ?? [], delivery: body.delivery ?? null, error: null, loading: false });
      } else {
        delay = RETRY_MS;
        emit({ error: body.error ?? `Alerts unavailable (${response.status})`, loading: false });
      }
    } catch {
      delay = RETRY_MS;
      emit({ error: "Alerts could not be read.", loading: false });
    } finally {
      inFlight = null;
      if (subscribers > 0 && enabled) timer = setTimeout(() => void poll(), delay);
    }
  })();
  return inFlight;
}

function ensurePolling(): void {
  if (timer === null && inFlight === null && enabled && subscribers > 0) void poll();
}

function reset(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  state = INITIAL;
  for (const listener of listeners) listener();
}

export interface NewAlert {
  symbol: string;
  direction: "above" | "below";
  target: number;
  currentPrice: number | null;
}

export interface AlertsFeed extends StoreState {
  signedIn: boolean;
  /** Sets an alert, or re-arms one that already fired — the same row. */
  create: (alert: NewAlert) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
}

export function useAlerts(): AlertsFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const signedIn = auth.ready && auth.authenticated;

  useEffect(() => {
    fetcher = authedFetch;
  }, [authedFetch]);

  useEffect(() => {
    const was = enabled;
    enabled = signedIn;
    if (!signedIn) {
      if (was) reset();
      return;
    }
    ensurePolling();
  }, [signedIn]);

  /** Null on success, otherwise what went wrong in words. */
  const create = useCallback(async (alert: NewAlert): Promise<string | null> => {
    if (fetcher === null) return "Sign in to set alerts.";
    try {
      const response = await fetcher("/api/alerts", {
        method: "POST",
        body: JSON.stringify(alert),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        return body.error ?? "The alert could not be saved.";
      }
      await poll();
      return null;
    } catch {
      return "The alert could not be saved.";
    }
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    if (fetcher === null) return;
    emit({ alerts: state.alerts.filter((alert) => alert.id !== id) });
    await fetcher(`/api/alerts?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    await poll();
  }, []);

  return useMemo(
    () => ({
      ...store,
      alerts: signedIn ? store.alerts : [],
      loading: !auth.ready || (signedIn && store.loading),
      signedIn,
      create,
      remove,
    }),
    [store, auth.ready, signedIn, create, remove],
  );
}

/**
 * Whether the live price is already past an alert's level.
 *
 * The server only stamps `triggeredAt` when it delivers to Telegram, so with
 * no chat linked an alert can be crossed and still read as armed. This is
 * how the web says so honestly.
 */
export function isPast(alert: PriceAlert, price: number | null | undefined): boolean {
  if (price === null || price === undefined || !Number.isFinite(price)) return false;
  return alert.direction === "above" ? price >= alert.target : price <= alert.target;
}
