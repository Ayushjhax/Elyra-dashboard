import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Fine, Kicker, Sub, Title } from "../components/Type";
import { mix, prog } from "../lib/motion";
import { C, F, H } from "../theme";

/* ---------------------------------------------------------------------------
   Bars 6–7 (frames 500–700). The Desk, as a diagram of its procedure — the
   page itself needs a signed-in account, which this film does not have.

   The seats, their titles and their models are lib/desk/roster.ts exactly:
   the Chair (Claude Opus 5.5, does not vote) and eight voting seats, the
   nine a deployment with every key fills. The probabilities are
   illustrative, not a recorded run; the pooled figure is their log-odds
   mean, which is how the Desk pools a vote (lib/desk/protocol.ts) — 55%.
--------------------------------------------------------------------------- */

const SEATS: { title: string; model: string; p: number }[] = [
  { title: "Strategist", model: "Claude Fable 5.2", p: 62 },
  { title: "Market structure", model: "Claude Sonnet 5.5", p: 58 },
  { title: "Risk officer", model: "Claude Haiku 5.5", p: 44 },
  { title: "Positioning", model: "Cohere Command A Plus", p: 55 },
  { title: "Cross-market", model: "Gemini 3.5 Flash", p: 61 },
  { title: "Quant", model: "gpt-oss-120b on Groq", p: 57 },
  { title: "Contrarian", model: "Free model via OpenRouter", p: 41 },
  { title: "Second opinion", model: "Mistral Small", p: 60 },
];

const logit = (p: number) => Math.log(p / (100 - p));
const POOLED = Math.round(100 / (1 + Math.exp(-SEATS.reduce((sum, seat) => sum + logit(seat.p), 0) / SEATS.length)));

const CX = 912;
const CY = 404;
const RX = 206;
const RY = 196;
const CHIP_W = 196;
const CHIP_H = 54;

export const Desk: React.FC = () => {
  const f = useCurrentFrame();
  const push = prog(f, 193, 200, "in");
  const pool = prog(f, 104, 134, "land");
  return (
    <AbsoluteFill style={{ transform: `translateX(${-push * 46}px)`, opacity: 1 - push * 0.25 }}>
      <Backdrop glowX={CX} glowY={CY} />
      <div style={{ position: "absolute", left: 72, top: 0, height: H, width: 470, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
        <Kicker f={f}>New · The Desk</Kicker>
        <Title f={f} at={2} text={"Nine AI models.\n*One committee.*"} size={58} />
        <Sub f={f} at={12} maxWidth={440}>
          They forecast one market question together, by a fixed procedure, and are scored when it settles.
        </Sub>
        <Fine f={f} at={28}>
          Words only. It never trades.
        </Fine>
      </div>

      {/* lines from each seat to the pooled vote */}
      <svg style={{ position: "absolute", inset: 0 }} width={1280} height={720}>
        {SEATS.map((_, i) => {
          const a = (-90 + i * 45) * (Math.PI / 180);
          const x = CX + RX * Math.cos(a);
          const y = CY + RY * Math.sin(a);
          const t = prog(f, 100 + i * 2, 120 + i * 2, "land");
          return <line key={i} x1={x} y1={y} x2={mix(x, CX, t)} y2={mix(y, CY, t)} stroke={C.citron} strokeOpacity={0.45 * (1 - prog(f, 150, 190, "lin") * 0.6)} strokeWidth={1.5} />;
        })}
      </svg>

      {/* the chair, above the room */}
      <Chip f={f} at={6} x={CX} y={CY - RY - 74} title="Chair" model="Claude Opus 5.5 · writes the memo, does not vote" wide />

      {SEATS.map((seat, i) => {
        const a = (-90 + i * 45) * (Math.PI / 180);
        const at = 12 + i * 5;
        const count = prog(f, 58 + i * 3, 84 + i * 3, "out");
        return (
          <Chip key={seat.title} f={f} at={at} x={CX + RX * Math.cos(a)} y={CY + RY * Math.sin(a)} title={seat.title} model={seat.model} p={count > 0 ? Math.round(mix(50, seat.p, count)) : null} dim={pool} />
        );
      })}

      {/* the pooled vote */}
      <div
        style={{
          position: "absolute",
          left: CX - 110,
          top: CY - 62,
          width: 220,
          height: 124,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: pool,
          transform: `scale(${0.8 + 0.2 * pool})`,
        }}
      >
        <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 72, letterSpacing: "-0.03em", color: C.citron, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {Math.round(mix(50, POOLED, prog(f, 108, 140, "out")))}%
        </div>
        <div style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 13, color: C.stone, marginTop: 6, textAlign: "center", lineHeight: 1.3 }}>
          pooled by code,
          <br />
          weighted by track record
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: CX - 200,
          top: CY + RY + 50,
          width: 400,
          textAlign: "center",
          fontFamily: F.sans,
          fontWeight: 500,
          fontSize: 15,
          color: C.muted,
          opacity: prog(f, 146, 162, "out"),
        }}
      >
        Illustrative votes · every call is Brier-scored when it settles
      </div>
    </AbsoluteFill>
  );
};

const Chip: React.FC<{ f: number; at: number; x: number; y: number; title: string; model: string; p?: number | null; wide?: boolean; dim?: number }> = ({
  f,
  at,
  x,
  y,
  title,
  model,
  p = null,
  wide = false,
  dim = 0,
}) => {
  const t = prog(f, at, at + 14, "land");
  const w = wide ? 330 : CHIP_W;
  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - CHIP_H / 2,
        width: w,
        height: CHIP_H,
        borderRadius: 12,
        background: C.panel,
        border: `1px solid ${p !== null ? C.borderStrong : C.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 10,
        opacity: t * (1 - dim * 0.35),
        transform: `scale(${0.84 + 0.16 * t})`,
        boxShadow: "0 10px 26px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 14, color: C.ivory, whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 11.5, color: C.stone, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{model}</div>
      </div>
      {p !== null && <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 20, color: C.citron, fontVariantNumeric: "tabular-nums" }}>{p}%</div>}
    </div>
  );
};
