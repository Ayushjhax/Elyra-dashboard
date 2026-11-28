import React from "react";
import { FILM } from "../theme";

/**
 * The viewer's hand on the real screen: an arrow pointer and the ring a click
 * leaves. Film furniture, not UI — it is drawn over a capture, never into it.
 * `press` is 0..1 through a click: the arrow dips and a ring opens.
 */
export const Pointer: React.FC<{ x: number; y: number; press?: number; opacity?: number; scale?: number }> = ({ x, y, press = 0, opacity = 1, scale = 1 }) => {
  if (opacity <= 0) return null;
  const dip = press > 0 && press < 1 ? Math.sin(Math.PI * Math.min(1, press * 2)) : 0;
  const ring = press > 0 ? press : 0;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, opacity, pointerEvents: "none" }}>
      {ring > 0 && ring < 1 && (
        <div
          style={{
            position: "absolute",
            left: -26 * ring - 4,
            top: -26 * ring - 4,
            width: 52 * ring + 8,
            height: 52 * ring + 8,
            borderRadius: 999,
            border: `2px solid rgba(247,248,234,${0.85 * (1 - ring)})`,
            background: `rgba(247,248,234,${0.18 * (1 - ring)})`,
          }}
        />
      )}
      <svg
        width={30 * scale}
        height={30 * scale}
        viewBox="0 0 24 24"
        style={{ position: "absolute", left: -4 * scale, top: -3 * scale, transform: `scale(${1 - 0.14 * dip})`, transformOrigin: "4px 3px", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))" }}
      >
        <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" fill={FILM.pointer} stroke={FILM.pointerEdge} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
};
