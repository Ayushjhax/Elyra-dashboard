"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { accountKey } from "@/lib/account";
import type { NotificationItem } from "@/lib/activity/notifications";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { announce } from "@/lib/insider/desktop";
import { notifies, type InsiderFeed } from "@/lib/insider/analyze";
import { noticeText } from "@/lib/insider/words";
import { useAuthedFetch } from "@/lib/useAuthedFetch";

/* ---------------------------------------------------------------------------
   Insider watch, as one reference-counted store: the flagged wallets, the
   last scan and the person's watch (/api/insider). The Research tab reads it
   and the bell reads it, for one request between them.

   It polls only while something asks it to — the tab while it is open, the
   bell while the person has a watch on — every two minutes, and not while
   the page is hidden. It resets when `accountKey` changes and drops a read
   that started under the previous account, so one person's watch never
   shows under the next.
--------------------------------------------------------------------------- */

export type InsiderData = InsiderFeed & { signedIn: boolean };

interface StoreState {
  data: InsiderData | null;
  error: string | null;
  loading: boolean;
}

const POLL_MS = 120_000;
export const INSIDER_HREF = "/research?tab=insiders";

const INITIAL: StoreState = { data: null, error: null, loading: true };
let state: StoreState = INITIAL;
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let generation = 0;
let owner: string | null | undefined;
let fetcher: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;
let pollers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function emit(next: Partial<StoreState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function read(): Promise<void> {
  if (inFlight !== null) return inFlight;
  if (fetcher === null) return Promise.resolve();
  const started = generation;
  const send = fetcher;
  inFlight = (async () => {
    try {
      const response = await send("/api/insider", { cache: "no-store" });
      const body = (await response.json()) as InsiderData;
      if (started !== generation) return;
      emit(response.ok ? { data: body, error: null, loading: false } : { error: body.error ?? "Insider watch is unavailable.", loading: false });
    } catch {
      if (started === generation) emit({ error: "Insider watch could not be read.", loading: false });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function reset(): void {
  generation += 1;
  inFlight = null;
  state = INITIAL;
  for (const listener of listeners) listener();
}

function startPolling(): () => void {
  pollers += 1;
  if (timer === null) {
    timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void read();
    }, POLL_MS);
  }
  return () => {
    pollers -= 1;
    if (pollers === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export interface InsiderStore extends StoreState {
  signedIn: boolean;
  account: string | null;
  refresh: () => Promise<void>;
  /** Turns the watch on at `minUsd`, or off with null. `error` is null on success. */
  setWatch: (minUsd: number | null) => Promise<{ error: string | null }>;
}

/** `poll`: true to poll while mounted, "watching" to poll only while the person has a watch on. */
export function useInsider({ enabled = true, poll = false }: { enabled?: boolean; poll?: boolean | "watching" } = {}): InsiderStore {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const store = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => INITIAL,
  );
  const signedIn = auth.ready && auth.authenticated;
  const account = signedIn ? accountKey(auth) : null;

  useEffect(() => {
    fetcher = authedFetch;
  }, [authedFetch]);

  useEffect(() => {
    if (!auth.ready || !enabled) return;
    if (owner !== undefined && owner !== account) reset();
    owner = account;
    if (state.data === null) void read();
  }, [auth.ready, enabled, account]);

  const polling = poll === "watching" ? store.data?.watch != null : poll;
  useEffect(() => {
    if (!enabled || !polling) return;
    return startPolling();
  }, [enabled, polling]);

  const setWatch = useCallback(async (minUsd: number | null) => {
    const send = fetcher;
    if (send === null) return { error: "Sign in first." };
    try {
      const response = await send("/api/insider/watch", minUsd === null ? { method: "DELETE" } : { method: "PUT", body: JSON.stringify({ minUsd }) });
      const body = response.status === 204 ? {} : ((await response.json().catch(() => ({}))) as { error?: string });
      if (inFlight !== null) await inFlight;
      await read();
      return { error: response.ok ? null : (body.error ?? "The watch could not be saved.") };
    } catch {
      return { error: "The network did not answer." };
    }
  }, []);

  return useMemo(
    () => ({ ...store, loading: !auth.ready || store.loading, signedIn, account, refresh: read, setWatch }),
    [store, auth.ready, signedIn, account, setWatch],
  );
}

/**
 * The bell's insider notifications: the wallets flagged since the person's
 * watch was set, at or above its size, found within a day of their first
 * trade. Website only. A new one also raises a desktop notice when the
 * person has allowed that in this browser.
 */
export function useInsiderNotifications(): NotificationItem[] {
  const t = useT();
  const auth = useElyraAuth();
  const signedIn = auth.ready && auth.authenticated;
  const feed = useInsider({ enabled: signedIn, poll: "watching" });
  const watch = feed.data?.watch ?? null;
  const wallets = feed.data?.wallets;

  const items = useMemo<NotificationItem[]>(() => {
    if (!signedIn || watch === null || wallets === undefined) return [];
    return wallets
      .filter((wallet) => notifies(wallet, watch))
      .map((wallet) => ({
        id: `insider:${wallet.address}`,
        category: "insider" as const,
        title: msg("Fresh wallet, big first trade"),
        description: noticeText(wallet, t).body,
        at: wallet.detectedAt,
        target: { kind: "link" as const, href: `${INSIDER_HREF}&wallet=${wallet.address}`, external: false },
      }));
  }, [signedIn, watch, wallets, t]);

  useEffect(() => {
    if (feed.data === null) return;
    announce(feed.account, items.map((item) => ({ id: item.id, title: t("Fresh wallet, big first trade"), body: item.description, href: item.target?.kind === "link" ? item.target.href : INSIDER_HREF })));
  }, [feed.data, feed.account, items, t]);

  return items;
}
