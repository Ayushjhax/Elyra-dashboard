"use client";

import { useSyncExternalStore } from "react";
import type { Side } from "@/lib/autotrade/rules";
import { useElyraStore } from "@/lib/store";

/* ---------------------------------------------------------------------------
   A request to open the chart's order ticket (components/trade/TradePanel)
   from somewhere else — a signal card's Paper trade. The chart is mounted
   for the whole session, so it listens here: it selects the market, opens
   the ticket on the side asked for, and on paper when asked, whatever the
   header's Live / Paper switch shows. Nothing is sent until the person
   places the order in the ticket.
--------------------------------------------------------------------------- */

export interface TicketRequest {
  /** The Pyth feed id the chart selects. */
  assetId: number;
  side: Side;
  /** Send to the paper account whatever the header shows. */
  paper: boolean;
  /** Distinguishes two requests for the same market. */
  at: number;
}

let current: TicketRequest | null = null;
const listeners = new Set<() => void>();

/** Selects the market on the chart and asks it to open its ticket. */
export function requestTicket(request: Omit<TicketRequest, "at">): void {
  useElyraStore.getState().setSelectedAssetId(request.assetId);
  current = { ...request, at: Date.now() };
  for (const listener of listeners) listener();
}

/** The ticket closed: the request is done, and a remount does not open it again. */
export function clearTicketRequest(): void {
  current = null;
  for (const listener of listeners) listener();
}

export function useTicketRequest(): TicketRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}
