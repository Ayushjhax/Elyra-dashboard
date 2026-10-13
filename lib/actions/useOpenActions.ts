"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { useSecond } from "@/lib/useClock";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import type { ActionsResponse, OpenAction } from "@/app/api/actions/route";

/* ---------------------------------------------------------------------------
   Actions awaiting review, read once for the whole workspace.

   The overview's badge and the agent's cards both show them, so this is a
   reference-counted external store like `usePortfolio`: one request however
   many surfaces read it, and nothing polls when neither is mounted.

   An action prepared in Telegram lives for ten minutes, so a thirty-second
   poll finds one well inside its window. Dismissing or confirming removes it
   here at once and tells the server; a refused write puts it back.
--------------------------------------------------------------------------- */

const POLL_MS = 30_000;
const RETRY_MS = 60_000;

interface StoreState {
  actions: OpenAction[];
  error: string | null;
  loading: boolean;
}

const INITIAL: StoreState = { actions: [], error: null, loading: true };

let state: StoreState = INITIAL;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let subscribers = 0;
let inFlight = false;
let enabled = false;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher | null = null;

function emit(next: Partial<StoreState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  subscribers += 1;
  ensurePolling();
  return () => {
    listeners.delete(listener);
    subscribers -= 1;
    if (subscribers <= 0 && timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

const getSnapshot = (): StoreState => state;
const getServerSnapshot = (): StoreState => INITIAL;

/** Expired on this clock too: a row the last poll returned can lapse before the next. */
function live(actions: OpenAction[]): OpenAction[] {
  const now = Date.now();
  return actions.filter((entry) => Date.parse(entry.expiresAt) > now);
}

async function poll(): Promise<void> {
  if (inFlight || !enabled || fetcher === null) return;
  inFlight = true;
  let delay = POLL_MS;
  try {
    const response = await fetcher("/api/actions", { cache: "no-store" });
    const body = (await response.json()) as ActionsResponse;
    if (response.ok) {
      emit({ actions: live(body.actions), error: null, loading: false });
    } else {
      delay = RETRY_MS;
      emit({ error: body.error ?? "Actions could not be read.", loading: false });
    }
  } catch (error: unknown) {
    delay = RETRY_MS;
    emit({ error: error instanceof Error ? error.message : "Network error", loading: false });
  } finally {
    inFlight = false;
    if (subscribers > 0 && enabled) timer = setTimeout(() => void poll(), delay);
    else timer = null;
  }
}

function ensurePolling(): void {
  if (timer === null && !inFlight && enabled && subscribers > 0) void poll();
}

function reset(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  state = INITIAL;
  for (const listener of listeners) listener();
}

async function settle(id: string, body: Record<string, unknown>): Promise<boolean> {
  if (fetcher === null) return false;
  const before = state.actions;
  emit({ actions: before.filter((entry) => entry.id !== id) });
  try {
    const response = await fetcher("/api/actions", {
      method: "POST",
      body: JSON.stringify({ id, ...body }),
    });
    if (response.ok) return true;
    /* 404: it expired or was settled elsewhere — gone either way, so it stays gone. */
    if (response.status === 404) return false;
  } catch {
    /* Falls through to restore. */
  }
  emit({ actions: before, error: "That could not be saved. Try again." });
  return false;
}

export interface OpenActionsFeed extends StoreState {
  signedIn: boolean;
  dismiss: (id: string) => Promise<boolean>;
  /** Records a swap the person's wallet signed. Never called without a signature. */
  confirm: (id: string, signature: string) => Promise<boolean>;
}

export function useOpenActions(): OpenActionsFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const signedIn = auth.ready && auth.authenticated;

  useEffect(() => {
    fetcher = authedFetch;
  }, [authedFetch]);

  useEffect(() => {
    const was = enabled;
    enabled = signedIn;
    if (!signedIn) {
      if (was) reset();
      return;
    }
    ensurePolling();
  }, [signedIn]);

  /* Coming back to the tab is exactly when a Telegram tap is waiting. */
  useEffect(() => {
    if (!signedIn) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") void poll();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [signedIn]);

  const dismiss = useCallback((id: string) => settle(id, { op: "dismiss" }), []);
  const confirm = useCallback(
    (id: string, signature: string) => settle(id, { op: "confirm", signature }),
    [],
  );

  return useMemo(
    () => ({
      ...store,
      actions: signedIn ? store.actions : [],
      loading: !auth.ready || (signedIn && store.loading),
      signedIn,
      dismiss,
      confirm,
    }),
    [store, auth.ready, signedIn, dismiss, confirm],
  );
}

/** How many are waiting, for the overview's badge. Lapses with the clock. */
export function useOpenActionCount(): number {
  const feed = useOpenActions();
  const now = useSecond();
  return now === null
    ? feed.actions.length
    : feed.actions.filter((entry) => Date.parse(entry.expiresAt) > now).length;
}

/**
 * The swap a prepared action describes, for the dialog's prefill.
 *
 * Structured `params` where the action carries them; otherwise read back from
 * the fields a person was shown, which every stored swap has had.
 */
export function swapPrefill(
  action: OpenAction["action"],
): { from: string; to: string; amount: string } | null {
  if (action.kind !== "swap" || action.readiness !== "ready") return null;
  const field = (label: string) => action.fields.find((entry) => entry.label === label)?.value;

  const from = action.params?.symbol ?? field("Asset");
  const to = action.params?.toSymbol ?? field("To");
  const quantity =
    action.params?.quantity ??
    Number.parseFloat((field("Amount") ?? "").replace(/,/g, "").split(" ")[0] ?? "");

  if (!from || !to || !Number.isFinite(quantity) || quantity <= 0) return null;
  /* Plain decimal, never exponent notation — the dialog's input is text. */
  const amount = quantity.toFixed(9).replace(/\.?0+$/, "");
  return { from, to, amount };
}
