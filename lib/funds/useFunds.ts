"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { accountKey } from "@/lib/account";
import type { FundDetail, FundsResponse } from "@/lib/funds/types";
import { useAuthedFetch } from "@/lib/useAuthedFetch";

/* ---------------------------------------------------------------------------
   The signed-in account's AI funds — the list (/api/funds) and each fund
   opened (/api/funds/[id]) — as reference-counted stores keyed by URL, like
   `useRails`. All of them reset when `accountKey` changes and drop a read
   that started under the previous account, so one person's funds never
   appear under the next.

   Thirty seconds between reads while a page is open: a fund's book is
   marked to market on every read, and its manager may trade at any time.
   Nothing polls when nothing is mounted. Every write refreshes everything
   mounted at once.
--------------------------------------------------------------------------- */

const POLL_MS = 30_000;
const RETRY_MS = 60_000;

interface StoreState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

interface Entry {
  state: StoreState<unknown>;
  listeners: Set<() => void>;
  subscribers: number;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
}

const INITIAL: StoreState<never> = { data: null, error: null, loading: true };
const entries = new Map<string, Entry>();
let enabled = false;
let generation = 0;
let owner: string | null = null;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher | null = null;

function entryFor(url: string): Entry {
  let entry = entries.get(url);
  if (entry === undefined) {
    entry = { state: INITIAL, listeners: new Set(), subscribers: 0, timer: null, inFlight: null };
    entries.set(url, entry);
  }
  return entry;
}

function emit(entry: Entry, next: Partial<StoreState<unknown>>): void {
  entry.state = { ...entry.state, ...next };
  for (const listener of entry.listeners) listener();
}

function poll(url: string): Promise<void> {
  const entry = entryFor(url);
  if (entry.inFlight !== null) return entry.inFlight;
  if (!enabled || fetcher === null) return Promise.resolve();
  const read = fetcher;
  const started = generation;
  if (entry.timer !== null) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  entry.inFlight = (async () => {
    let delay = POLL_MS;
    try {
      const response = await read(url, { cache: "no-store" });
      const body = (await response.json()) as Record<string, unknown>;
      if (started !== generation) return;
      if (response.ok) emit(entry, { data: body, error: null, loading: false });
      else {
        delay = RETRY_MS;
        emit(entry, { error: typeof body.error === "string" ? body.error : `Funds unavailable (${response.status})`, loading: false });
      }
    } catch {
      if (started !== generation) return;
      delay = RETRY_MS;
      emit(entry, { error: "Funds could not be read.", loading: false });
    } finally {
      entry.inFlight = null;
      if (entry.subscribers > 0 && enabled) entry.timer = setTimeout(() => void poll(url), delay);
    }
  })();
  return entry.inFlight;
}

function ensurePolling(url: string): void {
  const entry = entryFor(url);
  if (entry.timer === null && entry.inFlight === null && enabled && entry.subscribers > 0) void poll(url);
}

function resetAll(): void {
  generation += 1;
  for (const entry of entries.values()) {
    if (entry.timer !== null) clearTimeout(entry.timer);
    entry.timer = null;
    entry.inFlight = null;
    entry.state = INITIAL;
    for (const listener of entry.listeners) listener();
  }
}

/** Every mounted read, again — after a write, so the list and the fund agree. */
async function refreshMounted(): Promise<void> {
  await Promise.all(
    [...entries.entries()]
      .filter(([, entry]) => entry.subscribers > 0)
      .map(async ([url, entry]) => {
        if (entry.inFlight !== null) await entry.inFlight;
        await poll(url);
      }),
  );
}

export interface FundsFeed<T> extends StoreState<T> {
  signedIn: boolean;
  /** Sends a write and refreshes. `error` is null on success, otherwise the reason in words. */
  write: (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<{ error: string | null; body: Record<string, unknown> }>;
  refresh: () => void;
}

function useFeed<T>(url: string | null): FundsFeed<T> {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const signedIn = auth.ready && auth.authenticated;
  const account = accountKey(auth);

  const subscribe = useCallback(
    (listener: () => void) => {
      if (url === null) return () => {};
      const entry = entryFor(url);
      entry.listeners.add(listener);
      entry.subscribers += 1;
      ensurePolling(url);
      return () => {
        entry.listeners.delete(listener);
        entry.subscribers -= 1;
        if (entry.subscribers <= 0 && entry.timer !== null) {
          clearTimeout(entry.timer);
          entry.timer = null;
        }
      };
    },
    [url],
  );
  const getSnapshot = useCallback(() => (url === null ? INITIAL : entryFor(url).state), [url]);
  const store = useSyncExternalStore(subscribe, getSnapshot, () => INITIAL) as StoreState<T>;

  useEffect(() => {
    fetcher = authedFetch;
  }, [authedFetch]);

  useEffect(() => {
    const was = enabled;
    enabled = signedIn;
    if (!signedIn) {
      if (was) resetAll();
      owner = null;
      return;
    }
    if (owner !== null && owner !== account) resetAll();
    owner = account;
    if (url !== null) ensurePolling(url);
  }, [signedIn, account, url]);

  const write = useCallback(async (target: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
    const send = fetcher;
    if (send === null) return { error: "Sign in first.", body: {} };
    try {
      const response = await send(target, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      const parsed = response.status === 204 ? {} : ((await response.json().catch(() => ({}))) as Record<string, unknown>);
      await refreshMounted();
      return { error: response.ok ? null : String(parsed.error ?? "That could not be saved."), body: parsed };
    } catch {
      return { error: "The network did not answer.", body: {} };
    }
  }, []);

  const refresh = useCallback(() => {
    if (url !== null) void poll(url);
  }, [url]);

  return useMemo(
    () => ({ ...store, data: signedIn ? store.data : null, loading: !auth.ready || (signedIn && store.loading), signedIn, write, refresh }),
    [store, auth.ready, signedIn, write, refresh],
  );
}

export function useFunds(): FundsFeed<FundsResponse> {
  return useFeed<FundsResponse>("/api/funds");
}

export function useFund(id: string): FundsFeed<FundDetail> {
  return useFeed<FundDetail>(/^[0-9a-f-]{36}$/i.test(id) ? `/api/funds/${id}` : null);
}
