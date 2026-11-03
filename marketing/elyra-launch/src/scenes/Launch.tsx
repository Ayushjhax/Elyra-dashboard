import React from "react";
import { AbsoluteFill, Img, Sequence, staticFile } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Device, type DeviceT } from "../components/Device";
import { Media } from "../components/Shot";
import { Headline } from "../components/Type";
import { ease, mix, prog } from "../lib/motion";
import { useAbsFrame } from "../lib/frame";
import { C, F } from "../theme";

/* ---------------------------------------------------------------------------
   2340–2700 · Reveal three: it is live.

   The handset returns and lands at 2400, the frame the announcement lands
   on. From 2400 to 2700 the composition holds, complete and readable:
     left    "Live on Solana dApp Store"
     centre  the real product (the SOL chart and Decision brief, 09)
     right   the Elyra emblem and wordmark, the store badge, getelyra.xyz
   The badge is mobile/assets/dapp.png (696 × 273), drawn at a uniform
   0.8 scale with no filter, tint, crop or effect.
--------------------------------------------------------------------------- */

const BADGE_W = 696;
const BADGE_H = 273;
const BADGE_SCALE = 0.8;

function deviceAt(f: number): DeviceT {
  const final: DeviceT = { x: 985, y: 548, s: 0.345, ry: -9, rx: 3, rz: 0 };
  if (f < 2400) {
    const t = ease("land", (f - 2340) / 58);
    return {
      x: mix(1560, final.x, t),
      y: mix(1300, final.y, t),
      s: Math.exp(mix(Math.log(0.42), Math.log(final.s), t)),
      ry: mix(-34, final.ry!, t),
      rx: mix(12, final.rx!, t),
      rz: mix(9, 0, t),
    };
  }
  /* very slight drift through the hold */
  const d = prog(f, 2400, 2700, "lin");
  return { ...final, ry: mix(-9, -5.5, d), rx: mix(3, 2.2, d), s: mix(0.345, 0.349, d) };
}

export const Launch: React.FC = () => {
  const f = useAbsFrame();
  if (f < 2340) return null;
  const t = deviceAt(f);
  const glow = prog(f, 2340, 2400, "out");
  const lock = f >= 2400;
  return (
    <AbsoluteFill>
      <Backdrop glow={glow} glowX={968} glowY={560} />
      <Device t={t} status="asset" time="12:42" shadow={glow}>
        <Sequence from={2340} layout="none">
          <Media src={{ v: "09-decision-brief.mp4", t: 150 }} />
        </Sequence>
      </Device>

      <Headline
        lines={[["Live", "on"], ["Solana"], ["dApp", "Store"]]}
        from={2400}
        to={2701}
        x={96}
        y={548 - 186}
        align="left"
        size={124}
        stagger={0}
        dur={0}
        exit="none"
        settle={0.018}
        lineHeight={1.0}
      />

      {lock && (
        <div style={{ position: "absolute", left: 1262, top: 548 - 250, width: BADGE_W * BADGE_SCALE }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 38 }}>
            <Img src={staticFile("brand/elyra-emblem.png")} style={{ width: 92, height: 92 }} />
            <div style={{ fontFamily: F.serif, fontSize: 74, color: C.ivory, lineHeight: 1, letterSpacing: "-0.01em" }}>Elyra</div>
          </div>
          <Img
            src={staticFile("brand/dapp.png")}
            style={{ width: BADGE_W * BADGE_SCALE, height: BADGE_H * BADGE_SCALE, display: "block" }}
          />
          <div style={{ marginTop: 30, fontFamily: F.sans, fontWeight: 500, fontSize: 32, color: C.stone, letterSpacing: "0.01em" }}>
            getelyra.xyz
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
