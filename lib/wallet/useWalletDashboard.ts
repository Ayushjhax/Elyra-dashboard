"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import {
  CLUSTER_LABEL,
  EXPECTED_CLUSTER,
  type Cluster,
} from "@/lib/solana/cluster";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import type { WalletResponse, WalletSnapshot } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   The single source of truth for wallet data.

   Every surface that shows a balance reads this hook: the status-bar chip,
   the wallet panel, and the dashboard's own panels. No presentational
   component fetches.

   It is an external store rather than per-component state for the reason
   `usePrices` is: three components calling a plain `useEffect` fetcher would
   be three requests every thirty seconds against a paid RPC, for one number
   they all agree on. Subscription is reference counted — polling starts with
   the first subscriber and stops with the last — so an unmounted panel costs
   nothing.

   The store holds only what was fetched. Signed-out and not-ready are derived
   at the bottom of this file rather than written into state, which is also
   what keeps every `setState` out of an effect body.
--------------------------------------------------------------------------- */

/** The spec's cadence. Balances do not move faster than the user can read. */
const POLL_MS = 30_000;

/** After a failure. A failing endpoint must not be asked twice as often. */
const RETRY_MS = 60_000;

interface WalletState {
  snapshot: WalletSnapshot | null;
  error: string | null;
  unconfigured: boolean;
  latencyMs: number | null;
  /** True until the first attempt settles, whatever its outcome. */
  loading: boolean;
  /** The last attempt failed, but `snapshot` is a real earlier reading. */
  stale: boolean;
  /** When the last successful read landed, epoch ms. Null before the first. */
  fetchedAt: number | null;
  /** A read is in flight — the first, a poll, or a refetch. */
  refreshing: boolean;
}

const INITIAL: WalletState = {
  snapshot: null,
  error: null,
  unconfigured: false,
  latencyMs: null,
  loading: true,
  stale: false,
  fetchedAt: null,
  refreshing: false,
};

let state: WalletState = INITIAL;
const listeners = new Set<() => void>();

let timer: ReturnType<typeof setTimeout> | null = null;
let subscribers = 0;
let inFlight = false;

/**
 * The authenticated fetcher, handed in by the hook.
 *
 * The store cannot build one itself: the bearer token comes from Privy, which
 * is only reachable through a hook. Assigning a module variable from an effect
 * is not state, so this does not put a render-phase write anywhere.
 */
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher | null = null;

/** False while signed out, which is when polling must not happen at all. */
let enabled = false;

/**
 * Bumped by every reset. A read that started under an earlier generation
 * belongs to an account that is no longer signed in here, and is dropped
 * when it lands rather than written over the new one.
 */
let generation = 0;

/** Whose wallet the store holds: the Privy account it was read for. */
let owner: string | null = null;

function emit(next: Partial<WalletState>): void {
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

function snapshot(): WalletState {
  return state;
}

/** Stable across renders, so the server render and the first client render agree. */
function serverSnapshot(): WalletState {
  return INITIAL;
}

async function poll(): Promise<void> {
  if (inFlight || !enabled || fetcher === null) return;

  inFlight = true;
  emit({ refreshing: true });
  let delay = POLL_MS;
  const started = generation;

  try {
    const response = await fetcher("/api/wallet", { cache: "no-store" });
    const body = (await response.json()) as WalletResponse;
    if (started !== generation) return;

    if (body.wallet !== null) {
      emit({
        snapshot: body.wallet,
        error: body.error,
        unconfigured: false,
        latencyMs: body.latencyMs,
        loading: false,
        stale: false,
        fetchedAt: Date.now(),
      });
    } else {
      delay = RETRY_MS;
      /* The last good snapshot stays on screen and is labelled stale. A
         balance that was true a minute ago, marked as such, is worth more
         than an empty panel — and far more than a zero. */
      emit({
        error: body.error ?? "Wallet unavailable",
        unconfigured: body.unconfigured,
        latencyMs: body.latencyMs,
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
       the account now signed in, rather than a poll interval later. */
    if (timer !== null) clearTimeout(timer);
    if (subscribers > 0 && enabled) timer = setTimeout(() => void poll(), started !== generation ? 0 : delay);
    else timer = null;
  }
}

function ensurePolling(): void {
  if (timer === null && !inFlight && enabled && subscribers > 0) void poll();
}

/** Drop everything on sign-out or an account switch. Another user's balance must never persist. */
function reset(): void {
  generation += 1;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  state = INITIAL;
  for (const listener of listeners) listener();
}

export interface WalletDashboard {
  /** Solana address, or null when signed out or the account has no wallet. */
  address: string | null;
  /** Native SOL. Null until a reading lands. */
  balance: number | null;
  /** SOL plus every verified, priced token. Null when not computable. */
  usdValue: number | null;
  /** Human-readable network name, from the node's own genesis hash. */
  chain: string;
  cluster: Cluster | null;
  /** The endpoint is not the cluster this app expects. */
  wrongChain: boolean;
  snapshot: WalletSnapshot | null;
  isLoading: boolean;
  error: string | null;
  /** `snapshot` is real but predates a failed refresh. */
  stale: boolean;
  /** SOLANA_RPC_URL is unset — a configuration gap, not an outage. */
  unconfigured: boolean;
  latencyMs: number | null;
  /** When the last successful read landed, epoch ms. */
  fetchedAt: number | null;
  /** A read is in flight, so a second refresh would be a duplicate. */
  refreshing: boolean;
  refetch: () => void;
}

export function useWalletDashboard(): WalletDashboard {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const store = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  const signedIn = auth.ready && auth.authenticated;
  /* Who is signed in. A different account — signed out and back in as
     someone else, without the store ever seeing "signed out" — is a reset
     too, so its wallet is never shown under the last one's. */
  const account = signedIn ? (auth.account?.id ?? auth.solanaAddress ?? "") : null;

  /* Hand the store its fetcher and its on/off switch. Both are module
     assignments rather than state, so nothing here re-renders anyone. */
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

  /* Refetch when the tab comes back. A dashboard left open for an hour and
     then looked at should not show an hour-old balance for 30 seconds. */
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

  return useMemo<WalletDashboard>(() => {
    if (!auth.ready) {
      /* Privy is still restoring the session. Not signed out — unknown. */
      return {
        address: null, balance: null, usdValue: null,
        chain: CLUSTER_LABEL[EXPECTED_CLUSTER], cluster: null, wrongChain: false,
        snapshot: null, isLoading: true, error: null, stale: false,
        unconfigured: false, latencyMs: null, fetchedAt: null, refreshing: false, refetch,
      };
    }

    if (!auth.authenticated) {
      return {
        address: null, balance: null, usdValue: null,
        chain: CLUSTER_LABEL[EXPECTED_CLUSTER], cluster: null, wrongChain: false,
        snapshot: null, isLoading: false, error: null, stale: false,
        unconfigured: false, latencyMs: null, fetchedAt: null, refreshing: false, refetch,
      };
    }

    const cluster = store.snapshot?.cluster ?? null;

    return {
      /* The session's address is known before any balance is, so the panel
         can show who it is reading while the number is still loading. */
      address: store.snapshot?.address ?? auth.solanaAddress,
      balance: store.snapshot?.sol ?? null,
      usdValue: store.snapshot?.usdValue ?? null,
      chain: cluster === null ? CLUSTER_LABEL[EXPECTED_CLUSTER] : CLUSTER_LABEL[cluster],
      cluster,
      wrongChain: cluster !== null && cluster !== EXPECTED_CLUSTER,
      snapshot: store.snapshot,
      isLoading: store.loading,
      error: store.error,
      stale: store.stale,
      unconfigured: store.unconfigured,
      latencyMs: store.latencyMs,
      fetchedAt: store.fetchedAt,
      refreshing: store.refreshing,
      refetch,
    };
  }, [auth.ready, auth.authenticated, auth.solanaAddress, store, refetch]);
}
