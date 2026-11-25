import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { prog } from "../lib/motion";
import { C, F } from "../theme";

/* ---------------------------------------------------------------------------
   Bars 20–22 (frames 1900–2200). The end card lands on the impact: the
   emblem and the wordmark, the line, and where to find it. The emblem is
   mobile/assets/images/elyra-emblem.png, drawn at uniform scale with no
   filter. Everything fades to the backdrop over the last 24 frames.
--------------------------------------------------------------------------- */

export const End: React.FC = () => {
  const f = useCurrentFrame();
  const mark = prog(f, 0, 22, "land");
  const word = prog(f, 6, 26, "land");
  const line = prog(f, 30, 46, "land");
  const url = prog(f, 56, 70, "land");
  const fine = prog(f, 90, 106, "out");
  const out = prog(f, 276, 300, "io");
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <Backdrop glow={0.4 + 0.6 * mark} glowY={300} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Img src={staticFile("brand/elyra-emblem.png")} style={{ width: 96, height: 96, opacity: mark, transform: `scale(${0.86 + 0.14 * mark})` }} />
          <div style={{ overflow: "hidden", paddingBottom: 10, marginBottom: -10 }}>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 104, letterSpacing: "-0.04em", color: C.ivory, lineHeight: 1, transform: `translateY(${(1 - word) * 105}%)` }}>
              elyra<span style={{ color: C.citron }}>.</span>
            </div>
          </div>
        </div>
        <div style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 28, color: C.stone, opacity: line, transform: `translateY(${(1 - line) * 12}px)` }}>The trading workspace that shows its work.</div>
        <div
          style={{
            marginTop: 6,
            padding: "12px 26px",
            borderRadius: 999,
            background: C.citron,
            color: C.ink,
            fontFamily: F.sans,
            fontWeight: 600,
            fontSize: 24,
            opacity: url,
            transform: `scale(${0.9 + 0.1 * url})`,
          }}
        >
          getelyra.xyz
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 52, textAlign: "center", fontFamily: F.sans, fontWeight: 500, fontSize: 16, color: C.muted, opacity: fine }}>
        20 features shipped from 18 to 25 November 2026. Nothing here is financial advice.
      </div>
    </AbsoluteFill>
  );
};
