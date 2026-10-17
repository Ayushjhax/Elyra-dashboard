"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { accountKey } from "@/lib/account";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import type { PortfolioResponse, PortfolioSnapshot } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   One fetch for the whole page.

   Same shape as lib/wallet/useWalletDashboard.ts, and for the same reason:
   the KPI strip, the allocation panel, four tables, the health panel and the
   brief all read the same snapshot. As per-component state that would be
   nine components each polling a route that fans out to an RPC and two
   venues. As a reference-counted external store it is one request, and
   nothing polls when the page is closed.

   Sub-fetching per tab is deliberately not done. §44 asks not to refetch
   every provider on a tab switch, and the cheapest way to honour that is for
   a tab switch to be a pure render over data already held.
--------------------------------------------------------------------------- */

/** Balances do not move faster than a person reads them. */
const POLL_MS = 30_000;

/** After a failure. A failing endpoint must not be asked twice as often. */
const RETRY_MS = 60_000;

interface StoreState {
  snapshot: PortfolioSnapshot | null;
  error: string | null;
  unconfigured: boolean;
  loading: boolean;
  /** `snapshot` is a real earlier reading that survived a failed refresh. */
  stale: boolean;
  /** When the last successful read landed, for "Updated 8s ago". */
  fetchedAt: number | null;
  /** A read is in flight — the first, a poll, or a refetch. */
  refreshing: boolean;
}

const INITIAL: StoreState = {
  snapshot: null,
  error: null,
  unconfigured: false,
  loading: true,
  stale: false,
  fetchedAt: null,
  refreshing: false,
};

let state: StoreState = INITIAL;
const listeners = new Set<() => void>();

let timer: ReturnType<typeof setTimeout> | null = null;
let subscribers = 0;
let inFlight = false;
let enabled = false;

/**
 * Bumped by every reset. A read that started under an earlier generation
 * belongs to an account that is no longer signed in here, and is dropped
 * when it lands rather than written over the new one.
 */
let generation = 0;

/** Whose data the store holds: the account it was read for. */
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
/** Stable, so the server render and the first client render agree. */
const getServerSnapshot = (): StoreState => INITIAL;

async function poll(): Promise<void> {
  if (inFlight || !enabled || fetcher === null) return;

  inFlight = true;
  emit({ refreshing: true });
  let delay = POLL_MS;
  const started = generation;

  try {
    const response = await fetcher("/api/portfolio", { cache: "no-store" });
    const body = (await response.json()) as PortfolioResponse;
    if (started !== generation) return;

    if (body.portfolio !== null) {
      emit({
        snapshot: body.portfolio,
        error: null,
        unconfigured: false,
        loading: false,
        stale: false,
        fetchedAt: Date.now(),
      });
    } else {
      delay = RETRY_MS;
      /* The last good snapshot stays on screen and is labelled stale. A
         portfolio that was true a minute ago, marked as such, is worth more
         than an empty page — and far more than zeroes. */
      emit({
        error: body.error ?? "Portfolio unavailable",
        unconfigured: body.unconfigured,
        loading: false,
        stale: state.snapshot !== null,
      });
    }
  } catch (error: unknown) {
    if (started !== generation) return;
    delay = RETRY_MS;
    emit({
      error: error instanceof Error ? error.message : "Network error",
      loading: false,
      stale: state.snapshot !== null,
    });
  } finally {
    inFlight = false;
    emit({ refreshing: false });
    /* A refetch can land while a poll is scheduled; one timer, not two. A
       read dropped for a switched account is followed at once by one for
       the account now signed in. */
    if (timer !== null) clearTimeout(timer);
    if (subscribers > 0 && enabled) timer = setTimeout(() => void poll(), started !== generation ? 0 : delay);
    else timer = null;
  }
}

function ensurePolling(): void {
  if (timer === null && !inFlight && enabled && subscribers > 0) void poll();
}

/** Drop everything on sign-out or an account switch. Another user's portfolio must never persist. */
function reset(): void {
  generation += 1;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  state = INITIAL;
  for (const listener of listeners) listener();
}

export interface PortfolioFeed extends StoreState {
  /** Privy is still restoring, or the first read has not settled. */
  signedIn: boolean;
  authReady: boolean;
  refetch: () => void;
}

export function usePortfolio(): PortfolioFeed {
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

  /* A portfolio left open for an hour and then looked at must not show an
     hour-old figure for the next thirty seconds. */
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
      ...store,
      /* Privy still restoring is "unknown", not "signed out" — a page that
         renders the connect prompt during that window flashes it at every
         signed-in user on every load. */
      loading: !auth.ready || (signedIn && store.loading),
      signedIn,
      authReady: auth.ready,
      refetch,
    }),
    [store, auth.ready, signedIn, refetch],
  );
}
