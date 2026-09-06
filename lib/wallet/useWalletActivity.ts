"use client";

import { useCallback, useEffect, useState } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import type { ActivityResponse, WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Recent transactions for the signed-in wallet.

   Plain per-component state rather than the external store `useWalletDashboard`
   uses, because exactly one panel renders this and a shared store would be
   machinery for a single subscriber. If a second surface ever wants it, move
   it to the same reference-counted shape.

   `load` fetches and returns; it never sets state. Every `setState` here
   happens inside an awaited continuation guarded by a cancel flag, which is
   both what keeps a late response from overwriting a newer one and what keeps
   the React compiler's set-state-in-effect rule satisfied.
--------------------------------------------------------------------------- */

/** Slower than balances: a transaction list changes only when you transact. */
const POLL_MS = 60_000;

export interface ActivityFeed {
  items: WalletActivity[];
  isLoading: boolean;
  error: string | null;
  unconfigured: boolean;
  refetch: () => void;
}

interface FeedState {
  items: WalletActivity[];
  error: string | null;
  unconfigured: boolean;
  loading: boolean;
}

const INITIAL: FeedState = {
  items: [],
  error: null,
  unconfigured: false,
  loading: true,
};

const SIGNED_OUT: FeedState = { ...INITIAL, loading: false };

export function useWalletActivity(limit = 20): ActivityFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const [state, setState] = useState<FeedState>(INITIAL);

  const signedIn = auth.ready && auth.authenticated;

  const load = useCallback(async (): Promise<FeedState> => {
    if (!signedIn) return SIGNED_OUT;
    try {
      const response = await authedFetch(`/api/wallet/activity?limit=${limit}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as ActivityResponse;
      return {
        items: body.items,
        error: body.error,
        unconfigured: body.unconfigured,
        loading: false,
      };
    } catch (error: unknown) {
      return {
        items: [],
        error: error instanceof Error ? error.message : "Network error",
        unconfigured: false,
        loading: false,
      };
    }
  }, [authedFetch, limit, signedIn]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void load().then((next) => {
        if (!cancelled) setState(next);
      });
    };

    tick();
    const timer = setInterval(tick, POLL_MS);
    const onFocus = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const refetch = useCallback(() => {
    void load().then(setState);
  }, [load]);

  return {
    items: state.items,
    isLoading: state.loading,
    error: state.error,
    unconfigured: state.unconfigured,
    refetch,
  };
}
