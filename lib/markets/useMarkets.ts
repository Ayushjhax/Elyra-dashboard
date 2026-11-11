"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ExchangeListings, MarketsBrief, MarketsOverview } from "@/lib/markets/types";

/* ---------------------------------------------------------------------------
   The markets page's reads: one shared, reference-counted poller per URL, so
   two components showing the same market make one request, and nothing polls
   once the last of them unmounts or while the tab is hidden.

   Public market data only — no account, so nothing here resets on sign-in.
--------------------------------------------------------------------------- */

export interface Polled<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

interface Entry {
  state: Polled<unknown>;
  listeners: Set<() => void>;
  holders: number;
  timer: ReturnType<typeof setInterval> | null;
  inflight: boolean;
}

const entries = new Map<string, Entry>();
const EMPTY: Polled<never> = { data: null, error: null, loading: true };

function entryFor(url: string): Entry {
  let entry = entries.get(url);
  if (entry === undefined) {
    entry = { state: EMPTY, listeners: new Set(), holders: 0, timer: null, inflight: false };
    entries.set(url, entry);
  }
  return entry;
}

function publish(entry: Entry, next: Polled<unknown>) {
  entry.state = next;
  for (const listener of entry.listeners) listener();
}

async function load(url: string) {
  const entry = entryFor(url);
  if (entry.inflight || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
  entry.inflight = true;
  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok || body === null) {
      publish(entry, { data: entry.state.data, error: body?.error ?? "Could not load.", loading: false });
    } else {
      publish(entry, { data: body, error: null, loading: false });
    }
  } catch {
    publish(entry, { data: entry.state.data, error: "Could not reach Elyra.", loading: false });
  } finally {
    entry.inflight = false;
  }
}

function hold(url: string, intervalMs: number) {
  const entry = entryFor(url);
  entry.holders += 1;
  if (entry.holders === 1) {
    void load(url);
    entry.timer = setInterval(() => void load(url), intervalMs);
  }
  return () => {
    entry.holders -= 1;
    if (entry.holders === 0 && entry.timer !== null) {
      clearInterval(entry.timer);
      entry.timer = null;
    }
  };
}

/** Re-reads every held URL when the tab comes back, rather than waiting out the interval. */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    for (const [url, entry] of entries) if (entry.holders > 0) void load(url);
  });
}

export function usePolled<T>(url: string | null, intervalMs: number): Polled<T> {
  useEffect(() => (url === null ? undefined : hold(url, intervalMs)), [url, intervalMs]);
  return useSyncExternalStore(
    (listener) => {
      if (url === null) return () => {};
      const entry = entryFor(url);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    () => (url === null ? EMPTY : (entryFor(url).state as Polled<T>)),
    () => EMPTY as Polled<T>,
  );
}

export const useMarketsOverview = () => usePolled<MarketsOverview>("/api/markets", 30_000);
export const useExchangeListings = (id: string | null) => usePolled<ExchangeListings>(id === null ? null : `/api/markets/${id}`, 30_000);
export const useMarketsBrief = () => usePolled<MarketsBrief>("/api/markets/brief", 10 * 60_000);
