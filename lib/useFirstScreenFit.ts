"use client";

import { useLayoutEffect, type RefObject } from "react";

/* ---------------------------------------------------------------------------
   A plot sized so its card opens exactly one screen tall.

   With the workspace scrolled to the top, the chart card's bottom edge should
   sit on the viewport's — level with the agent's, which useStickyFill holds
   there — on a laptop as on a tall monitor. CSS can clamp the plot, but it
   cannot know how much sits above it: the overview strip, the market header
   and the pivots each wrap differently at every width, and the fixed estimate
   this replaces left the card's foot under the fold on a laptop, and focus
   mode's under it everywhere.

   So the room is measured — the scroll viewport, less the scroll content above
   the plot and the card below it, less `gap` — and published on the plot as
   `--plot-fit`. `.chart-plot` in app/globals.css clamps it between its floor
   and its ceiling, and its media queries decide where it applies. The scroll
   offset is factored out, so it is measured at rest and on resize, never per
   scroll: the card is not sticky.
--------------------------------------------------------------------------- */

export function useFirstScreenFit(
  plotRef: RefObject<HTMLElement | null>,
  cardRef: RefObject<HTMLElement | null>,
  gap: number,
): void {
  useLayoutEffect(() => {
    const plot = plotRef.current;
    const card = cardRef.current;
    if (!plot || !card) return;
    const scroller = plot.closest<HTMLElement>("[data-workspace-scroll]");
    if (!scroller) return;

    let frame = 0;
    let written: number | null = null;
    const measure = () => {
      frame = 0;
      /* Hidden under a full-bleed route: nothing to fit until it is back. */
      if (plot.getClientRects().length === 0) return;
      const viewport = scroller.getBoundingClientRect();
      const box = plot.getBoundingClientRect();
      const above = box.top - viewport.top + scroller.scrollTop;
      const below = card.getBoundingClientRect().bottom - box.bottom;
      const fit = Math.round(scroller.clientHeight - gap - above - below);
      /* The plot's own height is in neither measurement, so writing it settles
         in one pass — and a write that changes nothing is skipped. */
      if (fit === written) return;
      written = fit;
      plot.style.setProperty("--plot-fit", `${fit}px`);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("resize", schedule);
    /* The viewport, and anything above the plot growing or wrapping: the
       overview landing, the market header wrapping, the pivots arriving. The
       card is watched as well as the workspace: beside a long widgets column
       the workspace keeps its height while the card's header grows. */
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    observer.observe(card);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      plot.style.removeProperty("--plot-fit");
    };
  }, [plotRef, cardRef, gap]);
}
