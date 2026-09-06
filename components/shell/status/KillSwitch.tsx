"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Disconnect.

   Behind a confirmation, because it is one click from the clock and the
   balance, and because signing out of an embedded wallet is a slower thing
   to undo than it looks — the user has to go back through email or OAuth.

   A hand-rolled popover rather than a modal: the spec asks for a popover,
   and Radix's is not a dependency of this app. What a popover still owes the
   user is here — Escape closes it, a click outside closes it, and focus moves
   into it on open and back to the trigger on close — because those are the
   parts people actually rely on, not the wrapper they come in.
--------------------------------------------------------------------------- */

export function KillSwitch() {
  const auth = useElyraAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    /* Focusing an element is a DOM call, not state, so it belongs in the
       effect body. */
    confirmRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      /* No focus return: the user is already on their way somewhere else. */
      close(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  const disconnect = async () => {
    setBusy(true);
    try {
      await auth.logout();
      setOpen(false);
      router.push("/");
    } finally {
      /* Cleared even on failure, so a network error leaves a usable button
         rather than one stuck saying "Signing out". */
      setBusy(false);
    }
  };

  /* Nothing to disconnect from. Rendering a dead power button would invite a
     click that does nothing and explains nothing. */
  if (!auth.available || !auth.authenticated) return null;

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label="Disconnect"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-control",
              "transition-colors duration-[var(--dur-fast)] ease-brand",
              open
                ? "bg-negative-bg text-negative"
                : "text-accent-quiet hover:bg-surface-hover hover:text-negative",
            )}
          >
            <Power size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Disconnect</TooltipContent>
      </Tooltip>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Confirm disconnect"
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-60 rounded-card p-3",
            "rim border border-border-strong bg-surface-panel shadow-lift-accent",
          )}
        >
          <p className="type-body-sm text-text-primary">Disconnect this wallet?</p>
          <p className="type-label mt-1 text-text-muted">
            You will be signed out and returned to the chart. Signing back in
            goes through your original login method.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => close()} disabled={busy}>
              Cancel
            </Button>
            <Button
              ref={confirmRef}
              size="sm"
              variant="danger"
              onClick={() => void disconnect()}
              disabled={busy}
            >
              {busy ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
