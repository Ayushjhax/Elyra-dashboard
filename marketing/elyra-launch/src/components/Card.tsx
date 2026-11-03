import React from "react";
import { Img, staticFile } from "remotion";
import { C } from "../theme";

/* ---------------------------------------------------------------------------
   A Card lifts one region out of a real capture and stages it as an object:
   a rounded product panel that can enter in 3D, reveal top-down or
   left-right, and carry overlays. The pixels are the capture's own — the
   card never re-typesets or repaints product UI. Scale is uniform.

   rect is in the still's coordinates (1200 × 2520 for screen stills).
--------------------------------------------------------------------------- */

export type Rect = [number, number, number, number];

export type CardProps = {
  src: string;
  rect: Rect;
  /** output width in px; scale = w / rect width */
  w: number;
  /** output centre */
  x: number;
  y: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  scale?: number;
  opacity?: number;
  /** 0..1 — reveal from the top edge down */
  reveal?: number;
  /** 0..1 — reveal from the left edge across */
  revealX?: number;
  blur?: number;
  /** darken (0..1) — for cards pushed into the background */
  dim?: number;
  radius?: number;
  border?: boolean;
  shadow?: boolean;
  imgW?: number;
  imgH?: number;
  /** overlays, in card-local output px (0..w, 0..h) */
  children?: (geo: { w: number; h: number; s: number; at: (sx: number, sy: number) => [number, number] }) => React.ReactNode;
};

export function cardSize(rect: Rect, w: number) {
  const s = w / rect[2];
  return { s, h: rect[3] * s };
}

export const Card: React.FC<CardProps> = ({
  src,
  rect,
  w,
  x,
  y,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  scale = 1,
  opacity = 1,
  reveal = 1,
  revealX = 1,
  blur = 0,
  dim = 0,
  radius = 26,
  border = true,
  shadow = true,
  imgW = 1200,
  imgH = 2520,
  children,
}) => {
  if (opacity <= 0.001) return null;
  const { s, h } = cardSize(rect, w);
  const clip = `inset(0 ${(1 - revealX) * 100}% ${(1 - reveal) * 100}% 0 round ${radius}px)`;
  const at = (sx: number, sy: number): [number, number] => [(sx - rect[0]) * s, (sy - rect[1]) * s];
  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        opacity,
        transformStyle: "preserve-3d",
        transform: `translate3d(0, 0, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${scale})`,
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
      }}
    >
      {shadow && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: w * revealX,
            height: h * reveal,
            borderRadius: radius,
            boxShadow: "0 8px 24px rgba(0,0,0,0.45), 0 30px 80px rgba(0,0,0,0.35)",
          }}
        />
      )}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: radius, background: C.panel, clipPath: clip }}>
        <Img
          src={staticFile(src)}
          style={{ position: "absolute", left: -rect[0] * s, top: -rect[1] * s, width: imgW * s, height: imgH * s, maxWidth: "none" }}
        />
        {dim > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(8,12,8,${dim})` }} />}
        {border && <div style={{ position: "absolute", inset: 0, borderRadius: radius, border: `1.5px solid ${C.borderStrong}` }} />}
      </div>
      {children && <div style={{ position: "absolute", inset: 0, clipPath: clip }}>{children({ w, h, s, at })}</div>}
    </div>
  );
};

/** A 3D stage: everything inside shares one perspective. */
export const Stage: React.FC<{ children: React.ReactNode; perspective?: number; origin?: string }> = ({
  children,
  perspective = 2400,
  origin = "50% 50%",
}) => (
  <div style={{ position: "absolute", inset: 0, perspective, perspectiveOrigin: origin, transformStyle: "preserve-3d" }}>{children}</div>
);
