"use client";

import { useMemo } from "react";
import { identicon, type IdenticonCorner, type IdenticonTone } from "@/lib/identicon";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   A wallet's mark, drawn. The pattern is lib/identicon.ts's; this only puts
   it on a forest disc inside a thin sage ring.

   `identity` null is the neutral mark — the same four tiles in one muted
   tone — shown while the session or the address is still loading, so the
   avatar never flashes a face that is not this wallet's.

   Decorative: whatever wears it carries the name.
--------------------------------------------------------------------------- */

const TONE: Record<IdenticonTone, string> = {
  cream: "var(--ivory)",
  mist: "var(--mist-sage)",
  sage: "var(--sage)",
  moss: "var(--moss)",
};

/* A 40-unit disc; four 11.5-unit tiles around its centre, 1.25 apart. */
const TILE = 11.5;
const GAP = 1.25;
const NEAR = 20 - GAP / 2 - TILE;
const FAR = 20 + GAP / 2;

/**
 * One tile, drawn as the top-left one: its outer corner at the origin, the
 * corner it turns toward the centre at (TILE, TILE), rounded by `inner`. The
 * others are mirrors, so the four rounded corners leave the star between them.
 */
function tilePath(corner: IdenticonCorner, inner: number): string {
  const s = TILE;
  const start =
    corner === "round"
      ? `M0 ${s * 0.45} A${s * 0.45} ${s * 0.45} 0 0 1 ${s * 0.45} 0`
      : corner === "cut"
        ? `M0 ${s * 0.38} L${s * 0.38} 0`
        : "M0 0";
  return `${start} H${s} V${s - inner} A${inner} ${inner} 0 0 1 ${s - inner} ${s} H0 Z`;
}

/** Top-left, top-right, bottom-right, bottom-left: clockwise, as the pattern orders them. */
const PLACEMENT = [
  `translate(${NEAR} ${NEAR})`,
  `translate(${FAR + TILE} ${NEAR}) scale(-1 1)`,
  `translate(${FAR + TILE} ${FAR + TILE}) scale(-1 -1)`,
  `translate(${NEAR} ${FAR + TILE}) scale(1 -1)`,
] as const;

export function Identicon({
  identity,
  size = 36,
  active = false,
  className,
}: {
  /** The wallet and the network it is on, or null while either is unknown. */
  identity: { network: string; address: string } | null;
  size?: number;
  /** Its menu is open: the ring lifts. */
  active?: boolean;
  className?: string;
}) {
  const network = identity?.network ?? null;
  const address = identity?.address ?? null;
  const pattern = useMemo(
    () => (network === null || address === null ? null : identicon(network, address)),
    [network, address],
  );

  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <circle
        cx="20"
        cy="20"
        r="19.25"
        strokeWidth="1.5"
        style={{
          fill: "var(--deep-forest)",
          stroke: active ? "var(--mist-sage)" : "color-mix(in srgb, var(--sage) 70%, transparent)",
          transition: "stroke var(--dur-fast) var(--ease)",
        }}
      />
      {PLACEMENT.map((transform, index) => {
        const tile = pattern?.tiles[index];
        return (
          <path
            key={index}
            transform={transform}
            d={tilePath(tile?.corner ?? "square", pattern?.star === "large" ? 6 : 4.5)}
            style={{ fill: tile === undefined ? "var(--border-strong)" : TONE[tile.tone] }}
          />
        );
      })}
    </svg>
  );
}
