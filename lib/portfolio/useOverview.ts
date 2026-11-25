"use client";

import { useCallback, useEffect, useState } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { accountKey } from "@/lib/account";
import type { OverviewResponse } from "@/lib/portfolio/performance";
import { useAuthedFetch } from "@/lib/useAuthedFetch";

/* ---------------------------------------------------------------------------
   The Portfolio page's performance data (GET /api/portfolio/overview).

   Plain per-component state, for the reason usePortfolioHistory gives:
   exactly one surface renders this. The live total still comes from the
   shared `usePortfolio` store; this is the history around it, read on open
   and on Refresh, never polled — a chart that redrew under the cursor every
   thirty seconds would be worse than one a minute old.

   What lands is tagged with the account it was read for and shown only
   while that account is still the one signed in, so one person's history
   never renders under the next (lib/account.ts). Loading is derived from
   that tag rather than stored, so no setState runs before a real await.
--------------------------------------------------------------------------- */

export interface OverviewFeed {
  data: OverviewResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface Loaded {
  data: OverviewResponse | null;
  error: string | null;
  /** The account and the request it answers. */
  key: string | null;
}

export function usePortfolioOverview(): OverviewFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const account = accountKey(auth);
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>({ data: null, error: null, key: null });
  const key = account === null ? null : `${account}:${nonce}`;

  const load = useCallback(async (): Promise<Loaded> => {
    if (key === null) return { data: null, error: null, key };
    try {
      const response = await authedFetch("/api/portfolio/overview", { cache: "no-store" });
      const body = (await response.json()) as OverviewResponse;
      return { data: body.error === null ? body : null, error: body.error, key };
    } catch (error: unknown) {
      return { data: null, error: error instanceof Error ? error.message : "Could not load performance.", key };
    }
  }, [authedFetch, key]);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setLoaded(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);
  const current = key !== null && loaded.key === key;
  /* A refresh keeps the last reading for this account on screen while the next arrives. */
  const sameAccount = account !== null && loaded.key !== null && loaded.key.startsWith(`${account}:`);

  return {
    data: sameAccount ? loaded.data : null,
    loading: key !== null && !current,
    error: current ? loaded.error : null,
    refresh,
  };
}
