import React, { useMemo } from "react";
import { AbsoluteFill } from "remotion";
import { C, F } from "../theme";
import { EASE, clamp01, mix, prog, rnd } from "../lib/anim";
import { DirBlur, depthBlur } from "../components/DirBlur";
import { Emblem } from "../screens/ui";
import { dpToFilm } from "../components/Device";
import { phoneAt } from "../camera";

/* ---------------------------------------------------------------------------
   Scene 1 — "Markets move." (frames 0–99).

   A designed first frame: the statement is already legible while cropped
   candles, market labels and fine data lines accelerate behind it, in three
   depth planes. One citron signal cuts through. On the last beats the field
   collapses into the handset's position, and one candle — the hero candle —
   becomes the agent rail of the real Ask Elyra capture (01-ask-elyra.png:
   rail at x 16.5 dp, y 163.6–677.4 dp), landing on the rail's exact pixels
   at frame 100.
--------------------------------------------------------------------------- */

type Candle = { o: number; c: number; h: number; l: number };

function series(seed: string, n: number, start: number, vol: number): Candle[] {
  const out: Candle[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    const drift = Math.sin(i * 0.07) * vol * 0.18;
    const o = p;
    const c = o + (rnd(`${seed}-c-${i}`) - 0.5) * vol * 2 + drift;
    const h = Math.max(o, c) + rnd(`${seed}-h-${i}`) * vol * 0.9;
    const l = Math.min(o, c) - rnd(`${seed}-l-${i}`) * vol * 0.9;
    out.push({ o, c, h, l });
    p = c;
  }
  return out;
}

type LayerSpec = {
  seed: string;
  n: number;
  w: number;
  gap: number;
  cy: number;
  yScale: number;
  opacity: number;
  v0: number;
  a: number;
  blur: number;
  startX: number;
};

const LAYERS: LayerSpec[] = [
  { seed: "far", n: 190, w: 9, gap: 15, cy: 330, yScale: 16, opacity: 0.24, v0: 1.3, a: 0.03, blur: 0.8, startX: -40 },
  { seed: "mid", n: 110, w: 20, gap: 33, cy: 560, yScale: 36, opacity: 0.52, v0: 2.6, a: 0.07, blur: 0, startX: -20 },
  { seed: "near", n: 46, w: 64, gap: 104, cy: 820, yScale: 80, opacity: 0.2, v0: 4.4, a: 0.13, blur: 8, startX: -60 },
];

const offset = (l: LayerSpec, f: number) => l.v0 * f + l.a * f * f;

/** Where the field collapses to: the handset's centre on the downbeat. */
const COLLAPSE = { x: 1530, y: 620 };

const CandleLayer: React.FC<{ spec: LayerSpec; frame: number; collapse: number }> = ({ spec, frame, collapse }) => {
  const data = useMemo(() => series(spec.seed, spec.n, 0, 1), [spec.seed, spec.n]);
  const off = offset(spec, frame);
  const v = offset(spec, frame) - offset(spec, frame - 1);
  const mean = data.reduce((a, d) => a + d.c, 0) / data.length;
  const scale = mix(1, 0.18, collapse);
  return (
    <DirBlur dx={v * (1 - collapse)} dy={0} style={{ ...depthBlur(spec.blur + collapse * 10) }}>
      <svg
        width={1920}
        height={1080}
        style={{
          position: "absolute",
          inset: 0,
          opacity: spec.opacity * (1 - collapse * 0.85),
          transformOrigin: `${COLLAPSE.x}px ${COLLAPSE.y}px`,
          transform: `scale(${scale})`,
        }}
      >
        {data.map((d, i) => {
          const x = spec.startX + i * spec.gap - off;
          if (x < -spec.w * 2 || x > 1920 + spec.w) return null;
          const up = d.c >= d.o;
          const y = (p: number) => spec.cy - (p - mean) * spec.yScale;
          const top = y(Math.max(d.o, d.c));
          const bot = y(Math.min(d.o, d.c));
          const col = up ? C.sage : C.clay;
          return (
            <g key={i}>
              <rect x={x + spec.w / 2 - Math.max(1, spec.w * 0.08) / 2} y={y(d.h)} width={Math.max(1, spec.w * 0.08)} height={y(d.l) - y(d.h)} fill={col} />
              <rect x={x} y={top} width={spec.w} height={Math.max(2, bot - top)} fill={col} />
            </g>
          );
        })}
      </svg>
    </DirBlur>
  );
};

/** Grid hairlines and a price axis, like the real chart's (07-sol-asset.png). */
const DataLines: React.FC<{ frame: number; collapse: number }> = ({ frame, collapse }) => {
  const levels = [97.0, 96.5, 96.0, 95.5, 95.0, 94.5, 94.0, 93.5];
  const drift = frame * 0.6;
  const flashA = frame >= 50 ? 1 - prog(frame, 50, 74, EASE.linear) : 0;
  const flashB = frame >= 75 ? 1 - prog(frame, 75, 99, EASE.linear) : 0;
  return (
    <AbsoluteFill style={{ opacity: 1 - collapse, transformOrigin: `${COLLAPSE.x}px ${COLLAPSE.y}px`, transform: `scale(${mix(1, 0.5, collapse)})` }}>
      {levels.map((lv, i) => {
        const y = 150 + i * 112 - drift;
        const flash = i === 3 ? flashA : i === 5 ? flashB : 0;
        return (
          <React.Fragment key={lv}>
            <div style={{ position: "absolute", left: 0, top: y, width: 1920, height: 0, borderTop: `1px dotted ${C.border}`, opacity: 0.9 }} />
            <div
              style={{
                position: "absolute",
                right: 64,
                top: y - 18,
                padding: "3px 8px",
                borderRadius: 4,
                fontFamily: F.sans,
                fontWeight: 500,
                fontSize: 22,
                color: flash > 0 ? C.ivory : C.textMuted,
                background: flash > 0 ? (i === 3 ? `rgba(122,158,112,${(0.3 * flash).toFixed(3)})` : `rgba(196,99,58,${(0.3 * flash).toFixed(3)})`) : "transparent",
                opacity: 0.75,
              }}
            >
              {lv.toFixed(3)}
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

const LABELS = [
  { t: "SOL / USD  94.20", x: 1180, y: 214, d: 1.0 },
  { t: "BTC  77,848", x: 1560, y: 760, d: 1.6 },
  { t: "ETH  2,262.96", x: 760, y: 820, d: 0.7 },
  { t: "SOL-PERP funding  −0.012%", x: 1240, y: 900, d: 1.25 },
  { t: "OI  1.24B", x: 1700, y: 380, d: 0.85 },
  { t: "EMA 20", x: 980, y: 640, d: 1.1 },
];

const MarketLabels: React.FC<{ frame: number; collapse: number }> = ({ frame, collapse }) => (
  <AbsoluteFill style={{ opacity: 1 - collapse, transformOrigin: `${COLLAPSE.x}px ${COLLAPSE.y}px`, transform: `scale(${mix(1, 0.4, collapse)})` }}>
    {LABELS.map((l) => {
      const off = (1.5 * frame + 0.05 * frame * frame) * l.d;
      const v = (1.5 + 0.1 * frame) * l.d;
      return (
        <DirBlur key={l.t} dx={v} dy={0}>
          <div style={{ position: "absolute", left: l.x - off, top: l.y, fontFamily: F.sans, fontWeight: 500, fontSize: 24, color: C.stone, opacity: 0.55, whiteSpace: "nowrap" }}>{l.t}</div>
        </DirBlur>
      );
    })}
  </AbsoluteFill>
);

/** The single citron signal: a price trace that cuts across the field. */
const Signal: React.FC<{ frame: number; collapse: number }> = ({ frame, collapse }) => {
  const draw = prog(frame, 6, 44, EASE.inOut);
  const pts = useMemo(
    () =>
      Array.from({ length: 64 }, (_, i) => {
        const x = -40 + i * 33;
        const y = 742 - i * 3.1 + Math.sin(i * 0.55) * 26 + Math.sin(i * 0.21) * 40;
        return [x, y] as const;
      }),
    [],
  );
  const n = Math.max(2, Math.floor(draw * pts.length));
  const slide = frame > 44 ? (frame - 44) * 2 + (frame - 44) * (frame - 44) * 0.08 : 0;
  const d = pts
    .slice(0, n)
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${(x - slide).toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const head = pts[n - 1];
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, opacity: 1 - collapse, transformOrigin: `${COLLAPSE.x}px ${COLLAPSE.y}px`, transform: `scale(${mix(1, 0.3, collapse)})` }}>
      <path d={d} stroke={C.citron} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {draw > 0 && <circle cx={head[0] - slide} cy={head[1]} r={7} fill={C.citron} />}
    </svg>
  );
};

/** The hero candle → the real capture's agent rail. */
const HeroCandle: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame > 104) return null;
  const p100 = phoneAt(100);
  const railTop = dpToFilm(p100, 16.5, 163.6);
  const railBot = dpToFilm(p100, 16.5, 677.4);
  const railW = 2.9 * p100.s;
  const m = prog(frame, 86, 100, EASE.inOut);
  const x0 = 1330 - frame * 0.5;
  const body = { x: mix(x0, railTop.x, m), top: mix(392, railTop.y, m), bot: mix(628, railBot.y, m), w: mix(30, railW, m) };
  const fade = frame >= 100 ? 1 - prog(frame, 100, 104, EASE.linear) : 1;
  const wick = 1 - m;
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <div style={{ position: "absolute", left: body.x + body.w / 2 - 1.5, top: body.top - 60 * wick, width: 3, height: body.bot - body.top + 120 * wick, background: C.sage, opacity: wick }} />
      <div
        style={{
          position: "absolute",
          left: body.x,
          top: body.top,
          width: body.w,
          height: body.bot - body.top,
          background: m < 0.5 ? C.sage : C.rail,
          opacity: mix(0.85, 1, m),
        }}
      />
    </AbsoluteFill>
  );
};

/** Small Elyra signature, top-left, from the very first frame. */
export const Signature: React.FC<{ frame: number }> = ({ frame }) => {
  const o = 1 - prog(frame, 84, 94, EASE.brand);
  if (o <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 96, top: 64, display: "flex", alignItems: "center", gap: 14, opacity: o }}>
      <Emblem size={52} />
      <div style={{ fontFamily: F.serif, fontSize: 42, color: C.ivory, lineHeight: "52px" }}>Elyra</div>
    </div>
  );
};

export const S1Markets: React.FC<{ frame: number }> = ({ frame }) => {
  if (frame > 104) return null;
  const collapse = prog(frame, 86, 100, EASE.in);
  return (
    <AbsoluteFill>
      {frame < 100 && (
        <>
          {/* A soft dark band keeps the statement legible over the field. */}
          <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(16,23,16,0.75) 0%, rgba(16,23,16,0.35) 48%, rgba(16,23,16,0) 70%)" }} />
          <DataLines frame={frame} collapse={collapse} />
          {LAYERS.map((l) => (
            <CandleLayer key={l.seed} spec={l} frame={frame} collapse={collapse} />
          ))}
          <MarketLabels frame={frame} collapse={collapse} />
          <Signal frame={frame} collapse={collapse} />
          <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(16,23,16,0.55) 0%, rgba(16,23,16,0.2) 40%, rgba(16,23,16,0) 58%)", opacity: clamp01(1 - collapse) }} />
        </>
      )}
      <HeroCandle frame={frame} />
      <Signature frame={frame} />
    </AbsoluteFill>
  );
};
