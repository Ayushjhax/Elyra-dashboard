"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { accountKey } from "@/lib/account";
import type { DeskResponse } from "@/lib/desk/types";
import { useAuthedFetch } from "@/lib/useAuthedFetch";

/* ---------------------------------------------------------------------------
   The signed-in account's Desk — its seats, its runs, the scoreboard — read
   once for the workspace: a reference-counted store like `useArena`, reset
   when `accountKey` changes, a read from an earlier account dropped when it
   lands. Every few seconds while a run is being worked, so the page can
   follow it stage by stage; once a minute otherwise.
--------------------------------------------------------------------------- */

const POLL_MS = 60_000;
const WORKING_MS = 2_500;
const RETRY_MS = 120_000;

interface StoreState {
  data: DeskResponse | null;
  error: string | null;
  loading: boolean;
}

const INITIAL: StoreState = { data: null, error: null, loading: true };

let state: StoreState = INITIAL;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let subscribers = 0;
let inFlight: Promise<void> | null = null;
let enabled = false;
let generation = 0;
let owner: string | null = null;

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
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  inFlight = (async () => {
    let delay = POLL_MS;
    try {
      const response = await read("/api/desk", { cache: "no-store" });
      const body = (await response.json()) as Partial<DeskResponse> & { error?: string };
      if (started !== generation) return;
      if (response.ok) {
        const data = body as DeskResponse;
        emit({ data, error: null, loading: false });
        if (data.runs.some((run) => run.stage !== "done" && run.stage !== "failed")) delay = WORKING_MS;
      }
      else {
        delay = RETRY_MS;
        emit({ error: body.error ?? `The desk is unavailable (${response.status})`, loading: false });
      }
    } catch {
      if (started !== generation) return;
      delay = RETRY_MS;
      emit({ error: "The desk could not be read.", loading: false });
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
  generation += 1;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  state = INITIAL;
  for (const listener of listeners) listener();
}

export interface DeskFeed extends StoreState {
  signedIn: boolean;
  /** Sends a write and refreshes. Null on success, otherwise the reason in words. */
  write: (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<{ error: string | null; body: Record<string, unknown> }>;
}

export function useDesk(): DeskFeed {
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

  const write = useCallback(async (url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => {
    const send = fetcher;
    if (send === null) return { error: "Sign in first.", body: {} };
    try {
      const response = await send(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      const parsed = response.status === 204 ? {} : ((await response.json().catch(() => ({}))) as Record<string, unknown>);
      if (inFlight !== null) await inFlight;
      await poll();
      return { error: response.ok ? null : String(parsed.error ?? "That could not be saved."), body: parsed };
    } catch {
      return { error: "The network did not answer.", body: {} };
    }
  }, []);

  return useMemo(
    () => ({ ...store, data: signedIn ? store.data : null, loading: !auth.ready || (signedIn && store.loading), signedIn, write }),
    [store, auth.ready, signedIn, write],
  );
}
