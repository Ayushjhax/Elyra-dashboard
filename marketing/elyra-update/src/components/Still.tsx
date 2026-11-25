import React from "react";
import { Img, OffthreadVideo, staticFile } from "remotion";
import { C } from "../theme";

/* ---------------------------------------------------------------------------
   A window onto one real capture of the live website, staged as a card.

   Captures are 3200 × 1800 (1600 × 900 CSS pixels at 2x); the recording is
   1920 × 1080. `focus` is the source point at the card's centre and `scale`
   is output pixels per source pixel, so a capture is never stretched — only
   moved and uniformly scaled. Nothing in a capture is repainted.
--------------------------------------------------------------------------- */

export type Region = { x: number; y: number; w: number; h: number };

/** Output pixels per source pixel for a region to fill a card's width. */
export const fitScale = (region: Region, width: number) => width / region.w;

/** The centre of a region, as a focus point. */
export const centre = (region: Region) => ({ x: region.x + region.w / 2, y: region.y + region.h / 2 });

export const Still: React.FC<{
  src: string;
  width: number;
  height: number;
  focus: { x: number; y: number };
  scale: number;
  video?: { startFrom: number; size: { w: number; h: number } };
  size?: { w: number; h: number };
  radius?: number;
  shadow?: number;
  border?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ src, width, height, focus, scale, video, size = { w: 3200, h: 1800 }, radius = 16, shadow = 1, border = true, children, style }) => {
  const source = video?.size ?? size;
  const left = width / 2 - focus.x * scale;
  const top = height / 2 - focus.y * scale;
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: radius,
        overflow: "hidden",
        background: C.panel,
        border: border ? `1px solid ${C.border}` : undefined,
        boxShadow: shadow > 0 ? `0 ${30 * shadow}px ${70 * shadow}px rgba(0,0,0,${0.5 * shadow}), 0 ${6 * shadow}px ${18 * shadow}px rgba(0,0,0,${0.35 * shadow})` : undefined,
        ...style,
      }}
    >
      <div style={{ position: "absolute", left, top, width: source.w * scale, height: source.h * scale }}>
        {video ? (
          <OffthreadVideo src={staticFile(src)} startFrom={video.startFrom} muted style={{ width: "100%", height: "100%" }} />
        ) : (
          <Img src={staticFile(src)} style={{ width: "100%", height: "100%" }} />
        )}
      </div>
      {children}
    </div>
  );
};

/**
 * A citron outline drawn around one element of a capture, in source
 * coordinates, so it stays on the element under any camera move.
 */
export const Mark: React.FC<{
  region: Region;
  card: { width: number; height: number; focus: { x: number; y: number }; scale: number };
  t: number;
  pad?: number;
}> = ({ region, card, t, pad = 8 }) => {
  if (t <= 0) return null;
  const x = card.width / 2 + (region.x - card.focus.x) * card.scale - pad;
  const y = card.height / 2 + (region.y - card.focus.y) * card.scale - pad;
  const w = region.w * card.scale + pad * 2;
  const h = region.h * card.scale + pad * 2;
  const grow = 0.92 + 0.08 * t;
  return (
    <div
      style={{
        position: "absolute",
        left: x + (w * (1 - grow)) / 2,
        top: y + (h * (1 - grow)) / 2,
        width: w * grow,
        height: h * grow,
        border: `2px solid ${C.citron}`,
        borderRadius: 10,
        opacity: t,
        boxShadow: `0 0 0 4px rgba(210,220,118,${0.12 * t})`,
      }}
    />
  );
};
