"use client";

import { useEffect, useState } from "react";
import { nextCloseAt, type LegendResponse } from "@/lib/market/chartFacts";
import type { Interval } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The chart legend's figures (GET /api/market/legend) for the market and
   interval on screen, shared by the chart and the decision brief.

   A module cache keyed by market and interval, so both surfaces cost one
   request; and a refresh timed to the next candle's close, so the "last
   completed close" moves on when a candle completes rather than on a fixed
   poll that could leave a 1m chart a candle behind.
--------------------------------------------------------------------------- */

const TTL_MS = 20_000;
/* A little after the boundary, so the exchange has published the candle. */
const AFTER_CLOSE_MS = 3_000;
const MIN_WAIT_MS = 5_000;
const MAX_WAIT_MS = 5 * 60_000;

const cache = new Map<string, { at: number; value: Promise<LegendResponse> }>();

function failed(symbol: string, interval: Interval): LegendResponse {
  return { symbol, interval, period: 20, close: null, ema: null, source: null, error: "Candles could not be read." };
}

function load(symbol: string, interval: Interval): Promise<LegendResponse> {
  const key = `${symbol}:${interval}`;
  const hit = cache.get(key);
  if (hit !== undefined && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = fetch(`/api/market/legend?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`)
    .then((response) => response.json() as Promise<LegendResponse>)
    .catch(() => failed(symbol, interval));
  cache.set(key, { at: Date.now(), value });
  void value.then((result) => {
    if (result.close === null) cache.delete(key);
  });
  return value;
}

export function useChartFacts(
  symbol: string | null,
  interval: Interval,
): { data: LegendResponse | null; loading: boolean } {
  const key = symbol === null ? null : `${symbol}:${interval}`;
  const [state, setState] = useState<{ for: string | null; data: LegendResponse | null }>({ for: null, data: null });

  useEffect(() => {
    if (symbol === null || key === null) return;
    let cancelled = false;
    let timer: number | undefined;
    const read = () => {
      void load(symbol, interval).then((data) => {
        if (cancelled) return;
        setState({ for: key, data });
        const wait =
          data.close === null ? MAX_WAIT_MS / 5 : nextCloseAt(data.close.openTime, interval) + AFTER_CLOSE_MS - Date.now();
        timer = window.setTimeout(read, Math.min(Math.max(wait, MIN_WAIT_MS), MAX_WAIT_MS));
      });
    };
    read();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [symbol, interval, key]);

  /* Derived, so a market or interval switch never shows the last one's figures. */
  const current = state.for === key ? state.data : null;
  return { data: current, loading: key !== null && current === null };
}
