"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { accountKey } from "@/lib/account";
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
  /** The last change that could not be saved, in words. Cleared by the next one. */
  writeError: string | null;
  loading: boolean;
}

const INITIAL: StoreState = { alerts: [], delivery: null, error: null, writeError: null, loading: true };

let state: StoreState = INITIAL;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let subscribers = 0;
let inFlight: Promise<void> | null = null;
let enabled = false;

/**
 * Bumped by every reset. A read that started under an earlier generation
 * belongs to an account that is no longer signed in here, and is dropped
 * when it lands rather than written over the new one.
 */
let generation = 0;

/** Whose alerts the store holds: the account they were read for. */
let owner: string | null = null;

/**
 * Bumped as a write starts and again as it finishes. A read that overlapped
 * one may describe the list from before it — a new alert missing, a deleted
 * one back — so it is dropped, and the write reads again once it is done.
 */
let writes = 0;

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
  const started = generation;
  const writesAtStart = writes;

  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }

  inFlight = (async () => {
    let delay = POLL_MS;
    try {
      const response = await read("/api/alerts", { cache: "no-store" });
      const body = (await response.json()) as Partial<AlertsResponse>;
      if (started !== generation || writesAtStart !== writes) return;
      if (response.ok) {
        emit({ alerts: body.alerts ?? [], delivery: body.delivery ?? null, error: null, loading: false });
      } else {
        delay = RETRY_MS;
        emit({ error: body.error ?? `Alerts unavailable (${response.status})`, loading: false });
      }
    } catch {
      if (started !== generation || writesAtStart !== writes) return;
      delay = RETRY_MS;
      emit({ error: "Alerts could not be read.", loading: false });
    } finally {
      inFlight = null;
      if (subscribers > 0 && enabled) timer = setTimeout(() => void poll(), started !== generation ? 0 : delay);
    }
  })();
  return inFlight;
}

function ensurePolling(): void {
  if (timer === null && inFlight === null && enabled && subscribers > 0) void poll();
}

/** A read that starts after a write has finished, so it includes it. */
async function refresh(): Promise<void> {
  if (inFlight !== null) await inFlight;
  await poll();
}

/** Brackets a write so that no read overlapping it is believed. */
async function writing<T>(work: () => Promise<T>): Promise<T> {
  writes += 1;
  try {
    return await work();
  } finally {
    writes += 1;
  }
}

function reset(): void {
  generation += 1;
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
  /** Null on success, otherwise what went wrong in words. */
  remove: (id: string) => Promise<string | null>;
}

export function useAlerts(): AlertsFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const signedIn = auth.ready && auth.authenticated;
  const account = accountKey(auth);

  useEffect(() => {
    fetcher = authedFetch;
  }, [authedFetch]);

  useEffect(() => {
    const was = enabled;
    enabled = signedIn;
    if (!signedIn) {
      if (was) reset();
      owner = null;
      return;
    }
    if (owner !== null && owner !== account) reset();
    owner = account;
    ensurePolling();
  }, [signedIn, account]);

  /** Null on success, otherwise what went wrong in words. */
  const create = useCallback(async (alert: NewAlert): Promise<string | null> => {
    const write = fetcher;
    if (write === null) return "Sign in to set alerts.";
    emit({ writeError: null });
    const failure = await writing(async () => {
      try {
        const response = await write("/api/alerts", {
          method: "POST",
          body: JSON.stringify(alert),
        });
        if (response.ok) return null;
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        return body.error ?? "The alert could not be saved.";
      } catch {
        return "The alert could not be saved.";
      }
    });
    if (failure === null) await refresh();
    else emit({ writeError: failure });
    return failure;
  }, []);

  /* Taken off the list at once, and put back by the read that follows if
     the server kept it — with the reason said, rather than an alert that
     silently reappears. */
  const remove = useCallback(async (id: string): Promise<string | null> => {
    const write = fetcher;
    if (write === null) return "Sign in to manage alerts.";
    emit({ alerts: state.alerts.filter((alert) => alert.id !== id), writeError: null });
    const failure = await writing(async () => {
      try {
        const response = await write(`/api/alerts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        /* 404: already gone, which is what was asked for. */
        if (response.ok || response.status === 404) return null;
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        return body.error ?? "The alert could not be removed.";
      } catch {
        return "The alert could not be removed.";
      }
    });
    await refresh();
    if (failure !== null) emit({ writeError: failure });
    return failure;
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
