import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Brackets, Headline } from "../components/Type";
import { Card, Stage, type Rect } from "../components/Card";
import { prog, mix } from "../lib/motion";
import { useAbsFrame } from "../lib/frame";
import { C, F } from "../theme";

/* ---------------------------------------------------------------------------
   Chapter 05 · Wallet (1900–2174) and Chapter 06 · Alerts (2160–2346)

   Wallet: the real action row (Receive · Swap · Transfer · Withdraw), then
   the Actions surface's own promise, step by step — 01 Ask, 02 Review,
   03 Sign: "Nothing is sent until your wallet signs." No quote, signature or
   success state is shown; this account is unfunded.

   Alerts: the real SOL price-alert form, then its delivery note as it is for
   this account ("Inbox only · price pushes are off"). The closing line is
   the product rule: a rule tells the person; it never trades.
--------------------------------------------------------------------------- */

const ACT: Rect = [40, 1146, 1120, 280];
// each step between the panel's own dividers (1712, 1978), inside its borders
const STEPS: Rect[] = [
  [63, 1400, 1074, 310],
  [63, 1716, 1074, 260],
  [63, 1982, 1074, 268],
];
const STEP_Y = [279, 558, 818];
const FORM: Rect = [16, 1262, 1168, 790];
const INBOX: Rect = [51, 2067, 1098, 336]; // the delivery note, inside its border
const FIELD: Rect = [48, 1632, 1104, 144]; // the alert price field, exact

export const Wallet: React.FC = () => {
  const f = useAbsFrame();
  if (f < 1900 || f >= 2174) return null;
  const aIn = prog(f, 1916, 1938, "land");
  const aOut = prog(f, 1990, 2006, "in");
  return (
    <AbsoluteFill>
      <Backdrop glowY={600} />
      <Stage>
        {f < 2010 && (
          <Card
            src="stills/portfolio.png"
            rect={ACT}
            w={1300}
            x={960}
            y={mix(680, 600, aIn) - 160 * aOut}
            z={mix(-700, 0, aIn) - 400 * aOut}
            rx={mix(22, 0, aIn)}
            opacity={aIn * (1 - aOut)}
          >
            {({ w, h, at }) => {
              const [rx, ry] = at(186, 1240);
              const rings = [1950, 1972].map((s) => prog(f, s, s + 18, "out"));
              return (
                <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                  {rings.map((r, i) => (r > 0 && r < 1 ? <circle key={i} cx={rx} cy={ry} r={40 + 70 * r} fill="none" stroke={C.lime} strokeWidth={3} opacity={1 - r} /> : null))}
                </svg>
              );
            }}
          </Card>
        )}
        {STEPS.map((r, i) => {
          const t = prog(f, 2010 + i * 14, 2030 + i * 14, "land");
          return (
            <Card key={i} src="stills/actions-steps.png" rect={r} w={1000} x={mix(1500, 1300, t)} y={STEP_Y[i]} z={mix(-500, 0, t)} ry={mix(-26, 0, t)} opacity={t} radius={20}>
              {({ w, at }) => {
                if (i !== 2 || f < 2066) return null;
                const [x0, y0] = at(315, 2163);
                const [x1] = at(1082, 2163);
                const d = prog(f, 2066, 2088, "land");
                return (
                  <svg width={w} height={400} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                    <rect x={x0} y={y0} width={(x1 - x0) * d} height={5} rx={2.5} fill={C.lime} />
                  </svg>
                );
              }}
            </Card>
          );
        })}
      </Stage>
      <Headline lines={[["Prepare", "your", "move."]]} from={1918} to={2002} x={960} y={168} align="center" size={110} stagger={5} />
      {f >= 1936 && f < 2002 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            width: 1920,
            top: 846,
            textAlign: "center",
            fontFamily: F.sans,
            fontWeight: 500,
            fontSize: 40,
            color: C.secondary,
            opacity: prog(f, 1936, 1950, "out") * (1 - prog(f, 1992, 2002, "in")),
          }}
        >
          Swap, transfer, receive — every move signed by you.
        </div>
      )}
      <Headline lines={[["You", "stay"], ["in", "control."]]} from={2006} to={2175} x={96} y={372} size={104} weight={400} family={F.serif} tracking={-0.01} stagger={6} exit="none" />
    </AbsoluteFill>
  );
};

export const Alerts: React.FC = () => {
  const f = useAbsFrame();
  if (f < 2160 || f >= 2348) return null;
  const fIn = prog(f, 2174, 2196, "land");
  const swap = prog(f, 2252, 2272, "land");
  const out = prog(f, 2328, 2346, "in");
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      {f < 2340 && <Backdrop glowX={700} glowY={560} />}
      <Stage>
        <Card
          src="stills/alert-form.png"
          rect={FORM}
          w={1000}
          x={mix(600, 640, fIn) - 120 * swap}
          y={560 - 110 * swap}
          z={mix(-800, 0, fIn) - 640 * swap}
          ry={mix(24, 0, fIn) + 10 * swap}
          dim={0.6 * swap}
          blur={4 * swap}
          opacity={fIn * (1 - 0.55 * swap)}
          scale={1 - 0.15 * out}
        >
          {({ at }) => {
            if (f < 2204 || swap > 0.3) return null;
            const [x0, y0] = at(FIELD[0], FIELD[1]);
            const [x1, y1] = at(FIELD[0] + FIELD[2], FIELD[1] + FIELD[3]);
            return <Brackets rect={[x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12]} opacity={prog(f, 2204, 2212, "out")} len={26} />;
          }}
        </Card>
        <Card
          src="stills/alert-form.png"
          rect={INBOX}
          w={1000}
          x={640}
          y={mix(760, 600, swap)}
          z={mix(-500, 80, swap)}
          rx={mix(-18, 0, swap)}
          opacity={swap}
          scale={1 - 0.15 * out}
        />
      </Stage>
      <Headline lines={[["Set", "the"], ["condition."]]} from={2176} to={2258} x={1176} y={372} size={96} stagger={5} />
      <Headline lines={[["Tells", "you."], ["Never", "trades."]]} from={2260} to={2348} x={1176} y={372} size={96} stagger={5} exit="none" accent={{ 2: C.citron, 3: C.citron }} />
    </AbsoluteFill>
  );
};
