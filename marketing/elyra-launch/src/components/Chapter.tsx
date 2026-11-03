import React from "react";
import { AbsoluteFill } from "remotion";
import { C, F } from "../theme";
import { prog, mix } from "../lib/motion";
import { useAbsFrame } from "../lib/frame";

/* ---------------------------------------------------------------------------
   Orientation for the middle of the film: six chapters, a small chapter
   marker top-left with a six-segment progress line, and one transition
   grammar between chapters — a lime bar (the agent rail, made graphic)
   sweeping right to left and drawing the next chapter in behind it.
--------------------------------------------------------------------------- */

export const CHAPTERS = [
  { n: "01", name: "Ask Elyra", from: 400, to: 764 },
  { n: "02", name: "Capital", from: 750, to: 1064 },
  { n: "03", name: "Signals", from: 1050, to: 1364 },
  { n: "04", name: "Research", from: 1350, to: 1914 },
  { n: "05", name: "Wallet", from: 1900, to: 2174 },
  { n: "06", name: "Alerts", from: 2160, to: 2346 },
] as const;

export const ChapterHUD: React.FC = () => {
  const f = useAbsFrame();
  const first = CHAPTERS[0].from;
  const last = CHAPTERS[CHAPTERS.length - 1].to;
  if (f < first || f >= last) return null;
  const vis = prog(f, first, first + 12, "out") * (1 - prog(f, last - 14, last, "in"));
  let active = 0;
  CHAPTERS.forEach((c, i) => {
    if (f >= c.from + 7) active = i;
  });
  const ch = CHAPTERS[active];
  const swap = prog(f, ch.from + 7, ch.from + 19, "land");
  return (
    <div style={{ position: "absolute", left: 96, top: 50, opacity: vis }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, height: 34, overflow: "hidden" }}>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 26, color: C.citron, letterSpacing: "0.04em" }}>{ch.n}</div>
        <div
          style={{
            fontFamily: F.sans,
            fontWeight: 600,
            fontSize: 24,
            color: C.ivory,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            transform: `translateY(${(1 - swap) * 30}px)`,
            opacity: swap,
          }}
        >
          {ch.name}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {CHAPTERS.map((c, i) => {
          const fill = i < active ? 1 : i > active ? 0 : prog(f, c.from, c.to - 14, "lin");
          return (
            <div key={c.n} style={{ width: 46, height: 3, background: C.border, position: "relative", borderRadius: 2 }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: 3, width: 46 * fill, background: i === active ? C.citron : C.stone, borderRadius: 2 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Draws its children in behind a lime bar sweeping right → left. */
export const LimeWipe: React.FC<{ from: number; dur?: number; children: React.ReactNode }> = ({ from, dur = 14, children }) => {
  const f = useAbsFrame();
  const p = prog(f, from, from + dur, "whip");
  if (p >= 1) return <>{children}</>;
  const edge = mix(1940, -20, p);
  return (
    <>
      <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${Math.max(0, edge)}px)` }}>{children}</AbsoluteFill>
      <div style={{ position: "absolute", left: edge - 5, top: 0, width: 10, height: 1080, background: C.lime }} />
    </>
  );
};
