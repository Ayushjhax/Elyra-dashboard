"use client";

import { Fragment, useRef, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, X } from "lucide-react";
import {
  isPanelKey,
  PANEL_DRAG_TYPE,
  PANEL_REGISTRY,
  type PanelEntry,
} from "@/components/shell/panelRegistry";
import { RowResizer } from "@/components/shell/Resizer";
import { EmptyState } from "@/components/ui/EmptyState";
import { useElyraStore } from "@/lib/store";
import type { PanelKey } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Column two, composed by the operator.

   It used to be three fixed panels. Now it renders whatever is in the store's
   stack, and while the palette is open it accepts panels dropped between the
   ones already there.

   Drop targets only exist during a drag, so nothing moves under the pointer in
   normal use. And every drag has a keyboard equivalent — the move and remove
   buttons in each panel's edit strip — because HTML drag-and-drop has none.

   How the column divides between them is the operator's too: the 12px gap
   between any two panels is a handle, and dragging it moves flex weight from
   one to the other. Weight rather than height, so a split survives the window
   being resized and the column being reflowed under it.
--------------------------------------------------------------------------- */

/** The gap a panel can be dropped into. Absent until a drag starts. */
function DropSlot({ index }: { index: number }) {
  const dragging = useElyraStore((state) => state.draggingPanel);
  const placePanel = useElyraStore((state) => state.placePanel);
  const setDraggingPanel = useElyraStore((state) => state.setDraggingPanel);
  const [over, setOver] = useState(false);

  if (!dragging) return null;

  return (
    <div
      /* Decorative to assistive tech: the same move is available from the
         buttons in each panel's edit strip. */
      aria-hidden
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const key = event.dataTransfer.getData(PANEL_DRAG_TYPE);
        if (isPanelKey(key)) placePanel(key, index);
        setDraggingPanel(null);
      }}
      className={cn(
        "shrink-0 rounded-card border border-dashed",
        "transition-[height,background-color,border-color] duration-[var(--dur-base)] ease-brand",
        over
          ? "h-16 border-agent-accent bg-surface-hover shadow-lift-agent"
          : "h-2 border-border-strong",
      )}
    />
  );
}

/**
 * The controls for one panel while the palette is open.
 *
 * A bar above the panel rather than a badge floating over its corner: panel
 * headers already have controls in that corner — the watchlist's search, the
 * automation panel's New rule — and an overlay sat on top of them. Taking a
 * row of its own costs 28px of the panel while editing and covers nothing.
 */
function EditStrip({
  entry,
  index,
  count,
  onDragStart,
  onDragEnd,
}: {
  entry: PanelEntry;
  index: number;
  count: number;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const removePanel = useElyraStore((state) => state.removePanel);
  const nudgePanel = useElyraStore((state) => state.nudgePanel);

  const control = cn(
    "inline-flex size-6 items-center justify-center rounded-chip",
    "text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
    "hover:bg-surface-hover hover:text-text-primary",
    "disabled:pointer-events-none disabled:text-text-muted",
  );

  const Icon = entry.icon;

  return (
    <div
      className={cn(
        "flex h-7 shrink-0 items-center gap-0.5 rounded-control px-1",
        "border border-border-strong bg-surface-raised",
      )}
    >
      {/* Only the handle starts a drag, so the panel underneath keeps its own
          text selection and scrolling. */}
      <span
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        aria-hidden
        title={`Drag ${entry.label}`}
        className={cn(control, "cursor-grab active:cursor-grabbing")}
      >
        <GripVertical size={14} strokeWidth={1.5} />
      </span>

      <Icon size={13} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
      <span className="type-label min-w-0 flex-1 truncate text-text-secondary">
        {entry.label}
      </span>

      <button
        type="button"
        className={control}
        disabled={index === 0}
        aria-label={`Move ${entry.label} up`}
        onClick={() => nudgePanel(entry.key, -1)}
      >
        <ChevronUp size={14} strokeWidth={1.5} aria-hidden />
      </button>
      <button
        type="button"
        className={control}
        disabled={index === count - 1}
        aria-label={`Move ${entry.label} down`}
        onClick={() => nudgePanel(entry.key, 1)}
      >
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
      </button>
      <button
        type="button"
        className={cn(control, "hover:bg-negative-bg hover:text-negative")}
        aria-label={`Remove ${entry.label}`}
        onClick={() => removePanel(entry.key)}
      >
        <X size={14} strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}

export function PanelStack({ className }: { className?: string }) {
  const stack = useElyraStore((state) => state.stack);
  const paletteOpen = useElyraStore((state) => state.paletteOpen);
  const dragging = useElyraStore((state) => state.draggingPanel);
  const setDraggingPanel = useElyraStore((state) => state.setDraggingPanel);
  const setPaletteOpen = useElyraStore((state) => state.setPaletteOpen);
  const rowGrow = useElyraStore((state) => state.rowGrow);

  /* Held so a dragged panel's own box can be the drag image, rather than the
     small handle the pointer happens to be on. */
  const boxes = useRef(new Map<PanelKey, HTMLDivElement | null>());

  /* The registry's weight is the default; a handle between two panels writes
     over it. Read as a map rather than one selector per panel, because the
     stack's length is not known until it is rendered. */
  const growOf = (key: PanelKey) => rowGrow[key] ?? PANEL_REGISTRY[key].grow;

  if (stack.length === 0) {
    return (
      <div
        className={cn(
          "min-h-0 min-w-0 rounded-panel border border-border-subtle bg-surface-panel",
          className,
        )}
      >
        <EmptyState
          mark="forest"
          title="This column is empty"
          body="Open the components palette and drag a panel here, or click one to add it."
          action={
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className={cn(
                "type-label h-8 rounded-control border border-border-strong px-3",
                "bg-surface-raised text-text-primary",
                "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
              )}
            >
              Open components
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col gap-[var(--gap-shell)]", className)}>
      {stack.map((key, index) => {
        const entry = PANEL_REGISTRY[key];
        const lifted = dragging === key;

        return (
          <Fragment key={key}>
            {/* One slot above every panel, plus the closing one below the last,
                so a drop can land in any gap in the column. */}
            <DropSlot index={index} />
            {/* The same gap divides two panels, so only one of the two can be
                in it: the drop slot while a drag is running, the handle the
                rest of the time. */}
            {index > 0 && !dragging && (
              <RowResizer
                a={{
                  id: stack[index - 1],
                  grow: growOf(stack[index - 1]),
                  base: PANEL_REGISTRY[stack[index - 1]].grow,
                }}
                b={{ id: key, grow: growOf(key), base: entry.grow }}
                label={`${PANEL_REGISTRY[stack[index - 1]].label} and ${entry.label}`}
              />
            )}
            <div
              ref={(node) => {
                boxes.current.set(key, node);
              }}
              style={{ flexGrow: growOf(key), flexBasis: 0 }}
              className={cn(
                "flex min-h-0 flex-col gap-1",
                "transition-opacity duration-[var(--dur-base)] ease-brand",
                lifted && "opacity-40",
              )}
            >
              {paletteOpen && (
                <EditStrip
                  entry={entry}
                  index={index}
                  count={stack.length}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(PANEL_DRAG_TYPE, key);
                    event.dataTransfer.effectAllowed = "move";
                    const box = boxes.current.get(key);
                    if (box) event.dataTransfer.setDragImage(box, 24, 24);
                    setDraggingPanel(key);
                  }}
                  onDragEnd={() => setDraggingPanel(null)}
                />
              )}
              {/* The panel inside is a plain <section>; this makes it fill
                  whatever the bar above it left. */}
              <div className="flex min-h-0 flex-1 flex-col *:min-h-0 *:flex-1">
                {entry.render()}
              </div>
            </div>
          </Fragment>
        );
      })}

      <DropSlot index={stack.length} />
    </div>
  );
}
