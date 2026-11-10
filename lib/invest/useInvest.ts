"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { accountKey } from "@/lib/account";
import type { FillResponse, InvestResponse, PositionUnits, PricedPortfolio } from "@/lib/invest/types";
import { useAuthedFetch } from "@/lib/useAuthedFetch";

/* ---------------------------------------------------------------------------
   Intelligent Portfolios, read once for the workspace.

   The list, a portfolio's page and its trade dialog all read the same
   catalog, prices and positions, so this is one reference-counted store like
   `useAlerts`: one request however many read it, and a recorded fill
   refreshes every one of them.

   The catalog and its prices are public, so the store reads while signed
   out too — positions are simply null then. Positions are account data: the
   store resets whenever `accountKey` changes (signing out included), and a
   read that started under an earlier account is dropped when it lands, so
   one person's positions never appear under the next.
--------------------------------------------------------------------------- */

/** Prices move; positions only change when a fill is recorded, which refreshes. */
const POLL_MS = 30_000;
const RETRY_MS = 60_000;

/** A landed swap the node has not shown yet is asked about again, this often, this many times. */
const FILL_ATTEMPTS = 4;
const FILL_INTERVAL_MS = 4_000;

interface StoreState {
  portfolios: PricedPortfolio[];
  positions: Record<string, PositionUnits> | null;
  positionsError: string | null;
  pricedAt: string | null;
  error: string | null;
  loading: boolean;
}

const INITIAL: StoreState = {
  portfolios: [],
  positions: null,
  positionsError: null,
  pricedAt: null,
  error: null,
  loading: true,
};

let state: StoreState = INITIAL;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let subscribers = 0;
let inFlight: Promise<void> | null = null;
let enabled = false;

/** Bumped by every reset; a read from an earlier generation is dropped. */
let generation = 0;
/** Whose positions the store holds. "" while signed out. */
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
      const response = await read("/api/invest", { cache: "no-store" });
      const body = (await response.json()) as Partial<InvestResponse>;
      if (started !== generation) return;
      if (response.ok) {
        emit({
          portfolios: body.portfolios ?? [],
          positions: body.positions ?? null,
          positionsError: body.positionsError ?? null,
          pricedAt: body.pricedAt ?? null,
          error: body.error ?? null,
          loading: false,
        });
      } else {
        delay = RETRY_MS;
        /* A failed refresh keeps the last good reading on screen and says so. */
        emit({ error: body.error ?? `Portfolios unavailable (${response.status})`, loading: false });
      }
    } catch {
      if (started !== generation) return;
      delay = RETRY_MS;
      emit({ error: "Portfolios could not be read.", loading: false });
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

async function refresh(): Promise<void> {
  if (inFlight !== null) await inFlight;
  await poll();
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface InvestFeed extends StoreState {
  signedIn: boolean;
  refetch: () => void;
  /**
   * Records a landed swap against a portfolio, asking again while the node
   * has not shown it, then refreshes. Never throws; the outcome says what
   * happened.
   */
  record: (portfolioId: string, signature: string) => Promise<FillResponse>;
}

export function useInvest(): InvestFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const signedIn = auth.ready && auth.authenticated;
  const account = accountKey(auth) ?? "";

  useEffect(() => {
    fetcher = authedFetch;
  }, [authedFetch]);

  useEffect(() => {
    enabled = auth.ready;
    if (!auth.ready) return;
    if (owner !== null && owner !== account) reset();
    owner = account;
    ensurePolling();
  }, [auth.ready, account]);

  const refetch = useCallback(() => {
    void poll();
  }, []);

  const record = useCallback(async (portfolioId: string, signature: string): Promise<FillResponse> => {
    const write = fetcher;
    if (write === null) return { outcome: "rejected", reason: "Sign in to record this swap." };
    const started = generation;

    let last: FillResponse = { outcome: "pending", reason: "The network has not shown this swap yet." };
    for (let attempt = 0; attempt < FILL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await sleep(FILL_INTERVAL_MS);
      if (started !== generation) return { outcome: "rejected", reason: "You signed out before this swap was recorded." };
      try {
        const response = await write("/api/invest/fills", {
          method: "POST",
          body: JSON.stringify({ portfolioId, signature }),
        });
        last = (await response.json().catch(() => ({ outcome: "rejected", reason: "The answer could not be read." }))) as FillResponse;
      } catch {
        last = { outcome: "pending", reason: "The network did not answer." };
      }
      if (last.outcome !== "pending") break;
    }
    if (last.outcome === "recorded" || last.outcome === "already-recorded") await refresh();
    return last;
  }, []);

  return useMemo(
    () => ({
      ...store,
      positions: signedIn ? store.positions : null,
      loading: !auth.ready || store.loading,
      signedIn,
      refetch,
      record,
    }),
    [store, auth.ready, signedIn, refetch, record],
  );
}
