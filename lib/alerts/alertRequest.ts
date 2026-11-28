"use client";

import { useSyncExternalStore } from "react";
import { useElyraStore } from "@/lib/store";

/* ---------------------------------------------------------------------------
   A request to open the chart's alert form (components/panels/ChartAlerts)
   with a market and a target already filled in — the decision brief's
   "Set alert". The chart is mounted for the whole session, so it listens
   here. Nothing is saved until the person presses Set alert in the form.
--------------------------------------------------------------------------- */

export interface AlertRequest {
  /** The chart market's ticker, upper case. */
  symbol: string;
  target: number;
  direction: "above" | "below";
  /** Distinguishes two requests for the same level. */
  at: number;
}

let current: AlertRequest | null = null;
const listeners = new Set<() => void>();

/** Asks the chart to open its alert form, filled in. */
export function requestAlert(request: Omit<AlertRequest, "at">): void {
  /* Below 1280px Elyra is a drawer over the chart: it steps aside so the
     form it asked for is on screen. */
  const state = useElyraStore.getState();
  if (state.agentDrawerOpen) state.setAgentDrawerOpen(false);
  current = { ...request, symbol: request.symbol.toUpperCase(), at: Date.now() };
  for (const listener of listeners) listener();
}

export function useAlertRequest(): AlertRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}
