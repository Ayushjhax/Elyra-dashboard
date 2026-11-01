import React from "react";
import { C, F } from "../theme";
import { EASE, prog } from "../lib/anim";
import { DirBlur } from "../components/DirBlur";

/* ---------------------------------------------------------------------------
   The opening type match (frames 0–199).

   "Markets / move." → "Move with / clarity."
   Both statements are set left-aligned at the same size, so the word "move"
   can travel up exactly one line as "Markets" leaves through its mask, and
   become the first word of the second statement on the downbeat (frame 100)
   — no measuring, the geometry is shared.
--------------------------------------------------------------------------- */

const SIZE = 160;
const LH = Math.round(SIZE * 1.02);
const X = 96;
const TOP = 540 - LH; // two-line block, centred on the frame

const style = (color = C.ivory): React.CSSProperties => ({
  fontFamily: F.display,
  fontWeight: 640,
  fontSize: SIZE,
  lineHeight: `${LH}px`,
  letterSpacing: "-0.028em",
  color,
  whiteSpace: "nowrap",
});

/** A line inside its own mask; `dy` moves the type within it. */
const Masked: React.FC<{ top: number; dy: number; vy: number; children: React.ReactNode }> = ({ top, dy, vy, children }) => (
  <DirBlur dx={0} dy={vy}>
    <div style={{ position: "absolute", left: X - 12, top: top - SIZE * 0.2, height: LH + SIZE * 0.42, paddingLeft: 12, paddingRight: 30, overflow: "hidden" }}>
      <div style={{ ...style(), transform: `translateY(${dy + SIZE * 0.2}px)` }}>{children}</div>
    </div>
  </DirBlur>
);

export const TypeMatch: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame > 200) return null;

  if (frame < 100) {
    // Opening: legible on frame 0, with a fine tightening of the tracking for life.
    const settle = prog(frame, 0, 24, EASE.out);
    const tracking = -0.012 - 0.016 * settle;
    const outA = (f: number) => -prog(f, 89, 98, EASE.in) * LH * 1.42;
    const up = (f: number) => -prog(f, 89, 100, EASE.inOut) * LH;
    return (
      <>
        <Masked top={TOP} dy={outA(frame)} vy={outA(frame) - outA(frame - 1)}>
          <span style={{ letterSpacing: `${tracking}em` }}>Markets</span>
        </Masked>
        <DirBlur dx={0} dy={up(frame) - up(frame - 1)}>
          <div style={{ position: "absolute", left: X, top: TOP + LH + up(frame), ...style() }}>
            <span style={{ letterSpacing: `${tracking}em` }}>move.</span>
          </div>
        </DirBlur>
      </>
    );
  }

  // Frame 100 on: "Move" has landed; "with" and "clarity." rise into place.
  const inWith = (f: number) => (1 - prog(f, 100, 110, EASE.out)) * LH * 1.42;
  const inClarity = (f: number) => (1 - prog(f, 102, 113, EASE.out)) * LH * 1.42;
  const out1 = (f: number) => -prog(f, 186, 195, EASE.in) * LH * 1.42;
  const out2 = (f: number) => -prog(f, 187, 196, EASE.in) * LH * 1.42;
  const y1 = (f: number) => out1(f);
  const yWith = (f: number) => inWith(f) + out1(f);
  const y2 = (f: number) => inClarity(f) + out2(f);
  return (
    <>
      <DirBlur dx={0} dy={y1(frame) - y1(frame - 1)}>
        <div style={{ position: "absolute", left: X - 12, top: TOP - SIZE * 0.2, height: LH + SIZE * 0.42, paddingLeft: 12, paddingRight: 30, overflow: "hidden" }}>
          <div style={{ ...style(), transform: `translateY(${SIZE * 0.2}px)`, display: "flex" }}>
            <span style={{ transform: `translateY(${y1(frame)}px)`, display: "inline-block" }}>Move</span>
            <span style={{ display: "inline-block", width: "0.26em" }} />
            <span style={{ transform: `translateY(${yWith(frame)}px)`, display: "inline-block" }}>with</span>
          </div>
        </div>
      </DirBlur>
      <Masked top={TOP + LH} dy={y2(frame)} vy={y2(frame) - y2(frame - 1)}>
        clarity.
      </Masked>
    </>
  );
};
