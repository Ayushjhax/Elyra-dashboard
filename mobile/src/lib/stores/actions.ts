import { useCallback, useMemo } from "react";
import type { ActionsResponse, OpenAction } from "@/lib/actions/types";
import { api, ApiError } from "~/lib/api";
import { createAccountStore, type AccountFeed } from "~/lib/stores/createAccountStore";

/* ---------------------------------------------------------------------------
   Actions awaiting review — the app's useOpenActions
   (lib/actions/useOpenActions.ts on the website), read once for every
   screen that shows a review card.

   A prepared action lives for ten minutes, so a thirty-second poll finds one
   well inside its window. Dismissing or confirming removes it at once and
   tells the server; a refused dismiss puts it back.

   A swap the wallet SIGNED whose confirmation the server has not recorded
   yet never comes back as open — the swap happened, and showing it again
   would invite doing it twice. Recording it is retried on every poll until
   the server takes it, or says the signature proves nothing (422), which is
   the one case where the action is genuinely still open.
--------------------------------------------------------------------------- */

/** Signed swaps not yet recorded, by action id. Cleared with the account. */
const unrecorded = new Map<string, string>();

/* A write's own error, shown over the feed's until the next good read. */
let writeError: string | null = null;

function live(actions: OpenAction[], now = Date.now()): OpenAction[] {
  return actions.filter((entry) => Date.parse(entry.expiresAt) > now && !unrecorded.has(entry.id));
}

type Recorded = "recorded" | "rejected" | "retry";

/** One attempt at recording a signed swap, and what to do next. */
async function record(id: string, signature: string): Promise<{ result: Recorded; error: string | null }> {
  try {
    await api.post("/api/actions", { id, op: "confirm", signature });
    return { result: "recorded", error: null };
  } catch (error) {
    if (!(error instanceof ApiError)) return { result: "retry", error: null };
    /* 404: no longer open — recorded by an earlier attempt, or expired. */
    if (error.status === 404) return { result: "recorded", error: null };
    if (error.status === 422) return { result: "rejected", error: error.message };
    return { result: "retry", error: error.message };
  }
}

const actionsStore = createAccountStore<OpenAction[]>({
  pollMs: 30_000,
  retryMs: 60_000,
  onReset: () => {
    unrecorded.clear();
    writeError = null;
  },
  async load(signal) {
    const body = await api.get<ActionsResponse>("/api/actions", { signal });
    return live(body.actions);
  },
  afterLoad: () => {
    writeError = null;
    if (unrecorded.size > 0) void retryUnrecorded();
  },
});

async function retryUnrecorded(): Promise<void> {
  for (const [id, signature] of [...unrecorded]) {
    const guard = actionsStore.update((actions) => actions);
    const { result } = await record(id, signature);
    if (!guard.current()) return;
    if (result !== "retry") unrecorded.delete(id);
  }
}

async function dismissAction(id: string): Promise<boolean> {
  const before = actionsStore.snapshot().data ?? [];
  const guard = actionsStore.update((actions) => actions.filter((entry) => entry.id !== id));
  try {
    await api.post("/api/actions", { id, op: "dismiss" });
    return true;
  } catch (error) {
    if (!guard.current()) return false;
    /* 404: it expired or was settled elsewhere — gone either way. */
    if (error instanceof ApiError && error.status === 404) return false;
    writeError = "That could not be saved. Try again.";
    actionsStore.update(() => before);
    return false;
  }
}

/**
 * Records a swap the person's wallet signed. Whatever happens to the write,
 * the action does not come back as open: the swap has already been done.
 */
async function confirmAction(id: string, signature: string): Promise<boolean> {
  unrecorded.set(id, signature);
  const guard = actionsStore.update((actions) => actions.filter((entry) => entry.id !== id));
  const { result, error } = await record(id, signature);
  if (!guard.current()) return false;
  if (result === "recorded") {
    unrecorded.delete(id);
    return true;
  }
  if (result === "rejected") {
    /* The signature proves nothing, so the action is genuinely still open. */
    unrecorded.delete(id);
    writeError = error;
    void actionsStore.refresh();
    return false;
  }
  writeError = "Your swap went through, but Elyra couldn't record it against this action yet. It will keep trying.";
  /* A fresh array, so every card hears the message. */
  actionsStore.update((actions) => [...actions]);
  return false;
}

export interface OpenActionsFeed extends Omit<AccountFeed<OpenAction[]>, "data"> {
  actions: OpenAction[];
  dismiss: (id: string) => Promise<boolean>;
  /** Records a swap the person's wallet signed. Never called without a signature. */
  confirm: (id: string, signature: string) => Promise<boolean>;
}

export function useOpenActions(): OpenActionsFeed {
  const feed = actionsStore.useFeed();
  const dismiss = useCallback((id: string) => dismissAction(id), []);
  const confirm = useCallback((id: string, signature: string) => confirmAction(id, signature), []);
  return useMemo(
    () => ({
      ...feed,
      actions: feed.data ?? [],
      error: writeError ?? feed.error,
      dismiss,
      confirm,
    }),
    [feed, dismiss, confirm],
  );
}

/** For tests. */
/** Reads the open actions now — an answer has just prepared one. */
export function refreshActions(): Promise<void> {
  return actionsStore.refresh();
}

export const __actionsStore = { store: actionsStore, unrecorded };
