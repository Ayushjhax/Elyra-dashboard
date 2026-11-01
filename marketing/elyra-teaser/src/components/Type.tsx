import React from "react";
import { C, F } from "../theme";
import { EASE, prog, track } from "../lib/anim";
import { DirBlur } from "./DirBlur";

/* ---------------------------------------------------------------------------
   Kinetic type. A headline arrives line by line out of its own mask (fast
   attack, long settle), holds perfectly still — no blur, no drift — and
   leaves the same way. Motion blur is computed from the line's own travel,
   so it only exists while the type is moving.
--------------------------------------------------------------------------- */

export type HeadlineProps = {
  frame: number;
  lines: string[];
  x: number;
  /** Top of the first line's box, in film px. */
  y: number;
  size: number;
  enter: number;
  enterDur?: number;
  exit?: number;
  exitDur?: number;
  /** "mask" slides each line up out of a mask; "none" is already there. */
  enterStyle?: "mask" | "none";
  exitStyle?: "up" | "left" | "none";
  color?: string;
  weight?: number;
  lineHeight?: number;
  align?: "left" | "right";
  /** Optional per-line colour override (e.g. one accent word). */
  lineColors?: (string | undefined)[];
  tracking?: number;
};

export const Headline: React.FC<HeadlineProps> = ({
  frame,
  lines,
  x,
  y,
  size,
  enter,
  enterDur = 11,
  exit,
  exitDur = 9,
  enterStyle = "mask",
  exitStyle = "up",
  color = C.ivory,
  weight = 640,
  lineHeight = 1.02,
  align = "left",
  lineColors,
  tracking = -0.028,
}) => {
  if (frame < enter - 1) return null;
  if (exit !== undefined && frame > exit + exitDur + 1) return null;
  const lh = size * lineHeight;
  return (
    <>
      {lines.map((line, i) => {
        const stagger = i * 2;
        const pos = (f: number) => {
          const inT = enterStyle === "mask" ? prog(f, enter + stagger, enter + stagger + enterDur, EASE.out) : 1;
          let dy = (1 - inT) * lh * 1.42;
          let dx = 0;
          if (exit !== undefined && exitStyle !== "none") {
            const outT = prog(f, exit + stagger * 0.5, exit + stagger * 0.5 + exitDur, EASE.in);
            if (exitStyle === "up") dy -= outT * lh * 1.42;
            else dx -= outT * (size * 9);
          }
          return { dx, dy };
        };
        const now = pos(frame);
        const prev = pos(frame - 1);
        const masked = enterStyle === "mask" || exitStyle === "up";
        return (
          <DirBlur key={i} dx={now.dx - prev.dx} dy={now.dy - prev.dy}>
            <div
              style={{
                position: "absolute",
                left: align === "left" ? x : undefined,
                right: align === "right" ? 1920 - x : undefined,
                top: y + i * lh - size * 0.18,
                height: lh + size * 0.36,
                overflow: masked ? "hidden" : "visible",
                paddingLeft: size * 0.06,
                paddingRight: size * 0.12,
                marginLeft: -size * 0.06,
              }}
            >
              <div
                style={{
                  transform: `translate(${now.dx}px, ${now.dy + size * 0.18}px)`,
                  fontFamily: F.display,
                  fontWeight: weight,
                  fontSize: size,
                  lineHeight: `${lh}px`,
                  letterSpacing: `${tracking}em`,
                  color: lineColors?.[i] ?? color,
                  whiteSpace: "nowrap",
                }}
              >
                {line}
              </div>
            </div>
          </DirBlur>
        );
      })}
    </>
  );
};

/** Small uppercase film label (the brand's eyebrow treatment, at film size). */
export const Eyebrow: React.FC<{
  text: string;
  x: number;
  y: number;
  size?: number;
  color?: string;
  opacity?: number;
  style?: React.CSSProperties;
}> = ({ text, x, y, size = 30, color = C.stone, opacity = 1, style }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      fontFamily: F.sans,
      fontWeight: 500,
      fontSize: size,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color,
      opacity,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {text}
  </div>
);

/**
 * The discreet, readable disclosure used under illustrative and concept
 * shots. `kind` decides the words; position is the caller's.
 */
export const Disclosure: React.FC<{
  frame: number;
  from: number;
  to: number;
  text: string;
  x: number;
  y: number;
  accent?: boolean;
  size?: number;
}> = ({ frame, from, to, text, x, y, accent = false, size = 26 }) => {
  const o = Math.min(prog(frame, from, from + 8, EASE.brand), 1 - prog(frame, to - 6, to, EASE.brand));
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity: o,
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: F.sans,
        fontWeight: 500,
        fontSize: size,
        color: accent ? C.ivory : C.stone,
        whiteSpace: "nowrap",
        ...(accent
          ? {
              padding: `${size * 0.32}px ${size * 0.62}px`,
              borderRadius: 999,
              border: `1.5px solid ${C.borderAccent}`,
              background: "rgba(24,33,23,0.85)",
            }
          : null),
      }}
    >
      <span
        style={{
          width: size * 0.32,
          height: size * 0.32,
          borderRadius: 99,
          background: accent ? C.citron : C.stone,
          opacity: accent ? 1 : 0.7,
        }}
      />
      {text}
    </div>
  );
};

/** Fade helper for any block: in over [a,a+d], out over [b,b+d]. */
export const fadeWindow = (frame: number, a: number, b: number, d = 8) =>
  Math.min(prog(frame, a, a + d, EASE.brand), 1 - prog(frame, b, b + d, EASE.brand));

export { track };
