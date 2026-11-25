import React from "react";
import { prog } from "../lib/motion";
import { C, CJK, F } from "../theme";

/* ---------------------------------------------------------------------------
   The film's type: Fustat for headlines, General Sans for everything else,
   sentence case, the product's own colours. Each piece takes `f`, the
   frame relative to its scene, and enters on the brand's landing curve.
--------------------------------------------------------------------------- */

const display = `${F.display}, ${CJK}`;
const sans = `${F.sans}, ${CJK}`;

/** A small uppercase label: the only uppercase in the film. */
export const Kicker: React.FC<{ f: number; at?: number; children: React.ReactNode; color?: string }> = ({ f, at = 0, children, color = C.citron }) => {
  const t = prog(f, at, at + 12, "land");
  return (
    <div
      style={{
        fontFamily: sans,
        fontWeight: 600,
        fontSize: 15,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color,
        opacity: t,
        transform: `translateY(${(1 - t) * 10}px)`,
      }}
    >
      {children}
    </div>
  );
};

/**
 * A headline whose words rise out of a mask one after another. A word
 * wrapped in `*stars*` is set in citron.
 */
export const Title: React.FC<{
  f: number;
  at?: number;
  text: string;
  size?: number;
  weight?: number;
  stagger?: number;
  align?: "left" | "center";
  color?: string;
  lineHeight?: number;
  maxWidth?: number;
}> = ({ f, at = 0, text, size = 64, weight = 700, stagger = 3, align = "left", color = C.ivory, lineHeight = 1.04, maxWidth }) => {
  const lines = text.split("\n");
  let index = 0;
  return (
    <div style={{ fontFamily: display, fontWeight: weight, fontSize: size, lineHeight, letterSpacing: "-0.025em", color, textAlign: align, maxWidth }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", columnGap: size * 0.26 }}>
          {line.split(" ").map((word, wi) => {
            const accent = word.startsWith("*");
            const clean = word.replace(/\*/g, "");
            const t = prog(f, at + index * stagger, at + index * stagger + 16, "land");
            index += 1;
            return (
              <span key={wi} style={{ display: "inline-block", overflow: "hidden", paddingBottom: size * 0.12, marginBottom: -size * 0.12 }}>
                <span style={{ display: "inline-block", transform: `translateY(${(1 - t) * 105}%)`, color: accent ? C.citron : undefined }}>{clean}</span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export const Sub: React.FC<{ f: number; at?: number; children: React.ReactNode; size?: number; align?: "left" | "center"; maxWidth?: number; color?: string }> = ({
  f,
  at = 10,
  children,
  size = 22,
  align = "left",
  maxWidth = 460,
  color = C.stone,
}) => {
  const t = prog(f, at, at + 16, "land");
  return (
    <div
      style={{
        fontFamily: sans,
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1.32,
        color,
        maxWidth,
        textAlign: align,
        opacity: t,
        transform: `translateY(${(1 - t) * 12}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** A fine print line: what a claim does not mean. */
export const Fine: React.FC<{ f: number; at?: number; children: React.ReactNode; align?: "left" | "center" }> = ({ f, at = 24, children, align = "left" }) => {
  const t = prog(f, at, at + 14, "out");
  return <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 15, color: C.muted, opacity: t, textAlign: align }}>{children}</div>;
};
