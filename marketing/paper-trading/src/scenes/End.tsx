import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Flask } from "../components/Icons";
import { prog } from "../lib/motion";
import { C, CJK, F } from "../theme";

/* ---------------------------------------------------------------------------
   Bars 18–20 (300 frames). The end card lands on the impact: the claim once
   more, then the emblem and the wordmark, the paper chip in the product's
   own Elyra Green, and where to find it. The emblem is
   mobile/assets/images/elyra-emblem.png at uniform scale with no filter.
   Everything fades to the backdrop over the last 24 frames.
--------------------------------------------------------------------------- */

const display = `${F.display}, ${CJK}`;

export const End: React.FC = () => {
  const f = useCurrentFrame();
  const claim = prog(f, 0, 14, "land");
  const claimOut = prog(f, 70, 82, "in");
  const mark = prog(f, 84, 104, "land");
  const word = prog(f, 90, 110, "land");
  const chip = prog(f, 112, 126, "land");
  const url = prog(f, 132, 146, "land");
  const fine = prog(f, 150, 166, "out");
  const out = prog(f, 276, 300, "io");
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <Backdrop glow={0.4 + 0.6 * Math.max(claim * (1 - claimOut), mark)} glowY={320} />
      {/* The claim, once more. */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: 1 - claimOut,
          transform: `scale(${(0.94 + 0.06 * claim) * (1 + claimOut * 0.08)})`,
          filter: claimOut > 0 ? `blur(${claimOut * 8}px)` : undefined,
        }}
      >
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 104, letterSpacing: "-0.04em", lineHeight: 1.04, color: C.ivory, opacity: claim }}>Trade $100,000.</div>
        <div style={{ fontFamily: display, fontWeight: 800, fontSize: 104, letterSpacing: "-0.04em", lineHeight: 1.04, color: C.citron, opacity: prog(f, 12, 22, "out") }}>Risk $0.</div>
      </AbsoluteFill>
      {/* The brand. */}
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26, opacity: f >= 84 ? 1 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Img src={staticFile("brand/elyra-emblem.png")} style={{ width: 96, height: 96, opacity: mark, transform: `scale(${0.86 + 0.14 * mark})` }} />
          <div style={{ overflow: "hidden", paddingBottom: 10, marginBottom: -10 }}>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 104, letterSpacing: "-0.04em", color: C.ivory, lineHeight: 1, transform: `translateY(${(1 - word) * 105}%)` }}>
              elyra<span style={{ color: C.citron }}>.</span>
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 20px",
            borderRadius: 999,
            background: C.active,
            border: `1px solid ${C.borderAccent}`,
            fontFamily: F.sans,
            fontWeight: 600,
            fontSize: 24,
            color: C.ivory,
            opacity: chip,
            transform: `translateY(${(1 - chip) * 12}px)`,
          }}
        >
          <Flask size={24} color={C.ivory} />
          Paper trading is live
        </div>
        <div
          style={{
            marginTop: 2,
            padding: "12px 26px",
            borderRadius: 999,
            background: C.citron,
            color: C.onAccent,
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
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 44, textAlign: "center", fontFamily: F.sans, fontWeight: 500, fontSize: 15, color: C.muted, opacity: fine }}>
        Paper trading uses virtual funds; demo account shown. Past paper results do not predict live ones. Not financial advice.
      </div>
    </AbsoluteFill>
  );
};
