import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { hash, prog } from "../lib/motion";
import { C, CJK, F } from "../theme";

/* ---------------------------------------------------------------------------
   Bars 1–2 (frames 0–200). The hook: a counter races from 01 to 20 on the
   first beat's ticks, lands on beat 3 as "20 features.", and "8 days."
   slams in on the next downbeat. Then the frame zooms through into the
   product.

   The claim is the repository's own record: 20 user-facing features first
   landed on main between 18 and 25 November 2026.
--------------------------------------------------------------------------- */

const display = `${F.display}, ${CJK}`;

export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const counting = f < 50;
  const n = Math.min(20, 1 + Math.floor(f / 2.45));
  const land = prog(f, 50, 62, "land");
  const slam = prog(f, 100, 110, "land");
  const shake = f >= 100 && f < 106 ? (hash(f) - 0.5) * 10 * (1 - (f - 100) / 6) : 0;
  const through = prog(f, 184, 200, "in");
  return (
    <AbsoluteFill>
      <Backdrop glow={0.55 + 0.45 * prog(f, 0, 60, "out")} />
      <AbsoluteFill
        style={{
          transform: `translate(${shake}px, ${shake * 0.6}px) scale(${1 + through * 4.5})`,
          opacity: 1 - prog(f, 190, 200, "lin"),
          filter: through > 0 ? `blur(${through * 6}px)` : undefined,
        }}
      >
        {counting ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: display,
              fontWeight: 800,
              fontSize: 300,
              letterSpacing: "-0.04em",
              color: C.ivory,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {String(n).padStart(2, "0")}
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <div
              style={{
                fontFamily: display,
                fontWeight: 800,
                fontSize: 138,
                letterSpacing: "-0.035em",
                lineHeight: 1,
                color: C.ivory,
                transform: `scale(${1.1 - 0.1 * land})`,
              }}
            >
              20 features.
            </div>
            <div style={{ height: 150, overflow: "hidden" }}>
              <div
                style={{
                  fontFamily: display,
                  fontWeight: 800,
                  fontSize: 138,
                  letterSpacing: "-0.035em",
                  lineHeight: 1.05,
                  color: C.citron,
                  transform: `translateY(${(1 - slam) * 110}%) scale(${1 + (1 - slam) * 0.06})`,
                  opacity: f >= 100 ? 1 : 0,
                }}
              >
                8 days.
              </div>
            </div>
            <div
              style={{
                marginTop: 18,
                fontFamily: F.sans,
                fontWeight: 500,
                fontSize: 23,
                color: C.stone,
                opacity: prog(f, 140, 156, "out"),
                transform: `translateY(${(1 - prog(f, 140, 156, "land")) * 10}px)`,
              }}
            >
              Everything new in Elyra, 18 to 25 November.
            </div>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
