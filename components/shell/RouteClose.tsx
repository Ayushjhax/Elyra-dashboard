"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The way out of a route column, back to the chart alone.
 *
 * A link to Home rather than `router.back()`: history is not where you came
 * from in a terminal — you may have arrived here from three other routes — and
 * Home is the one place this always means.
 *
 * It lives in each route panel's own header rather than in a strip the shell
 * wraps around it, because every route already has a header row with an empty
 * right end, and a second bar above it would just be a second bar.
 */
export function RouteClose({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Close this section and return to the chart"
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-chip",
        "text-text-muted transition-colors duration-[var(--dur-fast)] ease-brand",
        "hover:bg-surface-hover hover:text-text-primary",
        className,
      )}
    >
      <X size={16} strokeWidth={1.5} aria-hidden />
    </Link>
  );
}
