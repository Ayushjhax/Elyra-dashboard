import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../theme";
import { hash } from "../lib/motion";

/* ---------------------------------------------------------------------------
   The stage behind slabs and hardware: the product's dark forest with one
   soft pool of sage light and a fine grain. It is a surface, not wallpaper —
   it never moves on its own except for the grain.
--------------------------------------------------------------------------- */

export const Backdrop: React.FC<{ glowX?: number; glowY?: number; glow?: number }> = ({
  glowX = 960,
  glowY = 520,
  glow = 1,
}) => {
  const f = useCurrentFrame();
  const gx = Math.floor(hash(Math.floor(f / 2)) * 200);
  const gy = Math.floor(hash(Math.floor(f / 2) + 7) * 200);
  return (
    <div style={{ position: "absolute", inset: 0, background: C.base, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: glow,
          background: `radial-gradient(1100px 760px at ${glowX}px ${glowY}px, rgba(69,112,61,0.22) 0%, rgba(46,81,41,0.10) 38%, rgba(16,23,16,0) 72%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(140% 120% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)",
        }}
      />
      <svg
        style={{ position: "absolute", left: -gx, top: -gy, opacity: 0.07, mixBlendMode: "screen" }}
        width={2200}
        height={1400}
      >
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </div>
  );
};
