"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { accountKey } from "@/lib/account";
import { useAuthedFetch } from "@/lib/useAuthedFetch";

/* ---------------------------------------------------------------------------
   Scout's reads, as shared reference-counted stores, one per address.

   Every tab reads through here: the person's reads, auto-buys and baskets
   (signed in), and the public smart-money and Poly scan boards. When
   `accountKey` changes every store resets and a read that started under the
   previous account is dropped, so one person's reads never show under the
   next. A store polls only while something on screen subscribes to it.
--------------------------------------------------------------------------- */

interface FeedState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

interface Entry {
  state: FeedState<unknown>;
  listeners: Set<() => void>;
  inFlight: Promise<void> | null;
  generation: number;
}

const INITIAL: FeedState<never> = { data: null, error: null, loading: true };
const entries = new Map<string, Entry>();
let owner: string | null | undefined;
let fetcher: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;

function entryFor(url: string): Entry {
  let entry = entries.get(url);
  if (entry === undefined) {
    entry = { state: INITIAL, listeners: new Set(), inFlight: null, generation: 0 };
    entries.set(url, entry);
  }
  return entry;
}

function emit(entry: Entry, next: Partial<FeedState<unknown>>): void {
  entry.state = { ...entry.state, ...next };
  for (const listener of entry.listeners) listener();
}

function read(url: string): Promise<void> {
  const entry = entryFor(url);
  if (entry.inFlight !== null) return entry.inFlight;
  const send = fetcher;
  if (send === null) return Promise.resolve();
  const started = entry.generation;
  entry.inFlight = (async () => {
    try {
      const response = await send(url, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (started !== entry.generation) return;
      emit(entry, response.ok ? { data: body, error: null, loading: false } : { error: String(body.error ?? `Unavailable (${response.status})`), loading: false });
    } catch {
      if (started === entry.generation) emit(entry, { error: "The network did not answer.", loading: false });
    } finally {
      if (started === entry.generation) entry.inFlight = null;
    }
  })();
  return entry.inFlight;
}

function resetAll(): void {
  for (const entry of entries.values()) {
    entry.generation += 1;
    entry.inFlight = null;
    entry.state = INITIAL;
    for (const listener of entry.listeners) listener();
  }
}

export interface ScoutFeed<T> extends FeedState<T> {
  signedIn: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
  /** Sends a write, then reads this feed again. `error` is null on success, else the reason in words. */
  write: (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<{ error: string | null; body: Record<string, unknown> }>;
}

const NOOP = () => () => undefined;

/** One address's store. `url` null subscribes to nothing (signed out, say). */
export function useScoutFeed<T>(url: string | null, options: { pollMs?: number; needsAuth?: boolean } = {}): ScoutFeed<T> {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const signedIn = auth.ready && auth.authenticated;
  const account = accountKey(auth);
  const active = url !== null && auth.ready && (options.needsAuth !== true || signedIn);

  /* Stable per address, so React subscribes once rather than on every render. */
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!active) return NOOP();
      const entry = entryFor(url);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [active, url],
  );
  const store = useSyncExternalStore(
    subscribe,
    () => (active ? (entryFor(url).state as FeedState<T>) : (INITIAL as FeedState<T>)),
    () => INITIAL as FeedState<T>,
  );

  useEffect(() => {
    fetcher = authedFetch;
  }, [authedFetch]);

  useEffect(() => {
    if (!auth.ready) return;
    const key = signedIn ? account : null;
    if (owner !== undefined && owner !== key) resetAll();
    owner = key;
  }, [auth.ready, signedIn, account]);

  useEffect(() => {
    if (!active) return;
    if (entryFor(url).state.data === null) void read(url);
    if (options.pollMs === undefined) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void read(url);
    }, options.pollMs);
    return () => clearInterval(timer);
  }, [active, url, options.pollMs]);

  /* A refresh asked for after a write must see it: a read already in flight may have started before the write landed, so wait it out and read again. */
  const refresh = useCallback(async () => {
    if (url === null) return;
    const entry = entryFor(url);
    if (entry.inFlight !== null) await entry.inFlight;
    await read(url);
  }, [url]);

  const write = useCallback(
    async (target: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
      const send = fetcher;
      if (send === null) return { error: "Sign in first.", body: {} };
      try {
        const response = await send(target, { method, body: body === undefined ? undefined : JSON.stringify(body) });
        const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (url !== null) {
          const entry = entryFor(url);
          if (entry.inFlight !== null) await entry.inFlight;
          await read(url);
        }
        return { error: response.ok ? null : String(parsed.error ?? "That could not be saved."), body: parsed };
      } catch {
        return { error: "The network did not answer.", body: {} };
      }
    },
    [url],
  );

  return useMemo(
    () => ({ ...store, loading: !auth.ready || (active && store.loading), signedIn, ready: auth.ready, refresh, write }),
    [store, auth.ready, active, signedIn, refresh, write],
  );
}

/** A one-off authed request outside any store — a read, which may take minutes. */
export function useScoutRequest() {
  const authedFetch = useAuthedFetch();
  return useCallback(
    async (url: string, body: unknown): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> => {
      try {
        const response = await authedFetch(url, { method: "POST", body: JSON.stringify(body) });
        return { ok: response.ok, status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
      } catch {
        return { ok: false, status: 0, body: { error: "The network did not answer." } };
      }
    },
    [authedFetch],
  );
}
