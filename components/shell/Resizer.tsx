"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLUMN_BOUNDS,
  clampColumn,
  type ShellColumnId,
} from "@/lib/layout";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The handle on a side column's inner edge.

   Drag to move the boundary, double-click to put it back, arrow keys to nudge
   it, Home and End for the extremes. Anything the operator can drag they can
   also reach from the keyboard, which is why it is a `separator` with a value
   rather than a decorated `div`.

   It lives in the gap it divides and paints nothing until it is wanted. And it
   decides nothing about how far a boundary may move: `lib/layout.ts` owns
   every bound, so the centre's floor is enforced in one place whether a width
   came from a drag, a key or a restored workspace.
--------------------------------------------------------------------------- */

/** Hold one cursor for the whole drag, however far off the handle it strays. */
function lockCursor(cursor: string): () => void {
  const { style } = document.body;
  const previous = { cursor: style.cursor, userSelect: style.userSelect };
  style.cursor = cursor;
  style.userSelect = "none";
  return () => {
    style.cursor = previous.cursor;
    style.userSelect = previous.userSelect;
  };
}

/**
 * `side` says which edge of its own column the handle sits on: `end` for a
 * column left of the centre, `start` for the agent, which is on the other side
 * of it and so widens as the pointer moves left.
 *
 * A drag or a nudge starts from the column's measured width rather than its
 * stored one, so the boundary always leaves from where it is drawn — including
 * when the fitter is holding the column narrower than it opens, which on a
 * laptop is most of the time. The value it announces is that width too.
 */
export function ColumnResizer({
  id,
  side = "end",
  className,
}: {
  id: ShellColumnId;
  side?: "start" | "end";
  className?: string;
}) {
  const stored = useElyraStore(
    (state) => state.columnWidths[id] ?? COLUMN_BOUNDS[id].initial,
  );
  const setColumnWidth = useElyraStore((state) => state.setColumnWidth);
  const setResizing = useElyraStore((state) => state.setResizing);
  const resetColumnWidth = useElyraStore((state) => state.resetColumnWidth);
  const [dragging, setDragging] = useState(false);
  /* The column's drawn width, for the separator's value: null until it is
     measured, and while the column is off screen at this breakpoint. */
  const [drawn, setDrawn] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const bounds = COLUMN_BOUNDS[id];
  const direction = side === "end" ? 1 : -1;

  /** The column this handle resizes. */
  function host(): HTMLElement | null {
    return ref.current?.closest<HTMLElement>("[data-shell-column]") ?? null;
  }

  useEffect(() => {
    const column = ref.current?.closest<HTMLElement>("[data-shell-column]");
    if (!column) return;
    const observer = new ResizeObserver(() => setDrawn(column.offsetWidth || null));
    observer.observe(column);
    return () => observer.disconnect();
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const column = host();
    if (!column) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = column.offsetWidth;
    const release = lockCursor("col-resize");
    setDragging(true);
    setResizing(true);

    const onMove = (move: PointerEvent) => {
      setColumnWidth(id, startWidth + (move.clientX - startX) * direction);
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      release();
      setDragging(false);
      setResizing(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 48 : 16;
    const from = host()?.offsetWidth ?? stored;
    /* Arrow keys move the boundary, not the column, so the same key widens the
       column left of the centre and narrows the one on its right. */
    switch (event.key) {
      case "ArrowLeft":
        setColumnWidth(id, from - step * direction);
        break;
      case "ArrowRight":
        setColumnWidth(id, from + step * direction);
        break;
      case "Home":
        setColumnWidth(id, bounds.min);
        break;
      case "End":
        setColumnWidth(id, bounds.max);
        break;
      case "Enter":
      case " ":
        resetColumnWidth(id);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize the ${bounds.label} column`}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={drawn ?? clampColumn(id, stored)}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => resetColumnWidth(id)}
      className={cn(
        "group/grip absolute inset-y-0 z-30 hidden w-[var(--gap-workspace)] touch-none",
        "cursor-col-resize select-none items-center justify-center mid:flex",
        side === "end"
          ? "-right-[var(--gap-workspace)]"
          : "-left-[var(--gap-workspace)]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-12 w-0.5 rounded-pill transition-[opacity,background-color] duration-[var(--dur-fast)] ease-brand",
          dragging
            ? "bg-accent opacity-100"
            : cn(
                "bg-border-strong opacity-0",
                "group-hover/grip:opacity-100 group-focus-visible/grip:opacity-100",
              ),
        )}
      />
    </div>
  );
}
