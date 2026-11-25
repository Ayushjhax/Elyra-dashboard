"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { accountKey } from "@/lib/account";
import type { PaperAccountView, PaperResponse } from "@/lib/paper/types";
import { useAuthedFetch } from "@/lib/useAuthedFetch";

/* ---------------------------------------------------------------------------
   The paper account (/api/paper), and with it which account orders go to —
   Live or Paper — for every surface at once: the header's switch, the
   banner, the chart's ticket, the Automation forms. One reference-counted
   store, like `useFunds`: it resets when `accountKey` changes and drops a
   read that started under the previous account, so one person's paper
   balance never shows under the next, and nobody inherits Paper mode.

   Every thirty seconds while Paper is on — the banner shows a balance that
   moves with the market — and every three minutes otherwise. Nothing polls
   when nothing is mounted or nobody is signed in.
--------------------------------------------------------------------------- */

const ACTIVE_MS = 30_000;
const IDLE_MS = 180_000;
const RETRY_MS = 60_000;

interface State {
  data: PaperResponse | null;
  error: string | null;
  loading: boolean;
}

const INITIAL: State = { data: null, error: null, loading: true };
let state: State = INITIAL;
const listeners = new Set<() => void>();
let subscribers = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;
let enabled = false;
let generation = 0;
let owner: string | null = null;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher | null = null;

function emit(next: Partial<State>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function poll(): Promise<void> {
  if (inFlight !== null) return inFlight;
  if (!enabled || fetcher === null) return Promise.resolve();
  const read = fetcher;
  const started = generation;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  inFlight = (async () => {
    let delay = IDLE_MS;
    try {
      const response = await read("/api/paper", { cache: "no-store" });
      const body = (await response.json()) as PaperResponse & { error?: string | null };
      if (started !== generation) return;
      if (response.ok) {
        emit({ data: body, error: null, loading: false });
        delay = body.account?.active === true ? ACTIVE_MS : IDLE_MS;
      } else {
        delay = RETRY_MS;
        emit({ error: typeof body.error === "string" ? body.error : `The paper account is unavailable (${response.status})`, loading: false });
      }
    } catch {
      if (started !== generation) return;
      delay = RETRY_MS;
      emit({ error: "The paper account could not be read.", loading: false });
    } finally {
      inFlight = null;
      if (subscribers > 0 && enabled) timer = setTimeout(() => void poll(), delay);
    }
  })();
  return inFlight;
}

function reset(): void {
  generation += 1;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  inFlight = null;
  emit(INITIAL);
}

/** Reads the account again now — after an order, so the balance and the margin keep up. */
export function refreshPaper(): void {
  void poll();
}

export type TradingMode = "paper" | "live";

export interface PaperFeed extends State {
  signedIn: boolean;
  account: PaperAccountView | null;
  /** The account orders go to now. Live until a paper account is switched on. */
  mode: TradingMode;
  /** Each returns null on success, otherwise the reason in words. */
  claim: () => Promise<string | null>;
  setMode: (mode: TradingMode) => Promise<string | null>;
  resetAccount: () => Promise<string | null>;
}

export function usePaper(): PaperFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const signedIn = auth.ready && auth.authenticated;
  const account = accountKey(auth);

  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    subscribers += 1;
    if (timer === null && inFlight === null && enabled) void poll();
    return () => {
      listeners.delete(listener);
      subscribers -= 1;
      if (subscribers <= 0 && timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, []);
  const store = useSyncExternalStore(subscribe, () => state, () => INITIAL);

  useEffect(() => {
    fetcher = authedFetch;
  }, [authedFetch]);

  useEffect(() => {
    const was = enabled;
    enabled = signedIn;
    if (!signedIn) {
      if (was) reset();
      owner = null;
      return;
    }
    if (owner !== null && owner !== account) reset();
    owner = account;
    if (timer === null && inFlight === null) void poll();
  }, [signedIn, account]);

  const send = useCallback(async (url: string, method: "POST" | "PATCH", body?: unknown): Promise<string | null> => {
    const write = fetcher;
    if (write === null) return "Sign in first.";
    try {
      const response = await write(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      const parsed = (await response.json().catch(() => ({}))) as PaperResponse & { error?: string | null };
      if (!response.ok) return typeof parsed.error === "string" ? parsed.error : "That could not be saved.";
      emit({ data: parsed, error: null, loading: false });
      return null;
    } catch {
      return "The network did not answer.";
    }
  }, []);

  const claim = useCallback(() => send("/api/paper/claim", "POST"), [send]);
  const setMode = useCallback((mode: TradingMode) => send("/api/paper", "PATCH", { active: mode === "paper" }), [send]);
  const resetAccount = useCallback(() => send("/api/paper/reset", "POST"), [send]);

  return useMemo(() => {
    const data = signedIn ? store.data : null;
    const paperAccount = data?.account ?? null;
    return {
      ...store,
      data,
      loading: !auth.ready || (signedIn && store.loading),
      signedIn,
      account: paperAccount,
      mode: paperAccount?.active === true ? "paper" : "live",
      claim,
      setMode,
      resetAccount,
    };
  }, [store, auth.ready, signedIn, claim, setMode, resetAccount]);
}
