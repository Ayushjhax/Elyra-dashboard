"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { PriceRow, PythAsset } from "@/lib/market/pyth/types";

/* ---------------------------------------------------------------------------
   The single client-side price feed.

   Every component that shows a price subscribes here. There is one timer and
   one request per cycle for the union of every subscribed feed, not one per
   component — the market header, the watchlist rows and the chart header all
   want SOL, and they must not become three requests.

   Subscription is reference counted: a feed is polled while at least one
   component wants it and drops out of the request when the last one unmounts.
--------------------------------------------------------------------------- */

const POLL_MS = 5_000;

/** Backoff after a failure, so an outage does not become a request storm. */
const RETRY_MS = 15_000;

export type FeedStatus = "loading" | "live" | "error";

export interface PriceState {
  rows: Map<number, PriceRow>;
  status: FeedStatus;
  /** Set when the last poll failed; kept alongside the last good rows. */
  error: string | null;
  /** When the rows were last refreshed. */
  fetchedAt: string | null;
  /** Previous price per feed, for the tick flash. */
  previous: Map<number, number>;
  /** Increments per successful poll so a repeated direction re-triggers a flash. */
  seq: number;
}

let state: PriceState = {
  rows: new Map(),
  status: "loading",
  error: null,
  fetchedAt: null,
  previous: new Map(),
  seq: 0,
};

const listeners = new Set<() => void>();

/** Feed id → how many components currently want it. */
const wanted = new Map<number, number>();

let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

function emit(next: Partial<PriceState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): PriceState {
  return state;
}

async function poll(): Promise<void> {
  if (inFlight) return;

  const ids = [...wanted.keys()];
  if (ids.length === 0) {
    /* Nothing subscribed. Stop rather than poll an empty set forever. */
    timer = null;
    return;
  }

  inFlight = true;
  let delay = POLL_MS;

  try {
    const response = await fetch(`/api/market/prices?ids=${ids.join(",")}`, {
      cache: "no-store",
    });

    const body = (await response.json()) as {
      prices?: PriceRow[];
      fetchedAt?: string;
      message?: string;
    };

    if (!response.ok) {
      delay = RETRY_MS;
      /* Keep the last good rows on screen. A stale price labelled stale beats
         an empty panel, and the status drives that label. */
      emit({
        status: "error",
        error: body.message ?? `Prices unavailable (${response.status})`,
      });
    } else {
      const rows = new Map<number, PriceRow>();
      const previous = new Map<number, number>();
      for (const row of body.prices ?? []) {
        rows.set(row.id, row);
        const before = state.rows.get(row.id)?.price;
        if (before !== undefined) previous.set(row.id, before);
      }
      emit({
        rows,
        previous,
        status: "live",
        error: null,
        fetchedAt: body.fetchedAt ?? new Date().toISOString(),
        seq: state.seq + 1,
      });
    }
  } catch (error: unknown) {
    delay = RETRY_MS;
    emit({
      status: "error",
      error: error instanceof Error ? error.message : "Network error",
    });
  } finally {
    inFlight = false;
    if (wanted.size > 0) timer = setTimeout(() => void poll(), delay);
    else timer = null;
  }
}

function ensurePolling(): void {
  if (timer === null && !inFlight) void poll();
}

/**
 * Ask the shared feed to refresh now.
 *
 * This keeps retry buttons on individual surfaces from creating their own
 * fetch path (and therefore a second price loop). The current in-flight poll,
 * when there is one, remains authoritative and schedules the next cycle.
 */
export function refreshPrices(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  ensurePolling();
}

function retain(ids: number[]): void {
  for (const id of ids) wanted.set(id, (wanted.get(id) ?? 0) + 1);
  ensurePolling();
}

function release(ids: number[]): void {
  for (const id of ids) {
    const count = (wanted.get(id) ?? 0) - 1;
    if (count <= 0) wanted.delete(id);
    else wanted.set(id, count);
  }
}

/**
 * Subscribe to live prices for a set of feeds.
 *
 * The ids array is compared by value, so callers may pass a fresh array each
 * render without restarting the subscription.
 */
export function usePrices(ids: number[]): PriceState {
  const key = useMemo(() => [...ids].sort((a, b) => a - b).join(","), [ids]);
  const stable = useMemo(
    () => (key === "" ? [] : key.split(",").map(Number)),
    [key],
  );

  const previousKey = useRef<string | null>(null);

  useEffect(() => {
    retain(stable);
    previousKey.current = key;
    return () => release(stable);
  }, [key, stable]);

  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** One feed's row, or undefined until the first poll lands. */
export function usePrice(id: number | null): {
  row: PriceRow | undefined;
  status: FeedStatus;
  error: string | null;
  direction: "up" | "down" | "flat";
  seq: number;
} {
  const ids = useMemo(() => (id === null ? [] : [id]), [id]);
  const feed = usePrices(ids);

  const row = id === null ? undefined : feed.rows.get(id);
  const before = id === null ? undefined : feed.previous.get(id);

  const direction: "up" | "down" | "flat" =
    row === undefined || before === undefined || row.price === before
      ? "flat"
      : row.price > before
        ? "up"
        : "down";

  return { row, status: feed.status, error: feed.error, direction, seq: feed.seq };
}

/* ---------------------------------------------------------------------------
   Asset lookup

   Assets change on the order of days, so they are fetched once and kept, not
   polled. The cache is a proper external store rather than a module Map plus
   a forced re-render: subscribers are notified when an entry lands, which is
   what `useSyncExternalStore` exists for and what keeps the effects here free
   of `setState` calls.
--------------------------------------------------------------------------- */

/**
 * The resolved catalogue, as an immutable snapshot.
 *
 * Replaced wholesale rather than mutated, so `useSyncExternalStore` hands
 * consumers a value that actually changes identity when the data changes —
 * a mutable Map plus a version counter would work but leaves every `useMemo`
 * depending on a number that lint cannot tell is meaningful.
 */
interface AssetStore {
  byId: ReadonlyMap<number, PythAsset>;
  /** Ticker → feed, or null when the catalogue has no such asset. */
  bySymbol: ReadonlyMap<string, PythAsset | null>;
}

let assetStore: AssetStore = { byId: new Map(), bySymbol: new Map() };

const assetListeners = new Set<() => void>();

function subscribeAssets(listener: () => void): () => void {
  assetListeners.add(listener);
  return () => assetListeners.delete(listener);
}

function assetSnapshot(): AssetStore {
  return assetStore;
}

/** Apply a batch of resolutions and notify subscribers once. */
function commitAssets(
  byId: Iterable<PythAsset>,
  bySymbol: Iterable<[string, PythAsset | null]> = [],
): void {
  const nextById = new Map(assetStore.byId);
  const nextBySymbol = new Map(assetStore.bySymbol);
  for (const asset of byId) nextById.set(asset.id, asset);
  for (const [symbol, asset] of bySymbol) {
    nextBySymbol.set(symbol, asset);
    if (asset) nextById.set(asset.id, asset);
  }
  assetStore = { byId: nextById, bySymbol: nextBySymbol };
  for (const listener of assetListeners) listener();
}

/** In-flight requests, keyed by the set being asked for. */
const assetRequests = new Map<string, Promise<void>>();

function loadByIds(ids: number[]): Promise<void> {
  const missing = ids.filter((id) => !assetStore.byId.has(id));
  if (missing.length === 0) return Promise.resolve();

  const key = `ids:${missing.sort((a, b) => a - b).join(",")}`;
  const existing = assetRequests.get(key);
  if (existing) return existing;

  const work = (async () => {
    try {
      const response = await fetch(
        `/api/market/assets?ids=${key.slice("ids:".length)}`,
      );
      if (!response.ok) return;
      const body = (await response.json()) as { assets?: PythAsset[] };
      commitAssets(body.assets ?? []);
    } catch {
      /* Leave them unresolved; the next mount retries. */
    }
  })().finally(() => assetRequests.delete(key));

  assetRequests.set(key, work);
  return work;
}

function loadBySymbols(symbols: string[]): Promise<void> {
  const missing = symbols.filter((symbol) => !assetStore.bySymbol.has(symbol));
  if (missing.length === 0) return Promise.resolve();

  const key = `sym:${missing.sort().join(",")}`;
  const existing = assetRequests.get(key);
  if (existing) return existing;

  const work = (async () => {
    try {
      const response = await fetch(
        `/api/market/assets?symbols=${key.slice("sym:".length)}`,
      );
      const body = response.ok
        ? ((await response.json()) as { assets?: PythAsset[] })
        : { assets: [] };
      const found = new Map(
        (body.assets ?? []).map((asset) => [asset.symbol.toUpperCase(), asset]),
      );
      /* Misses are recorded too, so an unlisted ticker is asked for once. */
      commitAssets(
        [],
        missing.map((symbol) => [symbol, found.get(symbol) ?? null] as const),
      );
    } catch {
      commitAssets([], missing.map((symbol) => [symbol, null] as const));
    }
  })().finally(() => assetRequests.delete(key));

  assetRequests.set(key, work);
  return work;
}

/** Resolve feed ids to their metadata. Returns whatever is known so far. */
export function useAssets(ids: number[]): {
  assets: PythAsset[];
  byId: Map<number, PythAsset>;
  loading: boolean;
} {
  const key = useMemo(() => [...new Set(ids)].sort((a, b) => a - b).join(","), [ids]);
  const store = useSyncExternalStore(subscribeAssets, assetSnapshot, assetSnapshot);

  useEffect(() => {
    if (key === "") return;
    void loadByIds(key.split(",").map(Number));
  }, [key]);

  return useMemo(() => {
    const wanted = key === "" ? [] : key.split(",").map(Number);
    const assets = wanted
      .map((id) => store.byId.get(id))
      .filter((asset): asset is PythAsset => asset !== undefined);
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    return { assets, byId, loading: assets.length < wanted.length };
  }, [key, store]);
}

/**
 * Resolve tickers to assets.
 *
 * For data that predates feed ids — the seeded positions, orders and signals,
 * which name a market by ticker. An unknown ticker resolves to nothing rather
 * than an error.
 */
export function useAssetsBySymbols(symbols: string[]): Map<string, PythAsset> {
  const key = useMemo(
    () => [...new Set(symbols.map((symbol) => symbol.toUpperCase()))].sort().join(","),
    [symbols],
  );
  const store = useSyncExternalStore(subscribeAssets, assetSnapshot, assetSnapshot);

  useEffect(() => {
    if (key === "") return;
    void loadBySymbols(key.split(","));
  }, [key]);

  return useMemo(() => {
    const map = new Map<string, PythAsset>();
    if (key === "") return map;
    for (const symbol of key.split(",")) {
      const asset = store.bySymbol.get(symbol);
      if (asset) map.set(symbol, asset);
    }
    return map;
  }, [key, store]);
}
