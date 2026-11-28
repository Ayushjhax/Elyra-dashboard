import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Flask, Zap } from "../components/Icons";
import { Kicker, Sub, Title } from "../components/Type";
import { mix, prog } from "../lib/motion";
import { C, CJK, F } from "../theme";

/* ---------------------------------------------------------------------------
   One bar. Live and Paper are two accounts, and the header's switch says
   which one every order surface sends to (components/paper/Paper.tsx,
   ModeSwitch): the chart's ticket, Automation's Trade now and limit
   orders. The switch is drawn here at four times its size with the product's
   own marks and colours — Elyra Green (surface-active) for Paper — and it
   flips Live → Paper on the beat; the three surfaces follow it in turn.
--------------------------------------------------------------------------- */

const sans = `${F.sans}, ${CJK}`;
const SURFACES = ["Chart ticket", "Trade now", "Limit orders"];

export const Switch: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const push = prog(f, dur - 7, dur, "in");
  const flip = prog(f, 25, 37, "land");
  const segW = 196;
  const enter = prog(f, 0, 20, "land");
  return (
    <AbsoluteFill style={{ transform: `translateX(${-push * 46}px) scale(${1 + push * 0.025})`, opacity: 1 - push * 0.25 }}>
      <Backdrop glowX={860} glowY={360} />
      <div style={{ position: "absolute", left: 72, top: 0, bottom: 0, width: 470, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
        <Kicker f={f}>Live and Paper</Kicker>
        <Title f={f} at={2} text={"Two accounts.\n*One switch.*"} size={58} />
        <Sub f={f} at={12} maxWidth={440}>
          Switch any time in the top bar. Your live funds are never touched on paper.
        </Sub>
      </div>
      <div style={{ position: "absolute", left: 620, top: 196, opacity: enter, transform: `translateY(${(1 - enter) * 24}px)` }}>
        {/* The switch: the header's radiogroup, at 4x. */}
        <div
          style={{
            position: "relative",
            width: segW * 2 + 16,
            height: 92,
            borderRadius: 22,
            border: `2px solid ${C.border}`,
            background: C.panel,
            padding: 6,
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 6 + mix(0, segW + 4, flip),
              width: segW,
              height: 76,
              borderRadius: 16,
              background: flip < 0.5 ? "rgba(247,248,234,0.08)" : C.active,
              border: flip < 0.5 ? "none" : `1px solid ${C.borderAccent}`,
            }}
          />
          {(["live", "paper"] as const).map((mode, i) => {
            const on = mode === "paper" ? flip >= 0.5 : flip < 0.5;
            const tone = on ? C.ivory : C.muted;
            return (
              <div
                key={mode}
                style={{
                  position: "absolute",
                  top: 6,
                  left: 6 + i * (segW + 4),
                  width: segW,
                  height: 76,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  fontFamily: sans,
                  fontWeight: 600,
                  fontSize: 30,
                  color: tone,
                }}
              >
                {mode === "live" ? <Zap size={30} color={tone} /> : <Flask size={30} color={tone} />}
                {mode === "live" ? "Live" : "Paper"}
              </div>
            );
          })}
        </div>
        {/* The surfaces that follow it. */}
        <div style={{ marginTop: 38, display: "flex", flexDirection: "column", gap: 12, width: segW * 2 + 16 }}>
          {SURFACES.map((name, i) => {
            const t = prog(f, 40 + i * 7, 50 + i * 7, "land");
            const appear = prog(f, 8 + i * 5, 20 + i * 5, "land");
            return (
              <div
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  borderRadius: 14,
                  background: C.raised,
                  border: `1px solid ${C.border}`,
                  fontFamily: sans,
                  fontWeight: 500,
                  fontSize: 21,
                  color: C.ivory,
                  opacity: appear,
                  transform: `translateX(${(1 - appear) * 30}px)`,
                }}
              >
                <span>{name}</span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 12px",
                    borderRadius: 999,
                    fontSize: 16,
                    fontWeight: 600,
                    color: C.ivory,
                    background: t >= 0.5 ? C.active : "transparent",
                    border: `1px solid ${t >= 0.5 ? C.borderAccent : C.border}`,
                    transform: `scale(${t > 0 && t < 1 ? 1 + 0.08 * Math.sin(Math.PI * t) : 1})`,
                  }}
                >
                  {t >= 0.5 ? <Flask size={16} color={C.ivory} /> : <Zap size={16} color={C.stone} />}
                  {t >= 0.5 ? "Paper" : "Live"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
