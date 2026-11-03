import React from "react";
import { Img, Sequence, staticFile } from "remotion";
import { FrameOffset, useAbsFrame } from "../lib/frame";
import { Video } from "@remotion/media";
import { C } from "../theme";
import { camAt, type Cam, type CamKey, type NumKey, track } from "../lib/motion";

/* ---------------------------------------------------------------------------
   A Shot is a window onto one piece of captured product UI.

   Sources are the Seeker captures, conformed to 1200 × 2520 portrait at
   60 fps (status bar and gesture strip removed). They are only ever scaled
   uniformly — never stretched — and the camera decides which part of the
   portrait source fills the landscape window.

   Footage: { v: "02-ask-stream.mp4", t: trimBefore (source frames), r: rate }
   Still:   { img: "stills/report-top.png" }  (same 1200 × 2520 geometry
             unless w/h say otherwise)
--------------------------------------------------------------------------- */

export const SRC_W = 1200;
export const SRC_H = 2520;

export type Src = { v: string; t?: number; r?: number } | { img: string; w?: number; h?: number };

export type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** corner radius in output px */
  r?: number;
  /** 1px product border (border-subtle) */
  border?: boolean;
  /** the product's one floating shadow, shadow-pop */
  shadow?: boolean;
};

export const FULL: Box = { x: 0, y: 0, w: 1920, h: 1080 };

export function srcSize(src: Src): { w: number; h: number } {
  if ("img" in src) return { w: src.w ?? SRC_W, h: src.h ?? SRC_H };
  return { w: SRC_W, h: SRC_H };
}

export const Media: React.FC<{ src: Src }> = ({ src }) => {
  const { w, h } = srcSize(src);
  const style: React.CSSProperties = { width: w, height: h, display: "block" };
  if ("img" in src) return <Img src={staticFile(src.img)} style={style} />;
  return (
    <Video
      src={staticFile(`footage/${src.v}`)}
      trimBefore={src.t ?? 0}
      playbackRate={src.r ?? 1}
      muted
      objectFit="fill"
      style={style}
    />
  );
};

/** Map a source point to output coordinates for a camera inside a box. */
export function mapPoint(cam: Cam, box: Box, sx: number, sy: number): [number, number] {
  return [box.x + box.w / 2 + (sx - cam.x) * cam.s, box.y + box.h / 2 + (sy - cam.y) * cam.s];
}

export type ShotCtx = {
  /** absolute film frame */
  f: number;
  cam: Cam;
  box: Box;
  map: (sx: number, sy: number) => [number, number];
};

type ShotProps = {
  from: number;
  to: number;
  src: Src;
  cam: CamKey[];
  box?: Box | ((f: number) => Box);
  /** darken the source (0–1), optionally keyed over absolute frames */
  dim?: number | NumKey[];
  /** overall opacity, keyed over absolute frames */
  opacity?: NumKey[];
  /** overlays drawn above the window, in output coordinates */
  children?: (ctx: ShotCtx) => React.ReactNode;
  name?: string;
  /** colour beyond the source edges (match the screen's own background) */
  bg?: string;
};

const ShotInner: React.FC<Omit<ShotProps, "to" | "name">> = ({ from, src, cam, box, dim, opacity, children, bg }) => {
  const f = useAbsFrame();
  const b = typeof box === "function" ? box(f) : box ?? FULL;
  const c = camAt(cam, f);
  const d = dim === undefined ? 0 : typeof dim === "number" ? dim : track(dim, f);
  const o = opacity ? track(opacity, f) : 1;
  const ctx: ShotCtx = { f, cam: c, box: b, map: (sx, sy) => mapPoint(c, b, sx, sy) };
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <div
        style={{
          position: "absolute",
          left: b.x,
          top: b.y,
          width: b.w,
          height: b.h,
          overflow: "hidden",
          borderRadius: b.r ?? 0,
          background: bg ?? C.base,
          boxShadow: b.shadow ? "0 8px 24px rgba(0,0,0,0.45)" : undefined,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transformOrigin: "0 0",
            transform: `translate(${b.w / 2 - c.x * c.s}px, ${b.h / 2 - c.y * c.s}px) scale(${c.s})`,
          }}
        >
          <Media src={src} />
        </div>
        {d > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(8, 12, 8, ${d})` }} />}
        {b.border && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: b.r ?? 0,
              border: `1.5px solid ${C.border}`,
              pointerEvents: "none",
            }}
          />
        )}
      </div>
      {children?.(ctx)}
    </div>
  );
};

export const Shot: React.FC<ShotProps> = ({ to, name, ...rest }) => (
  <Sequence from={rest.from} durationInFrames={to - rest.from} layout="none" name={name}>
    <FrameOffset.Provider value={rest.from}>
      <ShotInner {...rest} />
    </FrameOffset.Provider>
  </Sequence>
);
