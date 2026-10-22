import { useCallback, useMemo, useSyncExternalStore } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { ApiError } from "~/lib/api";
import { currentAccount, onAccountChange } from "~/lib/session";

/* ---------------------------------------------------------------------------
   One reference-counted store per kind of account data — the pattern the
   website's usePortfolio and useWalletDashboard follow, made into a factory
   so every feature store in the app is built the same way.

   ONE READ, HOWEVER MANY SCREENS. Every component reading the portfolio
   subscribes to the same store: one request, one poll. Nothing polls when
   no screen is subscribed.

   ONE ACCOUNT AT A TIME. When the signed-in account changes (lib/session.ts)
   the store resets at once, and any read that started before the change is
   dropped when it lands — `generation` is bumped by every reset and checked
   by every read — then a read for the new account starts immediately.

   ONLY WHILE OPEN. Polling stops when the app goes to the background and
   resumes, with a fresh read, when it comes back.

   NEVER A GUESS. A failed read keeps the last good value on screen, labelled
   stale; it is never replaced by an empty or zero value. A failure with no
   earlier value is an error with the server's reason.
--------------------------------------------------------------------------- */

export interface AccountState<T> {
  data: T | null;
  /** The last read's failure, in words. Null after a good read. */
  error: string | null;
  /** The deployment is missing a dependency (503 `unconfigured`). */
  unconfigured: boolean;
  /** No answer yet for this account. */
  loading: boolean;
  /** `data` is an earlier good reading that survived a failed refresh. */
  stale: boolean;
  /** When the last good read landed. */
  fetchedAt: number | null;
  /** A read is in flight — the first, a poll, or a refetch. */
  refreshing: boolean;
}

export interface AccountFeed<T> extends AccountState<T> {
  signedIn: boolean;
  refetch: () => void;
}

export interface AccountStoreOptions<T> {
  /** Reads the data for the signed-in account. Throws an ApiError on failure. */
  load: (signal: AbortSignal) => Promise<T>;
  /** Between successful reads. */
  pollMs: number;
  /** After a failure — never shorter than pollMs. */
  retryMs?: number;
  /** After each good read, for work that rides on the poll (a retried write, say). */
  afterLoad?: (data: T) => void;
  /** When the account changes, for anything the store keeps beside its state. */
  onReset?: () => void;
}

export interface AccountStore<T> {
  /** Subscribe from a component. */
  useFeed: () => AccountFeed<T>;
  /** Read now, outside React (after a write, say). */
  refetch: () => Promise<void>;
  /** The current state, outside React. */
  snapshot: () => AccountState<T>;
  /**
   * Changes the held data locally — an optimistic dismiss, say — without a
   * read. Ignored before the first good read. Returns a guard that is false
   * once the account has changed, so a write that lands late never touches
   * the next account's data.
   */
  update: (change: (data: T) => T) => { current: () => boolean };
}

/** The app's state now. Anything that is not a known status counts as active. */
function currentAppState(): AppStateStatus {
  const status: unknown = AppState.currentState;
  return typeof status === "string" ? (status as AppStateStatus) : "active";
}

function initial<T>(signedIn: boolean): AccountState<T> {
  return {
    data: null,
    error: null,
    unconfigured: false,
    loading: signedIn,
    stale: false,
    fetchedAt: null,
    refreshing: false,
  };
}

export function createAccountStore<T>(options: AccountStoreOptions<T>): AccountStore<T> {
  const retryMs = Math.max(options.retryMs ?? options.pollMs * 2, options.pollMs);

  let account = currentAccount();
  let state: AccountState<T> = initial(account !== null);
  const listeners = new Set<() => void>();
  let subscribers = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let generation = 0;
  let appState = currentAppState();
  let appListener: { remove: () => void } | null = null;

  const emit = (next: Partial<AccountState<T>>) => {
    state = { ...state, ...next };
    for (const listener of [...listeners]) listener();
  };

  const stopTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const active = () => subscribers > 0 && account !== null && appState === "active";

  const schedule = (delay: number) => {
    stopTimer();
    if (active()) timer = setTimeout(() => void poll(), delay);
  };

  function poll(): Promise<void> {
    if (inFlight !== null) return inFlight;
    if (!active()) return Promise.resolve();

    stopTimer();
    const started = generation;
    controller = new AbortController();
    const signal = controller.signal;
    emit({ refreshing: true });

    inFlight = (async () => {
      let delay = options.pollMs;
      try {
        const data = await options.load(signal);
        if (started !== generation) return;
        emit({ data, error: null, unconfigured: false, loading: false, stale: false, fetchedAt: Date.now() });
        options.afterLoad?.(data);
      } catch (error) {
        if (started !== generation) return;
        delay = retryMs;
        emit({
          error: error instanceof Error ? error.message : "Could not read this.",
          unconfigured: error instanceof ApiError && error.unconfigured,
          loading: false,
          stale: state.data !== null,
        });
      } finally {
        inFlight = null;
        controller = null;
        if (started === generation) emit({ refreshing: false });
        /* A read dropped for a switched account is followed at once by one
           for the account now signed in. */
        schedule(started !== generation ? 0 : delay);
      }
    })();
    return inFlight;
  }

  function reset() {
    generation += 1;
    options.onReset?.();
    stopTimer();
    controller?.abort();
    state = initial(account !== null);
    for (const listener of [...listeners]) listener();
  }

  onAccountChange((key) => {
    if (key === account) return;
    account = key;
    reset();
    if (active()) void poll();
  });

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    subscribers += 1;
    if (subscribers === 1) {
      appState = currentAppState();
      appListener = AppState.addEventListener("change", (next) => {
        const was = appState;
        appState = next;
        if (next === "active" && was !== "active") void poll();
        else if (next !== "active") stopTimer();
      });
      /* A screen opening after a long gap reads now rather than waiting out
         the rest of an interval it never saw start. */
      void poll();
    }
    return () => {
      listeners.delete(listener);
      subscribers -= 1;
      if (subscribers <= 0) {
        subscribers = 0;
        stopTimer();
        appListener?.remove();
        appListener = null;
      }
    };
  }

  const snapshot = () => state;

  /* Named useFeed, not use: the React Compiler only treats a member call as a
     hook when its name is use + a capital letter, and memoised `store.use()`
     away on the next render (a hooks-order crash on a real device). */
  function useFeed(): AccountFeed<T> {
    const current = useSyncExternalStore(subscribe, snapshot);
    const refetch = useCallback(() => void poll(), []);
    return useMemo(() => ({ ...current, signedIn: account !== null, refetch }), [current, refetch]);
  }

  function update(change: (data: T) => T): { current: () => boolean } {
    const started = generation;
    if (state.data !== null) {
      const next = change(state.data);
      if (next !== state.data) emit({ data: next });
    }
    return { current: () => started === generation };
  }

  return { useFeed, refetch: poll, snapshot, update };
}
