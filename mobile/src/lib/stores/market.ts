import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { LevelsResponse } from "@/lib/market/levels";
import type { PriceRow, PythAsset, PythAssetType } from "@/lib/market/pyth/types";
import { baseTicker, hyperliquidIcon, type TickerLogo } from "@/lib/market/tickerLogoData";
import { api, ApiError } from "~/lib/api";

/* ---------------------------------------------------------------------------
   Market data — ported from the website's lib/market/usePrices.ts,
   useAssetSearch.ts, useLevels.ts and tickerLogos.ts.

   Not account data: prices, the catalogue and pivot levels are the same for
   everyone, so these stores do not reset on an account change.

   PRICES. One timer and one batched request per cycle for the union of every
   subscribed feed (/api/market/prices), however many rows want SOL. Reference
   counted: a feed is asked for while something on screen wants it, and not
   at all while the app is in the background. A failed poll keeps the last
   good rows on screen, labelled by `status`.

   ASSETS. Fetched once and kept; they change on the order of days.

   SEARCH. Debounced and sequenced, memoised per query.

   LEVELS. Prior-day pivots, cached per symbol for fifteen minutes.
--------------------------------------------------------------------------- */

const POLL_MS = 5_000;
const RETRY_MS = 15_000;

/** The server's own words for a market route's failure: its `message`. */
function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { message?: unknown } | null;
    if (body !== null && typeof body.message === "string") return body.message;
    return error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

/* ---- prices ---- */

export type FeedStatus = "loading" | "live" | "error";

export interface PriceState {
  rows: ReadonlyMap<number, PriceRow>;
  status: FeedStatus;
  error: string | null;
  fetchedAt: string | null;
  /** Previous price per feed, for the tick flash. */
  previous: ReadonlyMap<number, number>;
  /** Increments per good poll, so a repeated direction flashes again. */
  seq: number;
}

let prices: PriceState = { rows: new Map(), status: "loading", error: null, fetchedAt: null, previous: new Map(), seq: 0 };
const priceListeners = new Set<() => void>();
const wanted = new Map<number, number>();
let priceTimer: ReturnType<typeof setTimeout> | null = null;
let priceInFlight = false;
let appState: AppStateStatus = typeof AppState.currentState === "string" ? (AppState.currentState as AppStateStatus) : "active";

function emitPrices(next: Partial<PriceState>): void {
  prices = { ...prices, ...next };
  for (const listener of [...priceListeners]) listener();
}

function stopPriceTimer(): void {
  if (priceTimer !== null) clearTimeout(priceTimer);
  priceTimer = null;
}

async function pollPrices(): Promise<void> {
  if (priceInFlight) return;
  const ids = [...wanted.keys()];
  if (ids.length === 0 || appState !== "active") {
    stopPriceTimer();
    return;
  }
  priceInFlight = true;
  let delay = POLL_MS;
  try {
    const body = await api.get<{ prices?: PriceRow[]; fetchedAt?: string }>(`/api/market/prices?ids=${ids.join(",")}`, { auth: false });
    const rows = new Map<number, PriceRow>();
    const previous = new Map<number, number>();
    for (const row of body.prices ?? []) {
      rows.set(row.id, row);
      const before = prices.rows.get(row.id)?.price;
      if (before !== undefined) previous.set(row.id, before);
    }
    /* Feeds that were not asked for this time keep their last row, so a
       screen that briefly unsubscribes does not blank. */
    for (const [id, row] of prices.rows) if (!rows.has(id)) rows.set(id, row);
    emitPrices({ rows, previous, status: "live", error: null, fetchedAt: body.fetchedAt ?? new Date().toISOString(), seq: prices.seq + 1 });
  } catch (error) {
    delay = RETRY_MS;
    emitPrices({ status: "error", error: messageOf(error, "Prices unavailable") });
  } finally {
    priceInFlight = false;
    stopPriceTimer();
    if (wanted.size > 0 && appState === "active") priceTimer = setTimeout(() => void pollPrices(), delay);
  }
}

AppState.addEventListener("change", (next) => {
  const was = appState;
  appState = next;
  if (next === "active" && was !== "active") void pollPrices();
  else if (next !== "active") stopPriceTimer();
});

/** Refresh now — for pull to refresh and Try again; one loop, never two. */
export function refreshPrices(): void {
  stopPriceTimer();
  void pollPrices();
}

function subscribePrices(listener: () => void): () => void {
  priceListeners.add(listener);
  return () => priceListeners.delete(listener);
}

/** Live prices for a set of feeds. The ids are compared by value. */
export function usePrices(ids: readonly number[]): PriceState {
  const key = useMemo(() => [...new Set(ids)].sort((a, b) => a - b).join(","), [ids]);
  useEffect(() => {
    if (key === "") return;
    const list = key.split(",").map(Number);
    for (const id of list) wanted.set(id, (wanted.get(id) ?? 0) + 1);
    if (priceTimer === null && !priceInFlight) void pollPrices();
    return () => {
      for (const id of list) {
        const count = (wanted.get(id) ?? 0) - 1;
        if (count <= 0) wanted.delete(id);
        else wanted.set(id, count);
      }
    };
  }, [key]);
  return useSyncExternalStore(subscribePrices, () => prices);
}

export type Direction = "up" | "down" | "flat";

export function directionOf(row: PriceRow | undefined, before: number | undefined): Direction {
  return row === undefined || before === undefined || row.price === before ? "flat" : row.price > before ? "up" : "down";
}

/** One feed's row, or undefined until the first poll lands. */
export function usePrice(id: number | null): { row: PriceRow | undefined; status: FeedStatus; error: string | null; direction: Direction; seq: number } {
  const ids = useMemo(() => (id === null ? [] : [id]), [id]);
  const feed = usePrices(ids);
  const row = id === null ? undefined : feed.rows.get(id);
  const before = id === null ? undefined : feed.previous.get(id);
  return { row, status: feed.status, error: feed.error, direction: directionOf(row, before), seq: feed.seq };
}

/* ---- the asset catalogue ---- */

interface AssetStore {
  byId: ReadonlyMap<number, PythAsset>;
  /** Ticker → asset, or null when the catalogue has none. */
  bySymbol: ReadonlyMap<string, PythAsset | null>;
}

let assetStore: AssetStore = { byId: new Map(), bySymbol: new Map() };
const assetListeners = new Set<() => void>();
const assetRequests = new Map<string, Promise<void>>();

function commitAssets(byId: Iterable<PythAsset>, bySymbol: Iterable<readonly [string, PythAsset | null]> = []): void {
  const nextById = new Map(assetStore.byId);
  const nextBySymbol = new Map(assetStore.bySymbol);
  for (const asset of byId) nextById.set(asset.id, asset);
  for (const [symbol, asset] of bySymbol) {
    nextBySymbol.set(symbol, asset);
    if (asset) nextById.set(asset.id, asset);
  }
  assetStore = { byId: nextById, bySymbol: nextBySymbol };
  for (const listener of [...assetListeners]) listener();
}

/** Remember assets learned elsewhere (a search result), so a screen opened from it has them at once. */
export function rememberAssets(assets: readonly PythAsset[]): void {
  if (assets.some((asset) => !assetStore.byId.has(asset.id))) commitAssets(assets);
}

function loadByIds(ids: number[]): Promise<void> {
  const missing = ids.filter((id) => !assetStore.byId.has(id)).sort((a, b) => a - b);
  if (missing.length === 0) return Promise.resolve();
  const key = `ids:${missing.join(",")}`;
  const existing = assetRequests.get(key);
  if (existing) return existing;
  const work = api
    .get<{ assets?: PythAsset[] }>(`/api/market/assets?ids=${missing.join(",")}`, { auth: false })
    .then((body) => commitAssets(body.assets ?? []))
    .catch(() => {
      /* Left unresolved; the next mount asks again. */
    })
    .finally(() => assetRequests.delete(key));
  assetRequests.set(key, work);
  return work;
}

function loadBySymbols(symbols: string[]): Promise<void> {
  const missing = symbols.filter((symbol) => !assetStore.bySymbol.has(symbol)).sort();
  if (missing.length === 0) return Promise.resolve();
  const key = `sym:${missing.join(",")}`;
  const existing = assetRequests.get(key);
  if (existing) return existing;
  const work = api
    .get<{ assets?: PythAsset[] }>(`/api/market/assets?symbols=${encodeURIComponent(missing.join(","))}`, { auth: false })
    .then((body) => {
      const found = new Map((body.assets ?? []).map((asset) => [asset.symbol.toUpperCase(), asset]));
      /* Misses are recorded too, so an unlisted ticker is asked for once. */
      commitAssets([], missing.map((symbol) => [symbol, found.get(symbol) ?? null] as const));
    })
    .catch(() => {
      /* A failed read is not "no such asset": left unrecorded, asked again. */
    })
    .finally(() => assetRequests.delete(key));
  assetRequests.set(key, work);
  return work;
}

function subscribeAssets(listener: () => void): () => void {
  assetListeners.add(listener);
  return () => assetListeners.delete(listener);
}

export function useAssets(ids: readonly number[]): { assets: PythAsset[]; byId: Map<number, PythAsset>; loading: boolean } {
  const key = useMemo(() => [...new Set(ids)].sort((a, b) => a - b).join(","), [ids]);
  const store = useSyncExternalStore(subscribeAssets, () => assetStore);
  useEffect(() => {
    if (key !== "") void loadByIds(key.split(",").map(Number));
  }, [key]);
  return useMemo(() => {
    const list = key === "" ? [] : key.split(",").map(Number);
    const assets = list.map((id) => store.byId.get(id)).filter((asset): asset is PythAsset => asset !== undefined);
    return { assets, byId: new Map(assets.map((asset) => [asset.id, asset])), loading: assets.length < list.length };
  }, [key, store]);
}

/** Tickers to assets; `resolved` says which tickers have an answer yet. */
export function useAssetsBySymbols(symbols: readonly string[]): { bySymbol: Map<string, PythAsset>; resolved: ReadonlySet<string> } {
  const key = useMemo(() => [...new Set(symbols.map((symbol) => symbol.toUpperCase()))].sort().join(","), [symbols]);
  const store = useSyncExternalStore(subscribeAssets, () => assetStore);
  useEffect(() => {
    if (key !== "") void loadBySymbols(key.split(","));
  }, [key]);
  return useMemo(() => {
    const bySymbol = new Map<string, PythAsset>();
    const resolved = new Set<string>();
    if (key !== "") {
      for (const symbol of key.split(",")) {
        if (!store.bySymbol.has(symbol)) continue;
        resolved.add(symbol);
        const asset = store.bySymbol.get(symbol);
        if (asset) bySymbol.set(symbol, asset);
      }
    }
    return { bySymbol, resolved };
  }, [key, store]);
}

/** Logos for markets named only by ticker: the catalogue's, then Hyperliquid's coin icon. */
export function useTickerLogos(symbols: readonly string[]): (symbol: string) => TickerLogo {
  const bases = useMemo(() => [...new Set(symbols.map(baseTicker))], [symbols]);
  const { bySymbol } = useAssetsBySymbols(bases);
  return useCallback(
    (symbol: string) => {
      const asset = bySymbol.get(baseTicker(symbol));
      /* Crypto only: the same ticker can name a stock. */
      return { logo: asset && asset.assetType === "crypto" ? asset.logo : null, fallbackLogo: hyperliquidIcon(symbol) };
    },
    [bySymbol],
  );
}

/* ---- search ---- */

const SEARCH_DEBOUNCE_MS = 180;
let searchCache: ReadonlyMap<string, PythAsset[]> = new Map();
const searchListeners = new Set<() => void>();

function subscribeSearch(listener: () => void): () => void {
  searchListeners.add(listener);
  return () => searchListeners.delete(listener);
}

export type SearchStatus = "idle" | "loading" | "ready" | "error";

export function useAssetSearch(
  query: string,
  assetType: PythAssetType | null,
  enabled = true,
): { assets: PythAsset[]; status: SearchStatus; error: string | null } {
  const key = `${assetType ?? ""}:${query.trim().toLowerCase()}`;
  const results = useSyncExternalStore(subscribeSearch, () => searchCache);
  const cached = results.get(key);
  const [failure, setFailure] = useState<{ key: string; error: string } | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (!enabled || searchCache.has(key)) return;
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim(), limit: "60" });
      if (assetType) params.set("type", assetType);
      api
        .get<{ assets?: PythAsset[] }>(`/api/market/assets?${params.toString()}`, { auth: false })
        .then((body) => {
          if (ticket !== latest.current) return;
          const next = new Map(searchCache);
          next.set(key, body.assets ?? []);
          searchCache = next;
          rememberAssets(body.assets ?? []);
          for (const listener of [...searchListeners]) listener();
        })
        .catch((error: unknown) => {
          if (ticket === latest.current) setFailure({ key, error: messageOf(error, "Asset search failed") });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, query, assetType, enabled]);

  const status: SearchStatus = cached ? "ready" : failure?.key === key ? "error" : enabled ? "loading" : "idle";
  return { assets: cached ?? [], status, error: status === "error" ? (failure?.error ?? null) : null };
}

/* ---- pivot levels ---- */

const LEVELS_TTL_MS = 15 * 60_000;
const levelsCache = new Map<string, { at: number; value: Promise<LevelsResponse> }>();

function loadLevels(symbol: string): Promise<LevelsResponse> {
  const hit = levelsCache.get(symbol);
  if (hit !== undefined && Date.now() - hit.at < LEVELS_TTL_MS) return hit.value;
  const value = api
    .get<LevelsResponse>(`/api/market/levels?symbol=${encodeURIComponent(symbol)}`, { auth: false })
    .catch((): LevelsResponse => ({ symbol, levels: null, source: "", error: "Levels could not be read." }));
  levelsCache.set(symbol, { at: Date.now(), value });
  void value.then((result) => {
    if (result.levels === null) levelsCache.delete(symbol);
  });
  return value;
}

export function useLevels(symbol: string | null): { data: LevelsResponse | null; loading: boolean } {
  const [state, setState] = useState<{ for: string | null; data: LevelsResponse | null }>({ for: null, data: null });
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    void loadLevels(symbol).then((data) => {
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
