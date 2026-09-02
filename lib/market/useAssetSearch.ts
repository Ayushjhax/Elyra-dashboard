"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PythAsset, PythAssetType } from "@/lib/market/pyth/types";

/* ---------------------------------------------------------------------------
   Asset search against the server-side Pyth catalogue.

   Debounced, so typing "bitcoin" is one request rather than seven, and
   sequenced, so a slow early response cannot overwrite a fast later one.
   Results are memoised per query so re-opening the picker or backspacing to
   a previous term costs nothing.
--------------------------------------------------------------------------- */

const DEBOUNCE_MS = 180;

/**
 * Results per query, kept for the life of the page.
 *
 * An immutable snapshot rather than a mutated Map, for the same reason the
 * asset store is one: a cache hit is then resolvable during render, so
 * backspacing to a previous term shows its results without an effect writing
 * state and forcing a second pass.
 */
let cache: ReadonlyMap<string, PythAsset[]> = new Map();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): ReadonlyMap<string, PythAsset[]> {
  return cache;
}

function remember(key: string, assets: PythAsset[]): void {
  const next = new Map(cache);
  next.set(key, assets);
  cache = next;
  for (const listener of listeners) listener();
}

export type SearchStatus = "idle" | "loading" | "ready" | "error";

export function useAssetSearch(
  query: string,
  assetType: PythAssetType | null,
  enabled = true,
): { assets: PythAsset[]; status: SearchStatus; error: string | null } {
  const key = `${assetType ?? ""}:${query.trim().toLowerCase()}`;

  const results = useSyncExternalStore(subscribe, snapshot, snapshot);
  const cached = results.get(key);

  /* Only the failure path needs local state; success lives in the store. */
  const [error, setError] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  /* Monotonic request id: only the newest response is allowed to land. */
  const latest = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (results.has(key)) return;

    const ticket = ++latest.current;

    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim(), limit: "60" });
      if (assetType) params.set("type", assetType);

      void (async () => {
        try {
          const response = await fetch(`/api/market/assets?${params.toString()}`);
          const body = (await response.json()) as {
            assets?: PythAsset[];
            message?: string;
          };

          if (ticket !== latest.current) return;

          if (!response.ok) {
            setError(body.message ?? `Asset search failed (${response.status})`);
            setFailedKey(key);
            return;
          }

          remember(key, body.assets ?? []);
        } catch (cause: unknown) {
          if (ticket !== latest.current) return;
          setError(cause instanceof Error ? cause.message : "Network error");
          setFailedKey(key);
        }
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [key, query, assetType, enabled, results]);

  const status: SearchStatus = cached
    ? "ready"
    : failedKey === key
      ? "error"
      : enabled
        ? "loading"
        : "idle";

  return { assets: cached ?? [], status, error: status === "error" ? error : null };
}
