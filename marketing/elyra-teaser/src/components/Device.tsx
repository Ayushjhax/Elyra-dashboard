import React from "react";
import { C, FILM } from "../theme";
import { DirBlur } from "./DirBlur";

/* ---------------------------------------------------------------------------
   A Seeker-style Android handset: a slim graphite body, thin even bezels and
   a small centred punch-hole camera. The screen is laid out in dp — the
   capture's native 1200×2670 px at the Seeker's density is 412×917 dp — so
   a screenshot fills it at its own aspect ratio and is never stretched.

   Placement is in film pixels: (x, y) is the device's centre and `s` is film
   pixels per dp. dpToFilm maps a point on the screen to the frame, which is
   what lets a match cut land on an exact pixel of the interface.
--------------------------------------------------------------------------- */

export const SCREEN_W = 412;
export const SCREEN_H = 917;
export const BEZEL = 9;
export const BODY_W = SCREEN_W + BEZEL * 2;
export const BODY_H = SCREEN_H + BEZEL * 2;
const BODY_R = 46;
const SCREEN_R = 38;

export type Placement = {
  x: number;
  y: number;
  s: number;
  opacity?: number;
};

export function dpToFilm(p: Placement, dpX: number, dpY: number): { x: number; y: number } {
  return {
    x: p.x + (BEZEL + dpX - BODY_W / 2) * p.s,
    y: p.y + (BEZEL + dpY - BODY_H / 2) * p.s,
  };
}

/** A placement that puts screen point (dpX, dpY) at film point (fx, fy). */
export function placeScreenPoint(dpX: number, dpY: number, fx: number, fy: number, s: number): Placement {
  return {
    x: fx - (BEZEL + dpX - BODY_W / 2) * s,
    y: fy - (BEZEL + dpY - BODY_H / 2) * s,
    s,
  };
}

/** Film-space height of the whole device at a scale. */
export const deviceHeight = (s: number) => BODY_H * s;

export const Device: React.FC<{
  p: Placement;
  /** Per-frame film displacement, for motion blur while the device travels. */
  motion?: { dx: number; dy: number };
  children: React.ReactNode;
  /** Draw the soft staging shadow under the handset. */
  shadow?: boolean;
}> = ({ p, motion, children, shadow = true }) => {
  const body = (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: BODY_W,
        height: BODY_H,
        transformOrigin: "0 0",
        transform: `translate(${p.x}px, ${p.y}px) scale(${p.s}) translate(${-BODY_W / 2}px, ${-BODY_H / 2}px)`,
        opacity: p.opacity ?? 1,
      }}
    >
      {shadow && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: BODY_R,
            boxShadow: `0 ${30}px ${90}px ${FILM.deviceShadow}, 0 ${8}px ${24}px rgba(0,0,0,0.45)`,
          }}
        />
      )}
      {/* Side keys: power and volume on the right edge. */}
      <div style={{ position: "absolute", right: -2.2, top: 190, width: 3, height: 64, borderRadius: 2, background: "#1d201d" }} />
      <div style={{ position: "absolute", right: -2.2, top: 280, width: 3, height: 38, borderRadius: 2, background: "#1d201d" }} />
      {/* Body: graphite with a fine lit edge — staging light, not product. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: BODY_R,
          background: `linear-gradient(150deg, #2b2f2b 0%, ${FILM.deviceBody} 22%, #0b0c0b 60%, #1e221e 100%)`,
          boxShadow: `inset 0 0 0 1.2px ${FILM.deviceEdgeLight}, inset 0 0 0 3px ${FILM.deviceEdgeDark}`,
        }}
      />
      {/* Screen */}
      <div
        style={{
          position: "absolute",
          left: BEZEL,
          top: BEZEL,
          width: SCREEN_W,
          height: SCREEN_H,
          borderRadius: SCREEN_R,
          overflow: "hidden",
          background: C.base,
          isolation: "isolate",
        }}
      >
        {children}
        {/* Punch-hole camera */}
        <div
          style={{
            position: "absolute",
            left: SCREEN_W / 2 - 5.5,
            top: 11,
            width: 11,
            height: 11,
            borderRadius: 6,
            background: FILM.cameraHole,
            boxShadow: "inset 0 0 0 1px rgba(247,248,234,0.06)",
          }}
        />
      </div>
    </div>
  );
  if (!motion) return body;
  return (
    <DirBlur dx={motion.dx} dy={motion.dy}>
      {body}
    </DirBlur>
  );
};
