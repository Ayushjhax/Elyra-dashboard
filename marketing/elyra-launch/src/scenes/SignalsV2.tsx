import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Card, Stage, type Rect } from "../components/Card";
import { Headline, Label } from "../components/Type";
import { prog, mix } from "../lib/motion";
import { useAbsFrame } from "../lib/frame";
import { C, F } from "../theme";

/* ---------------------------------------------------------------------------
   Chapter 03 · Signals (1050–1364)

   1. The app's own line, big: "A quiet market is a signal, too." (SOL, no
      threshold crossed).
   2. Smart-money consensus — the real table (HYPE, ETH, ZEC, SOL), then the
      HYPE row's real expansion: mark, their average entry, since entry, and
      the tracked wallets. The percentage is labelled for what it is: the
      observed share of position value on that side, not a win rate.
--------------------------------------------------------------------------- */

const QUOTE: Rect = [56, 918, 1088, 540];
const HEAD: Rect = [36, 1130, 1128, 96];
const ROWS: Rect[] = [
  [36, 1255, 1128, 190],
  [36, 1447, 1128, 190],
  [36, 1641, 1128, 190],
  [36, 1833, 1128, 190],
];
const EXP: Rect = [36, 1255, 1128, 760];
const W = 1060;
const S = W / 1128;
const ROW_Y = [370, 556, 742, 928];

export const SignalsV2: React.FC = () => {
  const f = useAbsFrame();
  if (f < 1050 || f >= 1364) return null;
  const qIn = prog(f, 1064, 1086, "land");
  const qOut = prog(f, 1132, 1148, "in");
  const expand = prog(f, 1236, 1264, "land");
  return (
    <AbsoluteFill>
      <Backdrop glowX={f < 1140 ? 960 : 700} glowY={560} />
      <Stage>
        {f < 1150 && (
          <Card
            src="stills/research-signals.png"
            rect={QUOTE}
            w={1300}
            x={960}
            y={mix(580, 560, qIn) - 120 * qOut}
            z={mix(-800, 0, qIn) - 500 * qOut}
            rx={mix(12, 0, qIn)}
            opacity={qIn * (1 - qOut)}
          />
        )}
        {f >= 1140 && (
          <>
            <Card
              src="stills/signals-consensus.png"
              rect={HEAD}
              w={W}
              x={640}
              y={236}
              opacity={prog(f, 1142, 1156, "land")}
              radius={16}
            />
            {ROWS.map((r, i) => {
              const t = prog(f, 1146 + i * 12, 1164 + i * 12, "land");
              const away = i === 0 ? 0 : prog(f, 1228, 1246, "in");
              if (i === 0 && expand > 0) return null;
              return (
                <Card
                  key={i}
                  src="stills/signals-consensus.png"
                  rect={r}
                  w={W}
                  x={mix(320, 640, t)}
                  y={ROW_Y[i] + 70 * away}
                  z={mix(-500, 0, t)}
                  ry={mix(24, 0, t)}
                  opacity={t * (1 - away)}
                  radius={18}
                />
              );
            })}
            {expand > 0 && (
              <Card
                src="stills/smart-money.png"
                rect={EXP}
                w={W}
                x={640}
                y={280 + (EXP[3] * S) / 2}
                reveal={mix(190 / 760, 1, expand)}
                radius={18}
              />
            )}
          </>
        )}
      </Stage>

      {f >= 1140 && (
        <>
          <Headline lines={[["Smart-money"], ["consensus."]]} from={1150} to={1364} x={1236} y={196} size={100} weight={400} family={F.serif} tracking={-0.01} stagger={6} exit="none" />
          {f >= 1166 && (
            <div
              style={{
                position: "absolute",
                left: 1238,
                top: 420,
                width: 600,
                fontFamily: F.sans,
                fontWeight: 500,
                fontSize: 36,
                lineHeight: 1.25,
                color: C.secondary,
                opacity: prog(f, 1166, 1180, "out"),
              }}
            >
              Elyra’s read of top Hyperliquid wallets.
            </div>
          )}
          <Label
            from={1266}
            to={1364}
            x={1238}
            y={620}
            width={540}
            size={34}
            text="Share of value: the observed share of position value on that side — not a win rate."
            anchor={[110 + (954 - 36) * S + 8, 280 + (1330 - 1255) * S]}
            leaderFrom={[-22, 24]}
          />
        </>
      )}
    </AbsoluteFill>
  );
};
