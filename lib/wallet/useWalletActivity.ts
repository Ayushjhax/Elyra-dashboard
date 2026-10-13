"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import type { ActivityResponse, WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Recent transactions for the signed-in wallet.

   A reference-counted external store, the same shape as `usePortfolio`: the
   workspace's trading history and activity feed, the Portfolio page, the
   Assets page and the wallet panel all read it, and as per-component state
   that was one RPC signature walk each. Here it is one request, sized for
   the longest list anyone asks for, and each caller takes its own slice.
--------------------------------------------------------------------------- */

/** Slower than balances: a transaction list changes only when you transact. */
const POLL_MS = 60_000;
const RETRY_MS = 120_000;
/** The most any surface shows. Callers slice down from it. */
const FETCH_LIMIT = 25;

export interface ActivityFeed {
  items: WalletActivity[];
  isLoading: boolean;
  error: string | null;
  unconfigured: boolean;
  refetch: () => void;
}

interface StoreState {
  items: WalletActivity[];
  error: string | null;
  unconfigured: boolean;
  loading: boolean;
}

const INITIAL: StoreState = { items: [], error: null, unconfigured: false, loading: true };
const SIGNED_OUT: StoreState = { ...INITIAL, loading: false };

let state: StoreState = INITIAL;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let subscribers = 0;
let inFlight = false;
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

async function poll(): Promise<void> {
  if (inFlight || !enabled || fetcher === null) return;
  inFlight = true;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  let delay = POLL_MS;
  try {
    const response = await fetcher(`/api/wallet/activity?limit=${FETCH_LIMIT}`, { cache: "no-store" });
    const body = (await response.json()) as ActivityResponse;
    if (body.error !== null) delay = RETRY_MS;
    emit({ items: body.items, error: body.error, unconfigured: body.unconfigured, loading: false });
  } catch (error: unknown) {
    delay = RETRY_MS;
    emit({
      error: error instanceof Error ? error.message : "Network error",
      loading: false,
    });
  } finally {
    inFlight = false;
    if (subscribers > 0 && enabled) timer = setTimeout(() => void poll(), delay);
  }
}

function ensurePolling(): void {
  if (timer === null && !inFlight && enabled && subscribers > 0) void poll();
}

function reset(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  state = SIGNED_OUT;
  for (const listener of listeners) listener();
}

export function useWalletActivity(limit = 20): ActivityFeed {
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
      if (was || state.loading) reset();
      return;
    }
    ensurePolling();
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") void poll();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [signedIn]);

  const refetch = useCallback(() => {
    void poll();
  }, []);

  return useMemo(
    () => ({
      items: signedIn ? store.items.slice(0, limit) : [],
      /* Privy restoring is "unknown", not "signed out". */
      isLoading: !auth.ready || (signedIn && store.loading),
      error: signedIn ? store.error : null,
      unconfigured: store.unconfigured,
      refetch,
    }),
    [store, signedIn, auth.ready, limit, refetch],
  );
}
