import React from "react";
import { useCurrentFrame } from "remotion";
import { hash } from "../lib/motion";
import { C } from "../theme";

/**
 * The product's dark forest, lit from one soft source, with a moving grain so
 * a still frame never looks dead. Light and grain are the film's, not UI.
 */
export const Backdrop: React.FC<{ glowX?: number; glowY?: number; glow?: number }> = ({ glowX = 640, glowY = 340, glow = 1 }) => {
  const f = useCurrentFrame();
  const gx = Math.floor(hash(Math.floor(f / 2)) * 160);
  const gy = Math.floor(hash(Math.floor(f / 2) + 7) * 160);
  return (
    <div style={{ position: "absolute", inset: 0, background: C.base, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: glow,
          background: `radial-gradient(760px 520px at ${glowX}px ${glowY}px, rgba(69,112,61,0.24) 0%, rgba(46,81,41,0.10) 40%, rgba(16,23,16,0) 72%)`,
        }}
      />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(140% 120% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)" }} />
      <svg style={{ position: "absolute", left: -gx, top: -gy, opacity: 0.06, mixBlendMode: "screen" }} width={1500} height={960}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed="7" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </div>
  );
};
