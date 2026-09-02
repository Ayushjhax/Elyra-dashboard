"use client";

import { useEffect } from "react";
import { useElyraStore } from "@/lib/store";

/**
 * Side effects that belong to the app rather than to any one panel:
 *
 *  - rehydrates persisted settings after mount, so the server render and the
 *    first client render agree,
 *  - closes any collapsed surface when the viewport grows past its breakpoint.
 */
export function TerminalRuntime() {
  useEffect(() => {
    void useElyraStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    const queries = [
      window.matchMedia("(min-width: 1280px)"),
      window.matchMedia("(min-width: 900px)"),
      window.matchMedia("(min-width: 640px)"),
    ];
    const onChange = () => useElyraStore.getState().closeCollapsedSurfaces();
    for (const query of queries) query.addEventListener("change", onChange);
    return () => {
      for (const query of queries) query.removeEventListener("change", onChange);
    };
  }, []);

  return null;
}
