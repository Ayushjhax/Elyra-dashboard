import type { PointerEvent } from "react";

/** Update only the lit surface, without React state or a listener per row. */
export function trackMetallicPointer(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const surface = target.closest<HTMLElement>(".metallic");
  if (!surface) return;
  const rect = surface.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  surface.style.setProperty("--metal-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  surface.style.setProperty("--metal-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
}
