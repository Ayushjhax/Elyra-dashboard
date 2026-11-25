import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { prog } from "../lib/motion";
import { C, CJK, F } from "../theme";

/* ---------------------------------------------------------------------------
   Bars 17–19 (frames 1600–1900). All twenty, one per eighth note, with the
   day each first landed on main — the repository's own record, read with
   `git log --diff-filter=A` on each feature's first file. Then the claim
   once more, and a beat of silence before the end card.
--------------------------------------------------------------------------- */

export const FEATURES: { name: string; day: string }[] = [
  { name: "An AI team behind every answer", day: "18 Nov" },
  { name: "AI funds", day: "18 Nov" },
  { name: "Agent rails", day: "18 Nov" },
  { name: "Trade from the chart", day: "21 Nov" },
  { name: "Your trading record, with what-ifs", day: "21 Nov" },
  { name: "The Daily Briefing", day: "21 Nov" },
  { name: "Copy trading", day: "21 Nov" },
  { name: "Tokenized stocks", day: "21 Nov" },
  { name: "中文", day: "21 Nov" },
  { name: "Arbitrage", day: "21 Nov" },
  { name: "Sentiment", day: "21 Nov" },
  { name: "Workspace layouts", day: "21 Nov" },
  { name: "Voice conversations", day: "21 Nov" },
  { name: "Strategy lab", day: "23 Nov" },
  { name: "Arena leagues", day: "25 Nov" },
  { name: "The Desk", day: "25 Nov" },
  { name: "Insider watch", day: "25 Nov" },
  { name: "Paper and Live accounts", day: "25 Nov" },
  { name: "Scout", day: "25 Nov" },
  { name: "Polymarket baskets", day: "25 Nov" },
];

/** One name per eighth note: 12.5 frames at 144 BPM and 60 fps. */
export const STEP = 12.5;
export const ROLL = FEATURES.length * STEP; // 250 frames

/* A real screen behind each pair of names, dimmed and soft. */
const BEHIND = ["copy", "stocks", "research-arbitrage", "research-sentiment", "strategies-library", "scout-smart", "events", "markets", "research-insiders", "workspace-zh"];

export const Montage: React.FC = () => {
  const f = useCurrentFrame();
  const i = Math.min(FEATURES.length - 1, Math.floor(f / STEP));
  const local = f - i * STEP;
  const rolling = f < ROLL;
  const pop = prog(local, 0, 5, "out");
  const recap = prog(f, ROLL, ROLL + 10, "land");
  const vacuum = prog(f, 272, 280, "in");
  return (
    <AbsoluteFill>
      <Backdrop glow={1 - vacuum} />
      {rolling && (
        <AbsoluteFill style={{ opacity: 0.16 }}>
          <Img
            src={staticFile(`captures/${BEHIND[Math.floor(i / 2) % BEHIND.length]}.png`)}
            style={{ width: 1280, height: 720, objectFit: "cover", filter: "blur(6px) saturate(0.8)", transform: `scale(${1.12 - 0.04 * prog(local, 0, STEP * 2, "lin")})` }}
          />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(70% 70% at 50% 50%, rgba(16,23,16,0.2), rgba(16,23,16,0.95))" }} />
        </AbsoluteFill>
      )}
      {rolling && (
        <>
          <div style={{ position: "absolute", left: 72, top: 56, fontFamily: F.display, fontWeight: 700, fontSize: 30, color: C.ivory, fontVariantNumeric: "tabular-nums" }}>
            {String(i + 1).padStart(2, "0")}
            <span style={{ color: C.muted }}> / 20</span>
          </div>
          {/* progress: one tick per feature */}
          <div style={{ position: "absolute", left: 72, right: 72, bottom: 58, display: "flex", gap: 6 }}>
            {FEATURES.map((_, n) => (
              <div key={n} style={{ flex: 1, height: 3, borderRadius: 2, background: n <= i ? C.citron : C.border }} />
            ))}
          </div>
          <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 16, letterSpacing: "0.18em", textTransform: "uppercase", color: C.citron }}>{FEATURES[i].day}</div>
            <div
              style={{
                fontFamily: `${F.display}, ${CJK}`,
                fontWeight: 700,
                fontSize: FEATURES[i].name.length > 24 ? 64 : 84,
                letterSpacing: "-0.03em",
                color: C.ivory,
                textAlign: "center",
                maxWidth: 1100,
                lineHeight: 1.02,
                transform: `scale(${1.07 - 0.07 * pop})`,
                opacity: 0.35 + 0.65 * pop,
              }}
            >
              {FEATURES[i].name}
            </div>
          </AbsoluteFill>
        </>
      )}
      {!rolling && (
        <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: 1 - vacuum }}>
          <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 96, letterSpacing: "-0.035em", color: C.ivory, transform: `scale(${1.06 - 0.06 * recap})`, opacity: recap }}>
            20 features. <span style={{ color: C.citron }}>8 days.</span>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
