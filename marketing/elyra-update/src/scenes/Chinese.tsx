import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Still } from "../components/Still";
import { Kicker, Title } from "../components/Type";
import { mix, prog } from "../lib/motion";
import { C } from "../theme";

/* ---------------------------------------------------------------------------
   Bar 16 (frames 1500–1600). The same live workspace, captured twice: once
   in English, once with the locale cookie set to Simplified Chinese. A
   citron line wipes one into the other on the beat.
--------------------------------------------------------------------------- */

const CARD_W = 940;
const CARD_H = Math.round((CARD_W * 1800) / 3200);

export const Chinese: React.FC = () => {
  const f = useCurrentFrame();
  const push = prog(f, 93, 100, "in");
  const enter = prog(f, 0, 22, "land");
  const wipe = prog(f, 25, 47, "io");
  const scale = (CARD_W / 3200) * mix(1, 1.08, prog(f, 0, 100, "io"));
  const focus = { x: 1600, y: mix(900, 860, prog(f, 0, 100, "io")) };
  const x = wipe * CARD_W;
  return (
    <AbsoluteFill style={{ transform: `translateX(${-push * 46}px)`, opacity: 1 - push * 0.25 }}>
      <Backdrop glowX={640} glowY={420} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 46, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <Kicker f={f}>New · Simplified Chinese</Kicker>
        <Title f={f} at={2} text="Now in English and *中文.*" size={50} align="center" />
      </div>
      <div style={{ position: "absolute", left: (1280 - CARD_W) / 2, top: 150, perspective: 1800 }}>
        <div style={{ transform: `translateY(${(1 - enter) * 80}px) rotateX(${mix(16, 0, enter)}deg)`, transformOrigin: "center top", opacity: prog(f, 0, 8, "out") }}>
          <div style={{ position: "relative", width: CARD_W, height: CARD_H }}>
            <Still src="captures/workspace-en.png" width={CARD_W} height={CARD_H} focus={focus} scale={scale} />
            <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${CARD_W - x}px 0 0 round 16px)` }}>
              <Still src="captures/workspace-zh.png" width={CARD_W} height={CARD_H} focus={focus} scale={scale} shadow={0} />
            </div>
            {wipe > 0 && wipe < 1 && <div style={{ position: "absolute", top: -6, bottom: -6, left: x - 1.5, width: 3, background: C.citron, borderRadius: 2, boxShadow: "0 0 18px rgba(210,220,118,0.55)" }} />}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
