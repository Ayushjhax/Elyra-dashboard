"use client";

import { useEffect, useState } from "react";
import type { LevelsResponse } from "@/app/api/market/levels/route";

/* ---------------------------------------------------------------------------
   Prior-day pivot levels for one symbol, shared by the chart and the brief.

   A module cache keyed by symbol, because both ask for the same market and a
   daily candle's levels do not change until the day turns: one request per
   symbol per fifteen minutes, however many surfaces read it.
--------------------------------------------------------------------------- */

const TTL_MS = 15 * 60_000;
const cache = new Map<string, { at: number; value: Promise<LevelsResponse> }>();

function load(symbol: string): Promise<LevelsResponse> {
  const hit = cache.get(symbol);
  if (hit !== undefined && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = fetch(`/api/market/levels?symbol=${encodeURIComponent(symbol)}`)
    .then((response) => response.json() as Promise<LevelsResponse>)
    .catch((): LevelsResponse => ({ symbol, levels: null, source: "", error: "Levels could not be read." }));
  cache.set(symbol, { at: Date.now(), value });
  void value.then((result) => {
    if (result.levels === null) cache.delete(symbol);
  });
  return value;
}

export function useLevels(symbol: string | null): { data: LevelsResponse | null; loading: boolean } {
  const [state, setState] = useState<{ for: string | null; data: LevelsResponse | null }>({
    for: null,
    data: null,
  });

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    void load(symbol).then((data) => {
      if (!cancelled) setState({ for: symbol, data });
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  /* Derived, so a market switch never shows the last market's levels. */
  const current = state.for === symbol ? state.data : null;
  return { data: current, loading: symbol !== null && current === null };
}
