"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { accountKey } from "@/lib/account";
import type { LibraryStrategy } from "@/lib/strategies/library";
import type { SavedDesign } from "@/lib/strategies/types";
import { useAuthedFetch } from "@/lib/useAuthedFetch";

/* ---------------------------------------------------------------------------
   Elyra's strategy library and the signed-in account's saved designs
   (/api/strategies), read once for the page as a reference-counted store.
   Resets when `accountKey` changes and drops a read that started under the
   previous account, so one person's strategies never appear under the
   next. Read on mount and after every write — designs do not change by
   themselves, so nothing polls.
--------------------------------------------------------------------------- */

export interface StrategiesData {
  library: LibraryStrategy[];
  saved: SavedDesign[];
  error: string | null;
}

interface StoreState {
  data: StrategiesData | null;
  error: string | null;
  loading: boolean;
}

const INITIAL: StoreState = { data: null, error: null, loading: true };
let state: StoreState = INITIAL;
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let generation = 0;
let owner: string | null | undefined;
let fetcher: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;

function emit(next: Partial<StoreState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function read(): Promise<void> {
  if (inFlight !== null) return inFlight;
  if (fetcher === null) return Promise.resolve();
  const started = generation;
  const send = fetcher;
  inFlight = (async () => {
    try {
      const response = await send("/api/strategies", { cache: "no-store" });
      const body = (await response.json()) as StrategiesData & { error?: string | null };
      if (started !== generation) return;
      emit(response.ok ? { data: body, error: null, loading: false } : { error: body.error ?? `Strategies unavailable (${response.status})`, loading: false });
    } catch {
      if (started === generation) emit({ error: "Strategies could not be read.", loading: false });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function reset(): void {
  generation += 1;
  inFlight = null;
  state = INITIAL;
  for (const listener of listeners) listener();
}

export interface StrategiesFeed extends StoreState {
  signedIn: boolean;
  /** Sends a write and reads again. `error` is null on success, otherwise the reason in words. */
  write: (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<{ error: string | null; body: Record<string, unknown> }>;
}

export function useStrategies(): StrategiesFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const store = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => INITIAL,
  );
  const signedIn = auth.ready && auth.authenticated;
  const account = accountKey(auth);

  useEffect(() => {
    fetcher = authedFetch;
  }, [authedFetch]);

  /* The library reads signed out too; signing in or out reads again. */
  useEffect(() => {
    if (!auth.ready) return;
    const key = signedIn ? account : null;
    if (owner !== undefined && owner !== key) reset();
    owner = key;
    if (state.data === null) void read();
  }, [auth.ready, signedIn, account]);

  const write = useCallback(async (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
    const send = fetcher;
    if (send === null) return { error: "Sign in first.", body: {} };
    try {
      const response = await send(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      const parsed = response.status === 204 ? {} : ((await response.json().catch(() => ({}))) as Record<string, unknown>);
      if (inFlight !== null) await inFlight;
      await read();
      return { error: response.ok ? null : String(parsed.error ?? "That could not be saved."), body: parsed };
    } catch {
      return { error: "The network did not answer.", body: {} };
    }
  }, []);

  return useMemo(() => ({ ...store, loading: !auth.ready || store.loading, signedIn, write }), [store, auth.ready, signedIn, write]);
}
