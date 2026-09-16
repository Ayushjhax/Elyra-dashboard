"use client";

import { useCallback, useEffect, useState } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import type { HistoryResponse } from "@/app/api/portfolio/history/route";
import type { PortfolioHistoryPoint } from "@/lib/portfolio/types";

/* ---------------------------------------------------------------------------
   The performance series for one period.

   Plain per-component state rather than the shared external store the rest of
   the portfolio uses: exactly one component renders this, and it is keyed by
   a control that component owns. A reference-counted singleton would be
   machinery for a single subscriber.

   Refetched on range change and on nothing else. Prices move, but a chart
   that redrew every thirty seconds under the reader's cursor would be worse
   than one that is a minute stale, and the KPI strip above it already
   carries the live figure.
--------------------------------------------------------------------------- */

export type HistoryBasis = HistoryResponse["basis"];

export interface HistoryFeed {
  points: PortfolioHistoryPoint[];
  basis: HistoryBasis;
  uncovered: string[];
  coveragePct: number;
  loading: boolean;
  error: string | null;
}

/** What landed, and which range it belongs to. */
interface Loaded {
  points: PortfolioHistoryPoint[];
  basis: HistoryBasis;
  uncovered: string[];
  coveragePct: number;
  error: string | null;
  forRange: string | null;
}

const NOTHING: Loaded = {
  points: [],
  basis: "none",
  uncovered: [],
  coveragePct: 0,
  error: null,
  forRange: null,
};

export function usePortfolioHistory(range: string): HistoryFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const [loaded, setLoaded] = useState<Loaded>(NOTHING);

  const signedIn = auth.ready && auth.authenticated;

  /* Pure fetch, with no setState of its own. `react-hooks/set-state-in-effect`
     rejects any setState reachable before an effect's first await — the same
     constraint EngineSignalPanel and SmartMoneyPanel document — so every
     write here sits behind a real `.then()` boundary. */
  const load = useCallback(async (): Promise<Loaded> => {
    if (!signedIn) return { ...NOTHING, forRange: range };
    try {
      const response = await authedFetch(
        `/api/portfolio/history?range=${encodeURIComponent(range)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as HistoryResponse;
      return {
        points: body.points,
        basis: body.basis,
        uncovered: body.uncovered,
        coveragePct: body.coveragePct,
        error: body.error,
        forRange: range,
      };
    } catch (error: unknown) {
      return {
        ...NOTHING,
        error: error instanceof Error ? error.message : "Could not load history",
        forRange: range,
      };
    }
  }, [authedFetch, range, signedIn]);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setLoaded(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  /* Loading is DERIVED, not stored: the data on hand either belongs to the
     range being asked for or it does not. That removes the synchronous
     setState a "start loading" flag would need, and it is also more correct
     — a stale range can never render as settled for a frame. */
  return {
    points: loaded.forRange === range ? loaded.points : [],
    basis: loaded.forRange === range ? loaded.basis : "none",
    uncovered: loaded.forRange === range ? loaded.uncovered : [],
    coveragePct: loaded.forRange === range ? loaded.coveragePct : 0,
    loading: loaded.forRange !== range,
    error: loaded.forRange === range ? loaded.error : null,
  };
}
