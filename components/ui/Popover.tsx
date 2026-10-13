"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   A small anchored popover.

   Hand-rolled rather than imported — Radix's popover is not a dependency of
   this app, and KillSwitch set the pattern this follows. What a popover owes
   the user is here: Escape closes it and returns focus to the trigger, a
   pointer down outside closes it, and focus moves into it on open. The
   trigger is the caller's, and carries `aria-expanded` and
   `aria-controls` itself so the relationship is announced.
--------------------------------------------------------------------------- */

type Side = "bottom" | "top" | "right";
type Align = "start" | "end";

const PLACEMENT: Record<Side, Record<Align, string>> = {
  bottom: { start: "left-0 top-full mt-2", end: "right-0 top-full mt-2" },
  top: { start: "left-0 bottom-full mb-2", end: "right-0 bottom-full mb-2" },
  right: { start: "left-full top-0 ml-2", end: "left-full bottom-0 ml-2" },
};

export function Popover({
  id,
  open,
  onOpenChange,
  trigger,
  label,
  side = "bottom",
  align = "end",
  className,
  children,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The control that opens it. Rendered inside the popover's own root. */
  trigger: React.ReactNode;
  /** Names the popover for assistive tech. */
  label: string;
  side?: Side;
  align?: Align;
  className?: string;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    /* Focus is a DOM call, not state, so it belongs in the effect body. */
    const first = panelRef.current?.querySelector<HTMLElement>(
      "[data-autofocus], button:not([disabled]), [href], input, [tabindex]:not([tabindex='-1'])",
    );
    first?.focus();

    const trigger = () =>
      rootRef.current?.querySelector<HTMLElement>(`[aria-controls="${id}"]`);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onOpenChange(false);
      trigger()?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      /* No focus return: the user is already on their way somewhere else. */
      onOpenChange(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [id, open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative">
      {trigger}
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={label}
          className={cn(
            "absolute z-50 rounded-card border border-border-strong bg-surface-panel shadow-pop",
            PLACEMENT[side][align],
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
