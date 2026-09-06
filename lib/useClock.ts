"use client";

import { useSyncExternalStore } from "react";

/* ---------------------------------------------------------------------------
   The current time, as something a component may legally read.

   `Date.now()` in a render body is an impure call, and the React compiler
   rejects it — correctly: the value changes between two renders that should
   have produced the same output, so anything memoised around it is wrong.
   The fix is not to suppress the rule but to make time an external store, so
   a component subscribes to it and re-renders when it actually changes.

   Two cadences, because the cost differs by two orders of magnitude. A clock
   showing minutes still has to tick every second to land on the boundary
   promptly; a list of "4m ago" labels does not, and re-rendering it 60 times
   a minute to change nothing would be waste.

   Nothing here ticks unless something is subscribed, and the timer is cleared
   when the last subscriber goes.
--------------------------------------------------------------------------- */

interface Clock {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => number;
  serverSnapshot: () => null;
}

function createClock(intervalMs: number): Clock {
  let now = Date.now();
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (timer === null) {
        timer = setInterval(() => {
          now = Date.now();
          for (const l of listeners) l();
        }, intervalMs);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    /* Cached. A snapshot that returns a fresh `Date.now()` on every call
       changes identity every render and React re-renders forever. */
    snapshot: () => now,
    /* There is no "now" on the server that the client will agree with, and a
       mismatch here would be a hydration error on every load. */
    serverSnapshot: () => null,
  };
}

const second = createClock(1_000);
const minute = createClock(60_000);

/** Ticks every second. For a clock face. Null until hydrated. */
export function useSecond(): number | null {
  return useSyncExternalStore(second.subscribe, second.snapshot, second.serverSnapshot);
}

/** Ticks every minute. For relative timestamps. Null until hydrated. */
export function useMinute(): number | null {
  return useSyncExternalStore(minute.subscribe, minute.snapshot, minute.serverSnapshot);
}
