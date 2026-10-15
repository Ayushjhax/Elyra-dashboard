"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ---------------------------------------------------------------------------
   Copying text, and saying whether it worked.

   The Clipboard API first; where it is missing or refused (an insecure
   origin, a denied permission, some embedded views) the old selection-and-
   execCommand route, which still works in most of those places. A copy that
   fails is an outcome to report, never an exception to swallow.
--------------------------------------------------------------------------- */

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Refused. Try the fallback. */
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}

export type CopyState = "idle" | "copied" | "failed";

/** A copy action with its own brief result, cleared after `ms`. */
export function useCopy(ms = 1_600): { state: CopyState; copy: (text: string) => Promise<boolean> } {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      const ok = await writeClipboard(text);
      setState(ok ? "copied" : "failed");
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState("idle"), ms);
      return ok;
    },
    [ms],
  );

  return { state, copy };
}
