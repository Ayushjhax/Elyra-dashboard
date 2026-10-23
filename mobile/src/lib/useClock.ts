import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

/* ---------------------------------------------------------------------------
   The current time, as something a component may legally read — ported from
   the website's lib/useClock.ts.

   `Date.now()` in a render body is an impure call; the React compiler
   rejects it, and anything memoised around it goes stale. Time is an
   external store instead: a component subscribes and re-renders when it
   actually changes. Two cadences, because a clock face needs seconds and a
   list of "4m ago" labels does not.

   Nothing ticks unless something is subscribed. On a phone the app also
   sleeps: when it comes back to the foreground "now" is refreshed at once,
   so nothing shows an age from before it was backgrounded.
--------------------------------------------------------------------------- */

interface Clock {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => number;
}

function createClock(intervalMs: number): Clock {
  let now = Date.now();
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let appState: { remove: () => void } | null = null;

  const tick = () => {
    now = Date.now();
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (timer === null) {
        now = Date.now();
        timer = setInterval(tick, intervalMs);
        appState = AppState.addEventListener("change", (status) => {
          if (status === "active") tick();
        });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
          appState?.remove();
          appState = null;
        }
      };
    },
    /* Cached: a snapshot returning a fresh Date.now() on every call changes
       identity every render and React re-renders forever. */
    snapshot: () => now,
  };
}

const second = createClock(1_000);
const minute = createClock(60_000);

/** Ticks every second. For a clock face. */
export function useSecond(): number {
  return useSyncExternalStore(second.subscribe, second.snapshot);
}

/** Ticks every minute. For relative timestamps. */
export function useMinute(): number {
  return useSyncExternalStore(minute.subscribe, minute.snapshot);
}
