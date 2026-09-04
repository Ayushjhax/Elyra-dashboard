"use client";

import { Check, Plus, RotateCcw, X } from "lucide-react";
import {
  PANELS_BY_GROUP,
  PANEL_DRAG_TYPE,
  type PanelEntry,
} from "@/components/shell/panelRegistry";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { AmbientGlow } from "@/components/ui/Glow";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The components palette.

   A column of the grid rather than a drawer over it, for one reason: you drag
   out of it and into the column beside it, and a modal layer would be sitting
   on the place you are dragging to. Opening it widens the shell; closing it
   gives the width back.

   Every row does the same thing two ways. Drag it to choose where the panel
   lands, or click it to drop the panel on the end of the column — the second
   path is what makes the feature reachable from a keyboard at all, since HTML
   drag-and-drop is pointer-only.
--------------------------------------------------------------------------- */

function PaletteRow({ entry }: { entry: PanelEntry }) {
  const placed = useElyraStore((state) => state.stack.includes(entry.key));
  const placePanel = useElyraStore((state) => state.placePanel);
  const removePanel = useElyraStore((state) => state.removePanel);
  const setDraggingPanel = useElyraStore((state) => state.setDraggingPanel);
  const Icon = entry.icon;

  return (
    <li>
      <button
        type="button"
        /* One control per row: the button is both the drag source and the
           click target, so there is never a button inside a button. */
        draggable
        aria-pressed={placed}
        aria-label={
          placed ? `Remove ${entry.label} from the column` : `Add ${entry.label} to the column`
        }
        onDragStart={(event) => {
          event.dataTransfer.setData(PANEL_DRAG_TYPE, entry.key);
          event.dataTransfer.effectAllowed = "move";
          setDraggingPanel(entry.key);
        }}
        onDragEnd={() => setDraggingPanel(null)}
        onClick={() => (placed ? removePanel(entry.key) : placePanel(entry.key))}
        className={cn(
          "group flex w-full cursor-grab items-start gap-2 rounded-card px-2 py-2 text-left",
          "border transition-colors duration-[var(--dur-fast)] ease-brand active:cursor-grabbing",
          placed
            ? "border-border-strong bg-surface-raised"
            : "border-transparent hover:border-border-subtle hover:bg-surface-hover",
        )}
      >
        <Icon
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className={cn(
            "mt-0.5 shrink-0",
            placed ? "text-agent-accent" : "text-text-secondary",
          )}
        />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="type-label truncate text-text-primary">{entry.label}</span>
          <span className="type-label text-text-muted">{entry.hint}</span>
        </span>

        {/* States its own outcome: a check for what is already placed, a plus
            for what is not. */}
        <span
          aria-hidden
          className={cn(
            "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-chip",
            placed
              ? "fill-accent bg-accent text-text-on-accent shadow-lift-accent"
              : "text-text-muted group-hover:text-text-primary",
          )}
        >
          {placed ? (
            <Check size={11} strokeWidth={2} />
          ) : (
            <Plus size={12} strokeWidth={1.5} />
          )}
        </span>
      </button>
    </li>
  );
}

export function ComponentPalette() {
  const setPaletteOpen = useElyraStore((state) => state.setPaletteOpen);
  const resetLayout = useElyraStore((state) => state.resetLayout);

  return (
    /* Mounted only while it is open — see AppShell — so it holds no visibility
       state of its own and, being absent rather than hidden, costs the grid
       neither a track nor a gap when it is closed. */
    <aside
      aria-label="Components"
      className={cn(
        "relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        "rim rounded-panel border border-border-subtle bg-surface-panel",
      )}
    >
      <AmbientGlow
        tone="agent"
        breathe
        className="-top-[10%] left-1/2 h-48 w-[170%] -translate-x-1/2"
      />

      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3">
        <Eyebrow>Components</Eyebrow>
        <button
          type="button"
          onClick={() => setPaletteOpen(false)}
          aria-label="Close components"
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-chip",
            "text-text-muted transition-colors duration-[var(--dur-fast)] ease-brand",
            "hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <p className="type-label px-2 pb-2 text-text-muted">
          Drag onto the column to choose where it lands, or click to add it to
          the end.
        </p>

        {PANELS_BY_GROUP.map(({ group, entries }) => (
          <section key={group} className="pb-1">
            <Eyebrow className="block px-2 pb-1 pt-2">{group}</Eyebrow>
            <ul className="list-none space-y-0.5">
              {entries.map((entry) => (
                <PaletteRow key={entry.key} entry={entry} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="shrink-0 border-t border-border-subtle p-2">
        {/* The one escape hatch for the whole arrangement — order, widths,
            splits and which columns are open. A boundary can also be put back
            on its own by double-clicking its handle. */}
        <button
          type="button"
          onClick={resetLayout}
          className={cn(
            "type-label flex h-8 w-full items-center justify-center gap-1.5 rounded-control",
            "border border-border-subtle text-text-secondary",
            "transition-colors duration-[var(--dur-fast)] ease-brand",
            "hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <RotateCcw size={14} strokeWidth={1.5} aria-hidden />
          Reset layout
        </button>
      </div>
    </aside>
  );
}
