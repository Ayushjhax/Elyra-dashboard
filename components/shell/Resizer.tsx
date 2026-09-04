"use client";

import { useRef, useState } from "react";
import {
  COLUMN_BOUNDS,
  clampColumn,
  splitRows,
  type ShellColumnId,
} from "@/lib/layout";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The handles that divide the terminal.

   Two of them, one per axis, and they behave the same way on purpose: drag to
   move the boundary, double-click to put it back, arrow keys to nudge it, Home
   and End for the extremes. Anything the operator can drag they can also reach
   from the keyboard, which is why both are a `separator` with a value rather
   than a decorated `div`.

   Both live in the 12px gap they divide and paint nothing until they are
   wanted: at rest the terminal looks exactly as it did before, and a hairline
   appears under the pointer. Nothing here decides how far a boundary may move
   — `lib/layout.ts` owns every bound, so the chart's floor is enforced in one
   place whether the width came from a drag, a key or a restored workspace.
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

/** The hairline itself. Invisible until hovered, focused or held. */
function Grip({
  axis,
  active,
}: {
  axis: "x" | "y";
  active: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "rounded-pill transition-[opacity,background-color] duration-[var(--dur-fast)] ease-brand",
        axis === "x" ? "h-10 w-0.5" : "h-0.5 w-10",
        active
          ? "fill-accent bg-accent opacity-100 shadow-lift-accent"
          : cn(
              "bg-border-strong opacity-0",
              "group-hover/grip:opacity-100 group-focus-visible/grip:opacity-100",
            ),
      )}
    />
  );
}

/**
 * The boundary between a shell column and its neighbour.
 *
 * `side` says which edge of its own column the handle sits on: `end` for the
 * three columns left of the chart, `start` for the assistant, which is the one
 * column on the other side of it and so widens as the pointer moves left.
 *
 * A drag starts from the column's measured width rather than its stored one,
 * so the boundary always leaves from where it is drawn — including when the
 * fitter is holding the column narrower than the operator asked for to keep
 * the chart above its floor.
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
  const ref = useRef<HTMLDivElement>(null);

  const bounds = COLUMN_BOUNDS[id];
  const direction = side === "end" ? 1 : -1;

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const host = ref.current?.closest<HTMLElement>("[data-shell-column]");
    if (!host) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = host.offsetWidth;
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
    /* Arrow keys move the boundary, not the column, so the same key widens the
       column on the left of the chart and narrows the one on its right. */
    switch (event.key) {
      case "ArrowLeft":
        setColumnWidth(id, stored - step * direction);
        break;
      case "ArrowRight":
        setColumnWidth(id, stored + step * direction);
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
      aria-label={`Resize the ${bounds.label.toLowerCase()} column`}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={clampColumn(id, stored)}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => resetColumnWidth(id)}
      className={cn(
        "group/grip absolute inset-y-0 z-30 hidden w-[var(--gap-shell)] touch-none",
        "cursor-col-resize select-none items-center justify-center mid:flex",
        side === "end"
          ? "-right-[calc(var(--gap-shell)/2)]"
          : "-left-[calc(var(--gap-shell)/2)]",
        className,
      )}
    >
      <Grip axis="x" active={dragging} />
    </div>
  );
}

/**
 * The boundary between two stacked panels.
 *
 * Rows divide their column by flex weight, so the handle converts the pixels
 * the pointer travelled into weight moved from one row to the other — see
 * `splitRows`. Weights and not pixels, so a split survives the window being
 * resized and the column being reflowed under it.
 *
 * It takes no height of its own: a zero-height flex item with half the shell
 * gap trimmed off each side, so the 12px between two panels is still 12px and
 * the handle floats in the middle of it.
 */
export function RowResizer({
  a,
  b,
  label,
  className,
}: {
  /** The row above: its id, its current weight, and the weight to reset to. */
  a: { id: string; grow: number; base: number };
  /** The row below. */
  b: { id: string; grow: number; base: number };
  label: string;
  className?: string;
}) {
  const setRowGrow = useElyraStore((state) => state.setRowGrow);
  const setResizing = useElyraStore((state) => state.setResizing);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /** The two rows this handle divides, as they are currently laid out. */
  function neighbours(): [HTMLElement, HTMLElement] | null {
    const host = ref.current;
    const above = host?.previousElementSibling;
    const below = host?.nextElementSibling;
    if (!(above instanceof HTMLElement) || !(below instanceof HTMLElement)) return null;
    return [above, below];
  }

  function move(deltaPx: number) {
    const pair = neighbours();
    if (!pair) return;
    const [first, second] = splitRows(
      [pair[0].offsetHeight, pair[1].offsetHeight],
      [a.grow, b.grow],
      deltaPx,
    );
    setRowGrow(a.id, first, b.id, second);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const pair = neighbours();
    if (!pair) return;
    event.preventDefault();

    const startY = event.clientY;
    const heights: [number, number] = [pair[0].offsetHeight, pair[1].offsetHeight];
    const grows: [number, number] = [a.grow, b.grow];
    const release = lockCursor("row-resize");
    setDragging(true);
    setResizing(true);

    const onMove = (event2: PointerEvent) => {
      const [first, second] = splitRows(heights, grows, event2.clientY - startY);
      setRowGrow(a.id, first, b.id, second);
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
    switch (event.key) {
      case "ArrowUp":
        move(-step);
        break;
      case "ArrowDown":
        move(step);
        break;
      case "Enter":
      case " ":
        setRowGrow(a.id, a.base, b.id, b.base);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    /* Zero height, half the gap trimmed off each side: the 12px between the
       two panels is unchanged and this sits in the middle of it. */
    <div
      ref={ref}
      className={cn(
        "relative z-30 h-0 shrink-0 my-[calc(var(--gap-shell)/-2)]",
        className,
      )}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Resize ${label}`}
        tabIndex={0}
        title="Drag to resize. Double-click to reset."
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => setRowGrow(a.id, a.base, b.id, b.base)}
        className={cn(
          "group/grip absolute inset-x-0 -top-[calc(var(--gap-shell)/2)]",
          "flex h-[var(--gap-shell)] cursor-row-resize touch-none select-none",
          "items-center justify-center",
        )}
      >
        <Grip axis="y" active={dragging} />
      </div>
    </div>
  );
}
