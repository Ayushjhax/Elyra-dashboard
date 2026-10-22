"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { accountKey } from "@/lib/account";
import { useSecond } from "@/lib/useClock";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import type { ActionsResponse, OpenAction } from "@/lib/actions/types";

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

/**
 * Bumped by every reset. A read that started under an earlier generation
 * belongs to an account that is no longer signed in here, and is dropped
 * when it lands rather than written over the new one.
 */
let generation = 0;

/** Whose data the store holds: the account it was read for. */
let owner: string | null = null;

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

/**
 * Swaps a wallet signed whose confirmation has not been recorded yet, by
 * action id. The swap happened, so the action stays off the open list —
 * putting it back would invite doing it twice — and recording it is retried
 * on every poll until the server takes it or says the signature proves
 * nothing.
 */
const unrecorded = new Map<string, string>();

/** Expired on this clock too: a row the last poll returned can lapse before the next. */
function live(actions: OpenAction[]): OpenAction[] {
  const now = Date.now();
  return actions.filter((entry) => Date.parse(entry.expiresAt) > now && !unrecorded.has(entry.id));
}

type Recorded = "recorded" | "rejected" | "retry";

/** One attempt at recording a signed swap, and what to do next. */
async function record(id: string, signature: string): Promise<{ result: Recorded; error: string | null }> {
  if (fetcher === null) return { result: "retry", error: null };
  try {
    const response = await fetcher("/api/actions", {
      method: "POST",
      body: JSON.stringify({ id, op: "confirm", signature }),
    });
    /* 404: no longer open — recorded by an earlier attempt, or expired. */
    if (response.ok || response.status === 404) return { result: "recorded", error: null };
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.status === 422) return { result: "rejected", error: body.error ?? "That signature does not prove the swap." };
    return { result: "retry", error: body.error ?? null };
  } catch {
    return { result: "retry", error: null };
  }
}

async function retryUnrecorded(): Promise<void> {
  for (const [id, signature] of [...unrecorded]) {
    const started = generation;
    const { result } = await record(id, signature);
    if (started !== generation) return;
    if (result !== "retry") unrecorded.delete(id);
  }
}

async function poll(): Promise<void> {
  if (inFlight || !enabled || fetcher === null) return;
  inFlight = true;
  let delay = POLL_MS;
  const started = generation;
  try {
    const response = await fetcher("/api/actions", { cache: "no-store" });
    const body = (await response.json()) as ActionsResponse;
    if (started !== generation) return;
    if (response.ok) {
      emit({ actions: live(body.actions), error: null, loading: false });
      if (unrecorded.size > 0) void retryUnrecorded();
    } else {
      delay = RETRY_MS;
      emit({ error: body.error ?? "Actions could not be read.", loading: false });
    }
  } catch (error: unknown) {
    if (started !== generation) return;
    delay = RETRY_MS;
    emit({ error: error instanceof Error ? error.message : "Network error", loading: false });
  } finally {
    inFlight = false;
    if (timer !== null) clearTimeout(timer);
    if (subscribers > 0 && enabled) timer = setTimeout(() => void poll(), started !== generation ? 0 : delay);
    else timer = null;
  }
}

function ensurePolling(): void {
  if (timer === null && !inFlight && enabled && subscribers > 0) void poll();
}

function reset(): void {
  generation += 1;
  unrecorded.clear();
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  state = INITIAL;
  for (const listener of listeners) listener();
}

async function dismissAction(id: string): Promise<boolean> {
  if (fetcher === null) return false;
  const before = state.actions;
  emit({ actions: before.filter((entry) => entry.id !== id) });
  try {
    const response = await fetcher("/api/actions", {
      method: "POST",
      body: JSON.stringify({ id, op: "dismiss" }),
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

/**
 * Records a swap the person's wallet signed. Whatever happens to the write,
 * the action does not come back as open: the swap has already been done.
 */
async function confirmAction(id: string, signature: string): Promise<boolean> {
  unrecorded.set(id, signature);
  emit({ actions: state.actions.filter((entry) => entry.id !== id) });
  const started = generation;
  const { result, error } = await record(id, signature);
  if (started !== generation) return false;
  if (result === "recorded") {
    unrecorded.delete(id);
    return true;
  }
  if (result === "rejected") {
    /* The signature proves nothing, so the action is genuinely still open. */
    unrecorded.delete(id);
    emit({ error });
    void poll();
    return false;
  }
  emit({
    error: "Your swap went through, but Elyra couldn't record it against this action yet. It will keep trying.",
  });
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
  const account = accountKey(auth);

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
    ensurePolling();
  }, [signedIn, account]);

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

  const dismiss = useCallback((id: string) => dismissAction(id), []);
  const confirm = useCallback((id: string, signature: string) => confirmAction(id, signature), []);

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
