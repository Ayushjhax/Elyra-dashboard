import React from "react";
import { C, F, FILM } from "../theme";

/* ---------------------------------------------------------------------------
   A Seeker-style Android handset, built at the capture's own pixel geometry:
   the screen is 1200 × 2670 device px (the Seeker's panel), of which the
   conformed footage fills 1200 × 2520 between a clean status bar (96) and the
   gesture strip (54). The status bar is redrawn because the captures' own
   bar carried personal notification icons.

   The body is sized in output pixels (s × device px) rather than CSS-scaled,
   so the footage is rasterised at final resolution even inside a 3D
   transform. Thickness is a stack of offset body outlines, which reads as a
   solid extrusion at the small angles the film uses.
--------------------------------------------------------------------------- */

export const BODY_W = 1268;
export const BODY_H = 2738;
const BODY_R = 150;
const BEZEL = 34;
export const SCREEN_W = 1200;
export const SCREEN_H = 2670;
const SCREEN_R = 112;
export const STATUS = 96;
const GESTURE = 54;
const THICK = 150;
const PERSPECTIVE = 3200;

export type DeviceT = { x: number; y: number; s: number; rx?: number; ry?: number; rz?: number };
export type StatusStyle = "asset" | "home";

const rad = (d: number) => (d * Math.PI) / 180;

/** Project a point of the 1200 × 2520 content area to output coordinates. */
export function deviceMap(t: DeviceT, px: number, py: number): [number, number] {
  const s = t.s;
  // relative to body centre, in output px
  let X = (BEZEL + px - BODY_W / 2) * s;
  let Y = (BEZEL + STATUS + py - BODY_H / 2) * s;
  let Z = 0;
  // CSS applies rotateZ, then rotateY, then rotateX to the point
  const rz = rad(t.rz ?? 0), ry = rad(t.ry ?? 0), rx = rad(t.rx ?? 0);
  [X, Y] = [X * Math.cos(rz) - Y * Math.sin(rz), X * Math.sin(rz) + Y * Math.cos(rz)];
  [X, Z] = [X * Math.cos(ry) + Z * Math.sin(ry), -X * Math.sin(ry) + Z * Math.cos(ry)];
  [Y, Z] = [Y * Math.cos(rx) - Z * Math.sin(rx), Y * Math.sin(rx) + Z * Math.cos(rx)];
  const p = PERSPECTIVE / (PERSPECTIVE - Z);
  return [t.x + X * p, t.y + Y * p];
}

/** The device transform that puts content point (cx, cy) at output (ox, oy) at scale s, unrotated. */
export function deviceFor(cx: number, cy: number, s: number, ox = 960, oy = 540): DeviceT {
  return {
    x: ox - (BEZEL + cx - BODY_W / 2) * s,
    y: oy - (BEZEL + STATUS + cy - BODY_H / 2) * s,
    s,
  };
}

const StatusBar: React.FC<{ style: StatusStyle; time: string }> = ({ style, time }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      width: SCREEN_W,
      height: STATUS,
      background:
        style === "home" ? "linear-gradient(180deg, rgb(38,48,27) 0%, rgb(21,32,18) 100%)" : C.base,
    }}
  >
    <div
      style={{
        position: "absolute",
        left: 64,
        top: 22,
        fontFamily: F.sans,
        fontWeight: 500,
        fontSize: 40,
        color: C.ivory,
        letterSpacing: 0.5,
      }}
    >
      {time}
    </div>
    {/* punch-hole camera */}
    <div
      style={{
        position: "absolute",
        left: SCREEN_W / 2 - 22,
        top: 26,
        width: 44,
        height: 44,
        borderRadius: 22,
        background: "radial-gradient(circle at 40% 38%, #1c2a33 0%, #050607 55%)",
        boxShadow: "0 0 0 3px #0b0c0b",
      }}
    />
    {/* wifi + battery */}
    <svg style={{ position: "absolute", right: 64, top: 28 }} width={150} height={40} viewBox="0 0 150 40">
      <path
        d="M30 34 L4 10 A38 38 0 0 1 56 10 Z"
        fill={C.ivory}
        opacity={0.95}
      />
      <rect x={84} y={6} width={50} height={28} rx={7} fill="none" stroke={C.ivory} strokeWidth={3} opacity={0.9} />
      <rect x={89} y={11} width={36} height={18} rx={3} fill={C.ivory} />
      <rect x={136} y={14} width={5} height={12} rx={2} fill={C.ivory} opacity={0.9} />
    </svg>
  </div>
);

const GestureStrip: React.FC<{ style: StatusStyle }> = ({ style }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: SCREEN_H - GESTURE,
      width: SCREEN_W,
      height: GESTURE,
      background: style === "home" ? "rgb(22,32,22)" : C.base,
    }}
  >
    <div
      style={{
        position: "absolute",
        left: SCREEN_W / 2 - 130,
        top: 22,
        width: 260,
        height: 11,
        borderRadius: 6,
        background: "rgba(247,248,234,0.78)",
      }}
    />
  </div>
);

type DeviceProps = {
  t: DeviceT;
  status?: StatusStyle;
  time?: string;
  /** content in the 1200 × 2520 app area */
  children: React.ReactNode;
  /** soft contact shadow on the ground plane */
  shadow?: number;
};

export const Device: React.FC<DeviceProps> = ({ t, status = "home", time = "12:33", children, shadow = 1 }) => {
  const s = t.s;
  const W = BODY_W * s;
  const Hh = BODY_H * s;
  const layers = 12;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        perspective: PERSPECTIVE,
        perspectiveOrigin: `${t.x}px ${t.y}px`,
        pointerEvents: "none",
      }}
    >
      {shadow > 0 && (
        <div
          style={{
            position: "absolute",
            left: t.x - W * 0.62,
            top: t.y - Hh * 0.52,
            width: W * 1.24,
            height: Hh * 1.12,
            borderRadius: "50%",
            background: "radial-gradient(closest-side, rgba(0,0,0,0.55), rgba(0,0,0,0))",
            transform: `translate(${(t.ry ?? 0) * -3 * s * 10}px, ${40 * s}px)`,
            opacity: shadow,
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: t.x - W / 2,
          top: t.y - Hh / 2,
          width: W,
          height: Hh,
          transformStyle: "preserve-3d",
          transform: `rotateX(${t.rx ?? 0}deg) rotateY(${t.ry ?? 0}deg) rotateZ(${t.rz ?? 0}deg)`,
        }}
      >
        {/* extrusion: stacked outlines behind the front face */}
        {Array.from({ length: layers }).map((_, i) => {
          const z = -((i + 1) / layers) * THICK * s;
          const shade = 0.55 + 0.45 * (1 - i / layers);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: BODY_R * s,
                transform: `translateZ(${z}px)`,
                background: `linear-gradient(100deg, ${FILM.graphiteEdge} 0%, #23261f 30%, #121411 70%, ${FILM.graphiteEdge} 100%)`,
                filter: `brightness(${shade})`,
              }}
            />
          );
        })}
        {/* side keys, protruding from the right rail at mid-depth */}
        {[
          [720, 230],
          [1040, 360],
        ].map(([y, h], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: W - 2 * s,
              top: y * s,
              width: 12 * s,
              height: h * s,
              borderRadius: 6 * s,
              transform: `translateZ(${-THICK * 0.5 * s}px)`,
              background: `linear-gradient(90deg, #2c302b, #4a4f48 60%, #20231f)`,
            }}
          />
        ))}
        {/* front face: metallic rim, black glass, screen */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: BODY_R * s,
            background: `linear-gradient(135deg, #5b6058 0%, #2a2d29 22%, #161815 50%, #2f332d 78%, #61665d 100%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 7 * s,
            borderRadius: (BODY_R - 7) * s,
            background: "#040504",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: BEZEL * s,
            top: BEZEL * s,
            width: SCREEN_W * s,
            height: SCREEN_H * s,
            borderRadius: SCREEN_R * s,
            overflow: "hidden",
            background: C.base,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: SCREEN_W,
              height: SCREEN_H,
              transformOrigin: "0 0",
              transform: `scale(${s})`,
            }}
          >
            <div style={{ position: "absolute", left: 0, top: STATUS, width: SCREEN_W, height: 2520, overflow: "hidden" }}>
              {children}
            </div>
            <StatusBar style={status} time={time} />
            <GestureStrip style={status} />
          </div>
        </div>
      </div>
    </div>
  );
};
