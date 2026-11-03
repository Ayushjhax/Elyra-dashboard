import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Card, Stage, type Rect } from "../components/Card";
import { Headline } from "../components/Type";
import { prog, mix } from "../lib/motion";
import { useAbsFrame } from "../lib/frame";
import { C, F } from "../theme";
import curve from "../lib/equity-curve.json";

/* ---------------------------------------------------------------------------
   Chapter 04 · Research (1350–1914)

   Reports (with the PDF) and Backtests each get a held hero; the remaining
   six tools turn past in a carousel, each named large; then all eight sit in
   one wall. Every card is a crop of a real result produced on the Seeker:
   the NVIDIA Q2 FY2027 report ("Verified with warnings"), the SOL RSI (12)
   backtest — its real curve traced by a cursor that follows the pixels of
   the curve (src/lib/equity-curve.json) — and the three-way comparison with
   the app's own caveat. Unlocks shows its provider as unavailable.
--------------------------------------------------------------------------- */

const R_HEAD: Rect = [36, 200, 1128, 330];
const R_SCORE: Rect = [56, 1296, 1088, 820];
const R_PDF: Rect = [40, 80, 1120, 640];
const R_BT: Rect = [52, 515, 1096, 940];
const R_CMP: Rect[] = [
  [52, 776, 1096, 428],
  [52, 1229, 1096, 438],
  [52, 1691, 1096, 440],
];
const R_NOWIN: Rect = [52, 2168, 1096, 92];

type Tool = { name: string[]; src: string; rect: Rect; w: number };
const CAROUSEL: Tool[] = [
  { name: ["Prediction", "markets"], src: "stills/research-predictions.png", rect: [36, 390, 1128, 1110], w: 860 },
  { name: ["Market", "recap"], src: "stills/research-recap.png", rect: [36, 400, 1128, 1430], w: 680 },
  { name: ["Signals"], src: "stills/research-signals.png", rect: [36, 400, 1128, 1100], w: 860 },
  { name: ["Yield"], src: "stills/yield-pools.png", rect: [36, 420, 1128, 900], w: 920 },
  { name: ["Unlocks"], src: "stills/research-unlocks.png", rect: [36, 400, 1128, 1130], w: 850 },
  { name: ["SEC", "insiders"], src: "stills/sec-company.png", rect: [52, 1585, 1096, 470], w: 1000 },
];
const STEP0 = 1612;
const STEP = 37.5;

const WALL: { src: string; rect: Rect }[] = [
  { src: "stills/report-top.png", rect: [36, 200, 1128, 900] },
  { src: "stills/bt-curve.png", rect: [52, 515, 1096, 877] },
  { src: "stills/research-predictions.png", rect: [36, 390, 1128, 900] },
  { src: "stills/research-recap.png", rect: [36, 400, 1128, 900] },
  { src: "stills/research-signals.png", rect: [36, 400, 1128, 900] },
  { src: "stills/yield-pools.png", rect: [36, 420, 1128, 900] },
  { src: "stills/research-unlocks.png", rect: [36, 400, 1128, 900] },
  { src: "stills/research-sec.png", rect: [36, 360, 1128, 900] },
];

const PTS = curve.points as [number, number][];
function curveY(x: number): number {
  if (x <= PTS[0][0]) return PTS[0][1];
  for (let i = 1; i < PTS.length; i++) {
    if (x <= PTS[i][0]) {
      const [x0, y0] = PTS[i - 1];
      const [x1, y1] = PTS[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return PTS[PTS.length - 1][1];
}

export const ResearchV2: React.FC = () => {
  const f = useAbsFrame();
  if (f < 1350 || f >= 1914) return null;

  /* --- reports --- */
  const rIn = prog(f, 1364, 1384, "land");
  const sIn = prog(f, 1372, 1394, "land");
  const pdfIn = prog(f, 1418, 1440, "land");
  const rOut = prog(f, 1462, 1478, "in");

  /* --- backtests --- */
  const bIn = prog(f, 1474, 1494, "land");
  const trace = prog(f, 1490, 1552, "io");
  const cmp = prog(f, 1556, 1574, "land");
  const bOut = prog(f, 1600, 1614, "in");
  const cursorX = mix(PTS[0][0], PTS[PTS.length - 1][0], trace);

  /* --- carousel --- */
  const cStep = (f - STEP0) / STEP; // 0..6
  const inCarousel = f >= 1598 && f < 1852;

  /* --- wall --- */
  const wall = prog(f, 1838, 1862, "land");

  return (
    <AbsoluteFill>
      <Backdrop glowX={1200} glowY={540} />
      <Stage>
        {/* Reports */}
        {f < 1480 && (
          <>
            <Card src="stills/report-top.png" rect={R_HEAD} w={860} x={1200} y={mix(200, 232, rIn) - 300 * rOut} z={mix(-700, 0, rIn) - 400 * rOut} opacity={rIn * (1 - rOut)} radius={22} />
            <Card src="stills/report-top.png" rect={R_SCORE} w={860} x={1200} y={mix(760, 690, sIn) + 200 * rOut} z={mix(-700, 0, sIn) - 400 * rOut} rx={mix(16, 0, sIn)} opacity={sIn * (1 - rOut)} radius={22} />
            <Card
              src="stills/pdf-cover.png"
              rect={R_PDF}
              imgW={1200}
              imgH={2040}
              w={600}
              x={mix(1200, 1560, pdfIn)}
              y={mix(690, 770, pdfIn)}
              z={mix(-200, 140, pdfIn)}
              ry={mix(0, -16, pdfIn)}
              rz={mix(0, 3, pdfIn)}
              opacity={pdfIn * (1 - rOut)}
              radius={10}
            />
          </>
        )}

        {/* Backtests */}
        {f >= 1470 && f < 1616 && (
          <>
            <Card
              src="stills/bt-curve.png"
              rect={R_BT}
              w={980}
              x={mix(1250, 1010, cmp)}
              y={560}
              z={mix(-800, 0, bIn) - 360 * cmp}
              rx={mix(14, 0, bIn)}
              dim={0.5 * cmp}
              opacity={bIn * (1 - bOut)}
            >
              {({ w, h, at }) => {
                if (cmp > 0.5) return null;
                const [mx0] = at(cursorX, 0);
                const [, my0] = at(0, 905);
                const [mx1, my1] = at(1150, 1300);
                const [cx, cy] = at(cursorX, curveY(cursorX));
                const [, top] = at(0, 905);
                return (
                  <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
                    {trace < 1 && <rect x={mx0 + 6} y={my0} width={Math.max(0, mx1 - mx0)} height={my1 - my0} fill="rgb(24,33,23)" />}
                    {trace > 0 && trace < 1 && (
                      <>
                        <line x1={cx} y1={top} x2={cx} y2={my1} stroke={C.ivory} strokeOpacity={0.3} strokeWidth={1.5} />
                        <circle cx={cx} cy={cy} r={16} fill="none" stroke={C.lime} strokeOpacity={0.5} strokeWidth={2} />
                        <circle cx={cx} cy={cy} r={8} fill={C.lime} />
                      </>
                    )}
                  </svg>
                );
              }}
            </Card>
            {R_CMP.map((r, i) => {
              const t = prog(f, 1558 + i * 7, 1576 + i * 7, "land");
              return (
                <Card
                  key={i}
                  src="stills/bt-compare.png"
                  rect={r}
                  w={720}
                  x={mix(1900, 1400, t)}
                  y={258 + i * 262}
                  z={mix(-400, 60, t)}
                  ry={mix(-30, -6, t)}
                  opacity={t * (1 - bOut)}
                  radius={18}
                />
              );
            })}
            <Card
              src="stills/bt-compare.png"
              rect={R_NOWIN}
              w={980}
              x={1300}
              y={975}
              opacity={prog(f, 1578, 1592, "out") * (1 - bOut)}
              border={false}
              radius={10}
            />
          </>
        )}

        {/* Carousel of the other six tools */}
        {inCarousel &&
          CAROUSEL.map((tool, i) => {
            // each step: a quick move onto card `base` (first 38%), then a hold
            const base = Math.floor(cStep);
            const frac = cStep - base;
            const e = prog(frac, 0, 0.38, "land");
            const pos = i - (base - 1 + e);
            if (Math.abs(pos) > 1.4) return null;
            const appear = prog(f, STEP0 - 14, STEP0, "land");
            return (
              <Card
                key={i}
                src={tool.src}
                rect={tool.rect}
                w={tool.w}
                x={1230 + pos * (pos < 0 ? 980 : 760)}
                y={548}
                z={-Math.abs(pos) * 760}
                ry={-pos * 40}
                opacity={Math.max(0, 1 - Math.abs(pos) * (pos < 0 ? 1.7 : 0.85)) * (i === 0 ? appear : 1) * (1 - wall)}
                dim={Math.min(0.6, Math.abs(pos) * 0.6)}
              />
            );
          })}

        {/* The wall: all eight */}
        {f >= 1838 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              transformStyle: "preserve-3d",
              transform: `translateY(56px) rotateX(${mix(14, 6, wall)}deg) scale(${mix(1.06, 0.94, prog(f, 1838, 1914, "out"))})`,
            }}
          >
            {WALL.map((c, i) => {
              const t = prog(f, 1838 + i * 2.5, 1856 + i * 2.5, "land");
              const col = i % 4;
              const row = Math.floor(i / 4);
              return (
                <Card key={i} src={c.src} rect={c.rect} w={392} x={960 + (col - 1.5) * 424} y={436 + row * 344} z={mix(-700, 0, t)} rx={mix(20, 0, t)} opacity={t} radius={16} />
              );
            })}
          </div>
        )}
      </Stage>

      {/* names */}
      <Headline lines={[["Reports"]]} from={1366} to={1474} x={96} y={404} size={118} stagger={0} dur={14} />
      <SubLine f={f} from={1380} to={1474} text="Company reports from SEC filings, as a PDF." />
      <Headline lines={[["Backtests"]]} from={1476} to={1560} x={96} y={404} size={118} stagger={0} dur={14} />
      <SubLine f={f} from={1488} to={1560} text="Explore a strategy before you act." />
      <Headline lines={[["Compare"]]} from={1560} to={1612} x={96} y={404} size={118} stagger={0} dur={12} />
      {inCarousel && f < 1840 &&
        CAROUSEL.map((tool, i) => {
          const a = STEP0 + i * STEP;
          return <Headline key={i} lines={tool.name.map((w) => [w])} from={Math.round(a)} to={Math.round(a + STEP)} x={96} y={tool.name.length > 1 ? 400 : 452} size={108} stagger={3} dur={10} />;
        })}
      {inCarousel && f < 1840 && (
        <div style={{ position: "absolute", left: 98, top: 350, fontFamily: F.sans, fontWeight: 600, fontSize: 22, letterSpacing: "0.16em", color: C.citron }}>
          {`0${Math.min(8, 3 + Math.max(0, Math.floor(cStep + 0.05)))} / 08`}
        </div>
      )}
      <Headline lines={[["Eight", "research", "tools.", "One", "tab."]]} from={1846} to={1914} x={960} y={112} align="center" size={78} stagger={3} dur={12} exit="none" accent={{ 3: C.citron, 4: C.citron }} />
    </AbsoluteFill>
  );
};

const SubLine: React.FC<{ f: number; from: number; to: number; text: string }> = ({ f, from, to, text }) => {
  if (f < from || f >= to) return null;
  const t = prog(f, from, from + 14, "land") * (1 - prog(f, to - 8, to, "in"));
  return (
    <div
      style={{
        position: "absolute",
        left: 98,
        top: 548,
        width: 560,
        fontFamily: F.sans,
        fontWeight: 500,
        fontSize: 36,
        lineHeight: 1.25,
        color: C.secondary,
        opacity: t,
        transform: `translateY(${(1 - t) * 14}px)`,
      }}
    >
      {text}
    </div>
  );
};
