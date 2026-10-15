"use client";

import { useMemo } from "react";
import { qrModules, qrPath } from "@/lib/qr";
import { cn } from "@/lib/utils";

/**
 * A QR code, drawn as one SVG path (lib/qr.ts).
 *
 * Dark ink on a light ground whatever the theme: an inverted code is one many
 * phone cameras will not read.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const modules = useMemo(() => qrModules(value), [value]);
  const path = useMemo(() => qrPath(modules), [modules]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${modules.length} ${modules.length}`}
      shapeRendering="crispEdges"
      className={cn("size-44 rounded-card bg-text-primary text-surface-base", className)}
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
