"use client";

import { useEffect, useState } from "react";

type Flash = { direction: "up" | "down" | null; seq: number };

/**
 * Returns the flash class for a value that just ticked. The class paints
 * --positive-bg / --negative-bg for 400ms and decays; under
 * prefers-reduced-motion the stylesheet turns it into a static colour change
 * for the same window.
 *
 * The tick is picked up during render rather than in an effect, so a flash
 * never costs an extra paint.
 */
export function useFlash(seq: number, direction: "up" | "down" | "flat"): string {
  const [flash, setFlash] = useState<Flash>({ direction: null, seq });

  if (seq !== flash.seq) {
    setFlash({ direction: direction === "flat" ? null : direction, seq });
  }

  useEffect(() => {
    if (flash.direction === null) return;
    const timer = setTimeout(
      () => setFlash((current) => ({ ...current, direction: null })),
      400,
    );
    return () => clearTimeout(timer);
  }, [flash.direction, flash.seq]);

  return flash.direction === "up"
    ? "flash-up"
    : flash.direction === "down"
      ? "flash-down"
      : "";
}
