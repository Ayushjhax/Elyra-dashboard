import { useCallback, useMemo, useSyncExternalStore } from "react";
import { api, ApiError } from "~/lib/api";
import { createAccountStore, SKIP, type AccountFeed } from "~/lib/stores/createAccountStore";

/* ---------------------------------------------------------------------------
   The account's watchlist, by symbol, in its order — /api/watchlist. The
   same list the website's chat surface reads, so a market added on one
   surface is on the other.

   Every change is shown at once and then replaced by the server's answer,
   which is the whole list as it now stands. A change the server refused is
   put back, with the reason. A read that overlapped a change steps aside,
   as the alerts store's does.
--------------------------------------------------------------------------- */

let writes = 0;
let writeError: string | null = null;
const errorListeners = new Set<() => void>();

function setWriteError(next: string | null): void {
  writeError = next;
  for (const listener of [...errorListeners]) listener();
}

const watchlistStore = createAccountStore<string[]>({
  pollMs: 120_000,
  retryMs: 120_000,
  onReset: () => setWriteError(null),
  async load(signal) {
    const writesAtStart = writes;
    const body = await api.get<{ symbols: string[] }>("/api/watchlist", { signal });
    if (writesAtStart !== writes) return SKIP;
    return body.symbols;
  },
});

async function change(
  optimistic: (symbols: string[]) => string[],
  request: () => Promise<{ symbols: string[] }>,
  fallback: string,
): Promise<string | null> {
  setWriteError(null);
  const before = watchlistStore.snapshot().data;
  const guard = watchlistStore.update(optimistic);
  writes += 1;
  try {
    const { symbols } = await request();
    if (guard.current()) watchlistStore.replace(symbols);
    return null;
  } catch (error) {
    const message = error instanceof ApiError ? error.message : fallback;
    if (guard.current()) {
      if (before !== null) watchlistStore.update(() => before);
      setWriteError(message);
    }
    return message;
  } finally {
    writes += 1;
  }
}

export interface WatchlistFeed extends Omit<AccountFeed<string[]>, "data"> {
  symbols: string[];
  writeError: string | null;
  add: (symbol: string) => Promise<string | null>;
  remove: (symbol: string) => Promise<string | null>;
  /** The whole list in its new order. */
  reorder: (symbols: string[]) => Promise<string | null>;
  has: (symbol: string) => boolean;
}

function subscribeError(listener: () => void): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

export function useWatchlist(): WatchlistFeed {
  const feed = watchlistStore.useFeed();
  const error = useSyncExternalStore(subscribeError, () => writeError);
  const symbols = useMemo(() => feed.data ?? [], [feed.data]);

  const add = useCallback(
    (symbol: string) =>
      change(
        (list) => (list.includes(symbol) ? list : [...list, symbol]),
        () => api.post<{ symbols: string[] }>("/api/watchlist", { symbol }),
        "That market could not be added.",
      ),
    [],
  );
  const remove = useCallback(
    (symbol: string) =>
      change(
        (list) => list.filter((entry) => entry !== symbol),
        () => api.delete<{ symbols: string[] }>("/api/watchlist", { symbol }),
        "That market could not be removed.",
      ),
    [],
  );
  const reorder = useCallback(
    (order: string[]) =>
      change(
        () => order,
        () => api.patch<{ symbols: string[] }>("/api/watchlist", { symbols: order }),
        "The new order could not be saved.",
      ),
    [],
  );
  const has = useCallback((symbol: string) => symbols.includes(symbol.toUpperCase()), [symbols]);

  return useMemo(
    () => ({ ...feed, symbols, writeError: error, add, remove, reorder, has }),
    [feed, symbols, error, add, remove, reorder, has],
  );
}
