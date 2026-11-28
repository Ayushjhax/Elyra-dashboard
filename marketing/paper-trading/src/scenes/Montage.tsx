import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Check } from "../components/Icons";
import { prog } from "../lib/motion";
import { C, CJK, F } from "../theme";

/* ---------------------------------------------------------------------------
   Bars 16–17 (two bars). Everything paper trading does, one line every
   eighth note, ticking off over the paper workspace — then the list lifts
   away and the claim comes back for the end card.

   Each line is a fact from the code (CLAUDE.md, "Live and Paper"; Paper.tsx;
   lib/autotrade/rules.ts; lib/voice): nothing here is roadmap.
--------------------------------------------------------------------------- */

const ITEMS = [
  "$100,000 in virtual funds",
  "Hyperliquid's live prices",
  "Fees and slippage on every fill",
  "Market and limit orders",
  "Stop and target on every entry",
  "Partial closes, exits you can move",
  "Paper-trade a signal in one tap",
  "Rules and AI funds start on paper",
  "Voice orders default to paper",
  "Win rate by leverage, side and hour",
  "Reset to $100,000",
  "In English and 中文",
];

const sans = `${F.sans}, ${CJK}`;
const STEP = 12.5;

export const Montage: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const leave = prog(f, dur - 16, dur, "in");
  return (
    <AbsoluteFill>
      <Backdrop glow={0.7} />
      <Img
        src={staticFile("captures/07-home-trading.png")}
        style={{
          position: "absolute",
          left: -40,
          top: -22,
          width: 1360,
          height: 765,
          opacity: 0.13,
          filter: "blur(2px) saturate(0.8)",
          transform: `scale(${1.04 + 0.04 * prog(f, 0, dur, "lin")})`,
        }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(90% 80% at 50% 50%, rgba(16,23,16,0.55) 0%, rgba(16,23,16,0.9) 100%)" }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 56,
          rowGap: 18,
          alignContent: "center",
          padding: "0 112px",
          opacity: 1 - leave,
          transform: `translateY(${-leave * 26}px)`,
        }}
      >
        {ITEMS.map((item, i) => {
          const at = i * STEP;
          const t = prog(f, at, at + 14, "land");
          const tick = prog(f, at + 4, at + 14, "out");
          return (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 16, opacity: t, transform: `translateY(${(1 - t) * 16}px)` }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  flex: "0 0 34px",
                  borderRadius: 999,
                  background: tick > 0.4 ? C.active : "transparent",
                  border: `1.5px solid ${tick > 0.4 ? C.borderAccent : C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Check size={20} color={C.citron} stroke={2.4} draw={tick} />
              </div>
              <span style={{ fontFamily: sans, fontWeight: 500, fontSize: 25, color: C.ivory, letterSpacing: "-0.005em" }}>{item}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
