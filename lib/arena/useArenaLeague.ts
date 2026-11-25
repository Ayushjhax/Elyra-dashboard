"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { accountKey } from "@/lib/account";
import type { LeagueView } from "@/lib/arena/types";
import { refreshArena } from "@/lib/arena/useArena";
import { useAuthedFetch } from "@/lib/useAuthedFetch";

/* ---------------------------------------------------------------------------
   The league open on the page — one at a time — read through a reference-
   counted store like `useArena`: reset when `accountKey` changes or another
   league is opened, and a read from before the reset dropped when it lands.

   It reads as fast as the league moves: every few seconds while a draft is
   on (a live draft night has a two-minute clock), every half-minute while a
   round is being scored live, and once a minute otherwise. A write answers
   with the league as it now stands, so the page never waits for a poll.
--------------------------------------------------------------------------- */

const RETRY_MS = 60_000;

interface StoreState {
  id: string | null;
  data: LeagueView | null;
  error: string | null;
  loading: boolean;
}

const INITIAL: StoreState = { id: null, data: null, error: null, loading: true };

let state: StoreState = INITIAL;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let subscribers = 0;
let inFlight: Promise<void> | null = null;
let enabled = false;
let generation = 0;
let owner: string | null = null;
let wanted: string | null = null;

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

/** How soon to read again, by what the league is doing. */
function cadence(league: LeagueView | null): number {
  if (league === null) return RETRY_MS;
  if (league.status === "drafting") return 3_000;
  if (league.status === "active" && league.myMatchup?.live === true) return 30_000;
  return 60_000;
}

function schedule(delay: number): void {
  if (subscribers > 0 && enabled && wanted !== null) timer = setTimeout(() => void poll(), delay);
}

function poll(): Promise<void> {
  if (inFlight !== null) return inFlight;
  if (!enabled || fetcher === null || wanted === null) return Promise.resolve();
  const read = fetcher;
  const id = wanted;
  const started = generation;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  inFlight = (async () => {
    let delay = RETRY_MS;
    try {
      const response = await read(`/api/arena/leagues/${id}`, { cache: "no-store" });
      const body = (await response.json()) as { league?: LeagueView; error?: string };
      if (started !== generation) return;
      if (response.ok && body.league !== undefined) {
        emit({ id, data: body.league, error: null, loading: false });
        delay = cadence(body.league);
      } else {
        emit({ id, data: null, error: body.error ?? `League unavailable (${response.status})`, loading: false });
      }
    } catch {
      if (started !== generation) return;
      emit({ error: "The league could not be read.", loading: false });
    } finally {
      inFlight = null;
      if (started === generation) schedule(delay);
    }
  })();
  return inFlight;
}

function ensurePolling(): void {
  if (timer === null && inFlight === null && enabled && subscribers > 0 && wanted !== null) void poll();
}

function reset(id: string | null): void {
  generation += 1;
  inFlight = null;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  wanted = id;
  state = { ...INITIAL, id };
  for (const listener of listeners) listener();
}

export interface LeagueFeed extends StoreState {
  /** Sends a league action. Null on success, otherwise the reason in words. */
  act: (body: Record<string, unknown>) => Promise<{ error: string | null; body: Record<string, unknown> }>;
}

export function useArenaLeague(id: string | null): LeagueFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const signedIn = auth.ready && auth.authenticated;
  const account = accountKey(auth);

  useEffect(() => {
    fetcher = authedFetch;
  }, [authedFetch]);

  useEffect(() => {
    enabled = signedIn;
    if (!signedIn) {
      if (owner !== null) reset(null);
      owner = null;
      return;
    }
    if ((owner !== null && owner !== account) || wanted !== id) reset(id);
    owner = account;
    ensurePolling();
  }, [signedIn, account, id]);

  const act = useCallback(async (body: Record<string, unknown>) => {
    const send = fetcher;
    const target = wanted;
    if (send === null || target === null) return { error: "Sign in first.", body: {} };
    const started = generation;
    try {
      const response = await send(`/api/arena/leagues/${target}`, { method: "POST", body: JSON.stringify(body) });
      const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (response.ok && started === generation && parsed.league !== undefined) {
        emit({ data: parsed.league as LeagueView, error: null, loading: false });
        if (timer !== null) clearTimeout(timer);
        timer = null;
        schedule(cadence(parsed.league as LeagueView));
      }
      void refreshArena();
      return { error: response.ok ? null : String(parsed.error ?? "That could not be done."), body: parsed };
    } catch {
      return { error: "The network did not answer.", body: {} };
    }
  }, []);

  return useMemo(() => ({ ...store, data: signedIn && store.id === id ? store.data : null, act }), [store, signedIn, id, act]);
}
