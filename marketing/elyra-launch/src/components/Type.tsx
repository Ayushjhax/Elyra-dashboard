import React from "react";
import { useAbsFrame } from "../lib/frame";
import { C, F } from "../theme";
import { prog, mix, type Ease } from "../lib/motion";

/* ---------------------------------------------------------------------------
   Type. The film has exactly four large external headline events (hook,
   mobile reveal, evidence reveal, launch) — <Headline> is used for those and
   nothing else. Everything else is a small anchored <Label> (30–44 px) or the
   product's own interface text.
--------------------------------------------------------------------------- */

type HeadlineProps = {
  /** lines of words */
  lines: string[][];
  from: number;
  /** frame the headline is gone by (exit runs over the 10 frames before) */
  to: number;
  x: number;
  y: number;
  align?: "left" | "center" | "right";
  size: number;
  weight?: number;
  tracking?: number;
  lineHeight?: number;
  color?: string;
  /** frames between words */
  stagger?: number;
  /** frames for each word's reveal */
  dur?: number;
  exit?: "rise" | "cut" | "none";
  family?: string;
  /** colour override per word index (flattened) */
  accent?: Record<number, string>;
  /** settle from a slightly larger size (decisive landing, no bounce) */
  settle?: number;
};

export const Headline: React.FC<HeadlineProps> = ({
  lines,
  from,
  to,
  x,
  y,
  align = "left",
  size,
  weight = 700,
  tracking = -0.025,
  lineHeight = 0.98,
  color = C.ivory,
  stagger = 4,
  dur = 13,
  exit = "rise",
  family = F.display,
  accent = {},
  settle = 0,
}) => {
  const f = useAbsFrame();
  if (f < from || f >= to) return null;
  const exitT = exit === "rise" ? prog(f, to - 10, to, "in") : 0;
  const settleS = settle ? mix(1 + settle, 1, prog(f, from, from + 24, "land")) : 1;
  let idx = 0;
  return (
    <div
      style={{
        position: "absolute",
        left: align === "left" ? x : align === "center" ? x - 960 : undefined,
        right: align === "right" ? 1920 - x : undefined,
        top: y,
        width: align === "center" ? 1920 : undefined,
        textAlign: align,
        fontFamily: family,
        fontWeight: weight,
        fontSize: size,
        lineHeight,
        letterSpacing: `${tracking}em`,
        color,
        transform: `scale(${settleS})`,
        transformOrigin: align === "center" ? "50% 50%" : align === "left" ? "0% 50%" : "100% 50%",
        whiteSpace: "nowrap",
      }}
    >
      {lines.map((words, li) => (
        <div key={li} style={{ display: "block" }}>
          {words.map((w, wi) => {
            const i = idx++;
            const start = from + i * stagger;
            const t = prog(f, start, start + dur, "land");
            const yIn = (1 - t) * 108;
            const yOut = exitT * -108;
            return (
              <span
                key={wi}
                style={{
                  display: "inline-block",
                  overflow: "hidden",
                  verticalAlign: "top",
                  paddingBottom: "0.08em",
                  marginBottom: "-0.08em",
                  marginRight: wi < words.length - 1 ? "0.24em" : 0,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    transform: `translateY(${yIn + yOut}%)`,
                    color: accent[i] ?? color,
                  }}
                >
                  {w}
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/* ---- Anchored label -------------------------------------------------------
   Small copy that names what the viewer is looking at. When `anchor` is set,
   a hairline runs from the label to a dot on the actual control. */

type LabelProps = {
  from: number;
  to: number;
  x: number;
  y: number;
  text: string;
  eyebrow?: string;
  align?: "left" | "right";
  size?: number;
  anchor?: [number, number];
  /** where the leader leaves the label block, relative to (x, y) */
  leaderFrom?: [number, number];
  width?: number;
  /** flat backing plate (surface-base, 1px border) — on by default */
  plate?: boolean;
};

export const Label: React.FC<LabelProps> = ({
  from,
  to,
  x,
  y,
  text,
  eyebrow,
  align = "left",
  size = 38,
  anchor,
  leaderFrom,
  width,
  plate = true,
}) => {
  const f = useAbsFrame();
  if (f < from || f >= to) return null;
  const tin = prog(f, from, from + 12, "land");
  const tout = prog(f, to - 8, to, "in");
  const vis = tin * (1 - tout);
  const line = prog(f, from, from + 10, "land") * (1 - tout);
  const lf: [number, number] = leaderFrom ?? [align === "left" ? -18 : 18, size * 0.62 + (eyebrow ? 34 : 0)];
  const sx = x + lf[0];
  const sy = y + lf[1];
  return (
    <>
      {anchor && (
        <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1920} height={1080}>
          <line
            x1={sx}
            y1={sy}
            x2={mix(sx, anchor[0], line)}
            y2={mix(sy, anchor[1], line)}
            stroke={C.ivory}
            strokeOpacity={0.55}
            strokeWidth={1.5}
          />
          <circle cx={anchor[0]} cy={anchor[1]} r={6 * line} fill={C.lime} />
          <circle cx={anchor[0]} cy={anchor[1]} r={13 * line} fill="none" stroke={C.lime} strokeOpacity={0.45} strokeWidth={1.5} />
        </svg>
      )}
      <div
        style={{
          position: "absolute",
          left: align === "left" ? x : undefined,
          right: align === "right" ? 1920 - x : undefined,
          top: y,
          width,
          textAlign: align,
          opacity: vis,
          transform: `translateY(${(1 - tin) * 14}px)`,
          ...(plate
            ? {
                background: "rgba(16, 23, 16, 0.9)",
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "16px 22px 18px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              }
            : {}),
        }}
      >
        {eyebrow && (
          <div
            style={{
              fontFamily: F.sans,
              fontWeight: 600,
              fontSize: 22,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: C.citron,
              marginBottom: 12,
            }}
          >
            {eyebrow}
          </div>
        )}
        <div
          style={{
            fontFamily: F.sans,
            fontWeight: 500,
            fontSize: size,
            lineHeight: 1.18,
            color: C.ivory,
            letterSpacing: "-0.005em",
          }}
        >
          {text}
        </div>
      </div>
    </>
  );
};

/* ---- Focus brackets -------------------------------------------------------
   Film-level corner marks (clearly not product UI) that lock onto a region. */

export const Brackets: React.FC<{
  rect: [number, number, number, number];
  opacity?: number;
  len?: number;
  color?: string;
  stroke?: number;
}> = ({ rect, opacity = 1, len = 26, color = C.lime, stroke = 3 }) => {
  const [x, y, w, h] = rect;
  const l = Math.min(len, w / 3, h / 3);
  const d = [
    `M${x} ${y + l} V${y} H${x + l}`,
    `M${x + w - l} ${y} H${x + w} V${y + l}`,
    `M${x + w} ${y + h - l} V${y + h} H${x + w - l}`,
    `M${x + l} ${y + h} H${x} V${y + h - l}`,
  ].join(" ");
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity }} width={1920} height={1080}>
      <path d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="square" />
    </svg>
  );
};

/** Interpolate between bracket rects with an ease. */
export function rectAt(
  keys: [number, [number, number, number, number], Ease?][],
  f: number,
): [number, number, number, number] {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (f < keys[i][0]) {
      const [fa, ra] = keys[i - 1];
      const [fb, rb, e] = keys[i];
      const t = prog(f, fa, fb, e ?? "land");
      return [mix(ra[0], rb[0], t), mix(ra[1], rb[1], t), mix(ra[2], rb[2], t), mix(ra[3], rb[3], t)];
    }
  }
  return keys[keys.length - 1][1];
}
