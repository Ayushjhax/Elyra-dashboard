import { useMemo } from "react";
import type { AlertKind, PredictionAlertRule } from "@/lib/prediction/alertTypes";
import type {
  FoundAccount,
  PredictionAccountResponse,
  PredictionAlertsResponse,
  PredictionLinkResponse,
  PredictionWatchlistResponse,
  WatchedMarket,
} from "@/lib/prediction/api";
import { api, ApiError } from "~/lib/api";
import { createAccountStore, SKIP, type AccountFeed } from "~/lib/stores/createAccountStore";

/* ---------------------------------------------------------------------------
   The account's prediction-market state, on the shared account store
   helper: the linked Polymarket address, the alert rules, and the market
   watchlist. Each resets with the account and stops polling in the
   background, like every other account store.

   Writes go to the server and then read back, so what is shown is what was
   stored. A read that started before a write steps aside rather than
   briefly showing the list as it was.
--------------------------------------------------------------------------- */

let writes = 0;

function guarded<T>(load: (signal: AbortSignal) => Promise<T>) {
  return async (signal: AbortSignal): Promise<T | typeof SKIP> => {
    const before = writes;
    const data = await load(signal);
    return before === writes ? data : SKIP;
  };
}

async function write<T>(run: () => Promise<T>, after: () => Promise<void>, fallback: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  writes += 1;
  try {
    const data = await run();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : fallback };
  } finally {
    writes += 1;
    await after();
  }
}

/* ---- the linked account ---- */

const accountStore = createAccountStore<PredictionAccountResponse>({
  pollMs: 10 * 60_000,
  retryMs: 2 * 60_000,
  load: guarded((signal) => api.get<PredictionAccountResponse>("/api/prediction/account", { signal })),
});

export function usePredictionAccount(): AccountFeed<PredictionAccountResponse> {
  return accountStore.useFeed();
}

/** Finds the account from the signed-in wallet. Links only when exactly one is found. */
export function detectAccount() {
  return write(
    () => api.post<PredictionLinkResponse>("/api/prediction/account", { detect: true }, { timeoutMs: 45_000 }),
    accountStore.refresh,
    "Could not search for your account. Try again.",
  );
}

/** What an address holds, read live. Nothing is stored. */
export async function previewAccount(address: string): Promise<{ ok: true; found: FoundAccount } | { ok: false; error: string }> {
  try {
    const body = await api.post<PredictionLinkResponse>("/api/prediction/account", { address, preview: true }, { timeoutMs: 45_000 });
    return body.found ? { ok: true, found: body.found } : { ok: false, error: "Could not check that address. Try again." };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : "Could not check that address. Try again." };
  }
}

export function linkAccount(address: string) {
  return write(
    () => api.post<PredictionLinkResponse>("/api/prediction/account", { address }, { timeoutMs: 45_000 }),
    accountStore.refresh,
    "Could not link that account. Nothing was changed.",
  );
}

export function unlinkAccount() {
  return write(() => api.delete("/api/prediction/account"), accountStore.refresh, "Could not unlink. The account is still linked.");
}

/* ---- alert rules ---- */

const alertsStore = createAccountStore<PredictionAlertRule[]>({
  pollMs: 2 * 60_000,
  retryMs: 2 * 60_000,
  load: guarded(async (signal) => (await api.get<PredictionAlertsResponse>("/api/prediction/alerts", { signal })).alerts),
});

export function usePredictionAlerts(): AccountFeed<PredictionAlertRule[]> {
  return alertsStore.useFeed();
}

/** This market's rules, from the shared list. */
export function useMarketAlerts(marketId: string): { feed: AccountFeed<PredictionAlertRule[]>; rules: PredictionAlertRule[] } {
  const feed = alertsStore.useFeed();
  const rules = useMemo(() => (feed.data ?? []).filter((rule) => rule.marketId === marketId), [feed.data, marketId]);
  return { feed, rules };
}

export function createAlert(input: { market: string; outcome: string | null; kind: AlertKind; threshold: number | null }) {
  return write(
    () =>
      api.post("/api/prediction/alerts", {
        market: input.market,
        kind: input.kind,
        ...(input.outcome ? { outcome: input.outcome } : {}),
        ...(input.threshold === null ? {} : { threshold: input.threshold }),
      }),
    alertsStore.refresh,
    "The alert could not be saved.",
  );
}

export function deleteAlert(id: string) {
  return write(() => api.delete(`/api/prediction/alerts?id=${encodeURIComponent(id)}`), alertsStore.refresh, "The alert could not be removed.");
}

/* ---- the market watchlist ---- */

const watchStore = createAccountStore<WatchedMarket[]>({
  pollMs: 5 * 60_000,
  retryMs: 2 * 60_000,
  load: guarded(async (signal) => (await api.get<PredictionWatchlistResponse>("/api/prediction/watchlist", { signal })).markets),
});

export function useWatchedMarkets(): AccountFeed<WatchedMarket[]> {
  return watchStore.useFeed();
}

export function watch(marketId: string) {
  return write(() => api.post("/api/prediction/watchlist", { market: marketId }), watchStore.refresh, "That market could not be added.");
}

export function unwatch(marketId: string) {
  return write(() => api.delete(`/api/prediction/watchlist?market=${encodeURIComponent(marketId)}`), watchStore.refresh, "That market could not be removed.");
}
