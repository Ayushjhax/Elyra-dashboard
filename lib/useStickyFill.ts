"use client";

import { useLayoutEffect, type RefObject } from "react";

/* ---------------------------------------------------------------------------
   A sticky side panel whose bottom edge is always the viewport's.

   The agent column starts level with the chart, below the overview, scrolls
   with the page until it reaches its sticky offset, and then stays put while
   the centre keeps scrolling. CSS alone can do the sticking but not the
   height: at the top of the page the panel's top edge is a couple of hundred
   pixels down, so a panel sized to the full viewport would put its composer
   below the fold — exactly what the panel must never do.

   So the height is measured: from wherever the panel's top currently is to
   the bottom of the scroll viewport, less the gap. It is layout, not motion —
   one style write per animation frame while scrolling, and none at rest.
--------------------------------------------------------------------------- */

/** Below this the header, one message and the composer no longer fit. */
const MIN_HEIGHT = 320;

export function useStickyFill(
  ref: RefObject<HTMLElement | null>,
  gap: number,
  enabled = true,
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const scroller = element.closest<HTMLElement>("[data-workspace-scroll]");
    if (!scroller) return;

    let frame = 0;
    let written = -1;
    const measure = () => {
      frame = 0;
      const viewport = scroller.getBoundingClientRect();
      const top = element.getBoundingClientRect().top;
      const height = Math.round(
        Math.max(MIN_HEIGHT, viewport.bottom - gap - Math.max(top, viewport.top + gap)),
      );
      /* Once the panel has stuck, its height stops changing — and a write
         that changes nothing still costs a layout, every frame of a scroll.
         Only a real change is written. */
      if (height === written) return;
      written = height;
      element.style.height = `${height}px`;
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    measure();
    scroller.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    /* The overview landing, a section folding, focus mode — anything that
       moves the panel's top without a scroll. */
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      element.style.height = "";
    };
  }, [ref, gap, enabled]);
}
