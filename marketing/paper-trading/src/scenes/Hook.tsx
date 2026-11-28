import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { ease, hash, mix, prog } from "../lib/motion";
import { C, CJK, F } from "../theme";

/* ---------------------------------------------------------------------------
   Bars 1–2 (frames 0–200). The hook.

   A counter races from $0 to $100,000 — fast, then braking hard into the
   number — and lands on beat 3. On the beat before the next bar it shrinks
   into a sentence, "Trade $100,000.", and "Risk $0." slams in under it on
   the downbeat. Then the frame zooms through into the product.

   $100,000 is PAPER_STARTING_USD (lib/paper/funds.ts): what a paper account
   starts with, and what a reset returns it to.
--------------------------------------------------------------------------- */

const display = `${F.display}, ${CJK}`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Digits at tabular width so the count does not wobble; "$" and "," at their own. */
const Figures: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split("").map((ch, i) => (
      <span key={i} style={{ fontVariantNumeric: /[0-9]/.test(ch) ? "tabular-nums" : "normal" }}>
        {ch}
      </span>
    ))}
  </>
);

export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  /* The count: an expo-out race that settles exactly on 100,000 at frame 50. */
  const t = prog(f, 0, 50, "lin");
  const value = f >= 50 ? 100_000 : 100_000 * (1 - Math.pow(1 - t, 3.2));
  const land = prog(f, 50, 64, "land");
  /* The shrink into the sentence, on the beat before the downbeat. */
  const into = prog(f, 84, 100, "io");
  const slam = prog(f, 100, 110, "land");
  const shake = f >= 100 && f < 106 ? (hash(f) - 0.5) * 9 * (1 - (f - 100) / 6) : 0;
  const through = prog(f, 184, 200, "in");
  const size = mix(232, 118, into) * (f < 64 ? 1.05 - 0.05 * land : 1);
  return (
    <AbsoluteFill>
      <Backdrop glow={0.5 + 0.5 * prog(f, 0, 60, "out")} />
      <AbsoluteFill
        style={{
          transform: `translate(${shake}px, ${shake * 0.6}px) scale(${1 + through * 4.5})`,
          opacity: 1 - prog(f, 190, 200, "lin"),
          filter: through > 0 ? `blur(${through * 6}px)` : undefined,
        }}
      >
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              fontFamily: display,
              fontWeight: 800,
              fontSize: size,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: C.ivory,
              transform: `translateY(${mix(0, -18, into)}px)`,
            }}
          >
            <span style={{ display: "inline-block", overflow: "hidden", maxWidth: `${into * 3.2}em`, opacity: into, whiteSpace: "nowrap" }}>Trade&nbsp;</span>
            <span>
              <Figures text={usd(value)} />
            </span>
            <span style={{ display: "inline-block", overflow: "hidden", maxWidth: `${into * 0.4}em`, opacity: into }}>.</span>
          </div>
          <div style={{ height: into > 0 ? 132 : 0, overflow: "hidden", marginTop: 4 }}>
            <div
              style={{
                fontFamily: display,
                fontWeight: 800,
                fontSize: 118,
                letterSpacing: "-0.04em",
                lineHeight: 1.08,
                color: C.citron,
                transform: `translateY(${(1 - slam) * 110}%) scale(${1 + (1 - slam) * 0.06})`,
                opacity: f >= 100 ? 1 : 0,
              }}
            >
              Risk $0.
            </div>
          </div>
          <div
            style={{
              marginTop: 22,
              fontFamily: F.sans,
              fontWeight: 500,
              fontSize: 24,
              color: C.stone,
              opacity: prog(f, 138, 154, "out"),
              transform: `translateY(${(1 - prog(f, 138, 154, "land")) * 10}px)`,
            }}
          >
            Paper trading is live on Elyra.
          </div>
        </div>
        {/* The label under the race: what the number is, gone before the sentence forms. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 470,
            textAlign: "center",
            fontFamily: F.sans,
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: C.citron,
            opacity: prog(f, 54, 66, "out") * (1 - prog(f, 80, 88, "lin")),
            transform: `translateY(${(1 - ease("land", prog(f, 54, 66))) * 8}px)`,
          }}
        >
          In virtual funds
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
