"use client";

import { useEffect } from "react";
import { useElyraStore } from "@/lib/store";

/**
 * Side effects that belong to the app rather than to any one panel:
 *
 *  - rehydrates persisted settings after mount, so the server render and the
 *    first client render agree,
 *  - closes the drawers when the viewport grows past their breakpoint,
 *  - ⌘K / Ctrl+K opens search from anywhere,
 *  - Escape leaves focus mode, unless a dialog is open and wants it first.
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const store = useElyraStore.getState();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        store.setCommandOpen(!store.commandOpen);
        return;
      }
      if (
        event.key === "Escape" &&
        store.focusMode &&
        document.querySelector("[role='dialog']") === null
      ) {
        store.setFocusMode(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
