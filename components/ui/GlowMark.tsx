"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The lemniscate — Elyra's one piece of illustration.

   A continuous loop: the agent watching a market that never closes. It is the
   only decorative drawing in the product, and it earns its place by appearing
   solely on surfaces that are otherwise empty — an empty state, the sign-in
   panel, a route with nothing in it yet. Never beside data.

   It is drawn as four stacked passes of the same path, which is what makes it
   read as light rather than as a line:

     halo    24px stroke, heavy blur, low alpha   the spill onto the surface
     glow     7px stroke, light blur              the bloom around the line
     core     1.75px stroke, gradient             the filament itself
     travel   a short bright segment on a lap     the light moving through it

   Colour comes from the palette through currentColor-free gradient stops that
   reference tokens directly, so this file still holds no hex.
--------------------------------------------------------------------------- */

/** Both lobes as one path, smooth through the crossing at (120, 70). */
const LEMNISCATE =
  "M120 70 C133 52 148 36 168 36 C191 36 208 51 208 70 C208 89 191 104 168 104 " +
  "C148 104 133 88 120 70 C107 52 92 36 72 36 C49 36 32 51 32 70 " +
  "C32 89 49 104 72 104 C92 104 107 88 120 70 Z";

export type MarkTone = "forest" | "agent";

/** Stop colours per tone. Forest is ambient; agent is the machine. */
const STOPS: Record<MarkTone, [string, string, string]> = {
  forest: ["var(--moss)", "var(--mist-sage)", "var(--sage)"],
  agent: ["var(--khaki)", "var(--cream-lime)", "var(--olive)"],
};

export function GlowMark({
  tone = "forest",
  /** The travelling highlight. On for hero surfaces, off where the mark is
      small enough that a moving dash would just be noise. */
  travel = true,
  className,
}: {
  tone?: MarkTone;
  travel?: boolean;
  className?: string;
}) {
  /* One id per instance: two marks on a page must not share filters. */
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const stroke = `mark-stroke-${raw}`;
  const halo = `mark-halo-${raw}`;
  const glow = `mark-glow-${raw}`;
  const [dim, bright, mid] = STOPS[tone];

  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 240 140"
      fill="none"
      className={cn("h-auto w-full", className)}
    >
      <defs>
        <linearGradient id={stroke} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={dim} />
          <stop offset="30%" stopColor={mid} />
          <stop offset="58%" stopColor={bright} />
          <stop offset="100%" stopColor={mid} />
        </linearGradient>

        {/* userSpaceOnUse so the blur radius is in viewBox units and does not
            change with the rendered size. */}
        <filter
          id={halo}
          filterUnits="userSpaceOnUse"
          x="-40"
          y="-40"
          width="320"
          height="220"
        >
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <filter
          id={glow}
          filterUnits="userSpaceOnUse"
          x="-40"
          y="-40"
          width="320"
          height="220"
        >
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>

      {/* The two points where the loop turns are its brightest — that is where
          the filament doubles back on itself. */}
      <g filter={`url(#${halo})`} opacity="0.5">
        <ellipse cx="34" cy="70" rx="16" ry="22" fill={mid} />
        <ellipse cx="206" cy="70" rx="16" ry="22" fill={bright} />
      </g>

      <path
        d={LEMNISCATE}
        stroke={`url(#${stroke})`}
        strokeWidth="24"
        strokeLinecap="round"
        filter={`url(#${halo})`}
        opacity="0.28"
      />
      <path
        d={LEMNISCATE}
        stroke={`url(#${stroke})`}
        strokeWidth="7"
        strokeLinecap="round"
        filter={`url(#${glow})`}
        opacity="0.55"
      />
      <path
        className="mark-draw"
        pathLength={1}
        d={LEMNISCATE}
        stroke={`url(#${stroke})`}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      {travel && (
        <path
          className="mark-travel"
          pathLength={1}
          d={LEMNISCATE}
          stroke={bright}
          strokeWidth="2.5"
          strokeLinecap="round"
          filter={`url(#${glow})`}
          opacity="0.8"
        />
      )}
    </svg>
  );
}
