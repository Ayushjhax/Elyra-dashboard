import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Card, Stage, type Rect } from "../components/Card";
import { Headline } from "../components/Type";
import { prog, mix } from "../lib/motion";
import { useAbsFrame } from "../lib/frame";
import { C } from "../theme";

/* ---------------------------------------------------------------------------
   Chapter 02 · Capital (750–1064)

   Two ideas, each held long enough to read:
   1. Your capital, in context — the four real account-context sources
      (Portfolio · Connected, Positions, Activity, Memory), each checked.
      The account has none of the last three yet and says so; that stays.
   2. Read-only, by design — the real Connections copy. Nothing here implies
      a connected venue.
--------------------------------------------------------------------------- */

const HEAD: Rect = [40, 720, 1120, 100];
const TILES: Rect[] = [
  [58, 838, 528, 218],
  [610, 838, 534, 218],
  [58, 1084, 528, 218],
  [610, 1084, 534, 218],
];
const RO: Rect = [48, 486, 1104, 310];
const CONN: Rect = [48, 1836, 1104, 280];

const TILE_W = 512;
const POS = [
  [1036, 492],
  [1568, 492],
  [1036, 722],
  [1568, 722],
];
const LAND = [772, 784, 797, 809];

export const CapitalV2: React.FC = () => {
  const f = useAbsFrame();
  if (f < 750 || f >= 1064) return null;
  const swap = prog(f, 900, 922, "land"); // context → read-only
  const headIn = prog(f, 762, 780, "land");
  return (
    <AbsoluteFill>
      <Backdrop glowX={1300} glowY={560} />
      <Stage>
        <Card
          src="stills/capital-context.png"
          rect={HEAD}
          w={1044}
          x={1302}
          y={mix(330, 300, headIn)}
          opacity={headIn * (1 - swap)}
          z={-500 * swap}
          border={false}
          shadow={false}
          radius={0}
        />
        {TILES.map((r, i) => {
          const t = prog(f, LAND[i] - 14, LAND[i], "land");
          const ring = prog(f, LAND[i], LAND[i] + 16, "out");
          return (
            <Card
              key={i}
              src="stills/capital-context.png"
              rect={r}
              w={TILE_W}
              x={POS[i][0] + 40 * swap * (i % 2 ? 1 : -1)}
              y={POS[i][1]}
              z={mix(-900, 0, t) - 700 * swap}
              ry={mix(-28, 0, t)}
              rx={mix(12, 0, t)}
              opacity={t * (1 - swap)}
              radius={20}
            >
              {({ w, h }) =>
                ring > 0 && ring < 1 ? (
                  <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                    <circle cx={w * 0.155} cy={h * 0.5} r={24 + 46 * ring} fill="none" stroke={C.lime} strokeWidth={3} opacity={1 - ring} />
                  </svg>
                ) : null
              }
            </Card>
          );
        })}
        <Card
          src="stills/connections.png"
          rect={RO}
          w={1044}
          x={1302}
          y={mix(560, 430, prog(f, 914, 936, "land"))}
          z={mix(-600, 0, prog(f, 914, 936, "land"))}
          opacity={prog(f, 914, 936, "land")}
          radius={22}
        />
        <Card
          src="stills/account.png"
          rect={CONN}
          w={1044}
          x={1302}
          y={mix(820, 720, prog(f, 930, 952, "land"))}
          z={mix(-600, 0, prog(f, 930, 952, "land"))}
          opacity={prog(f, 930, 952, "land")}
          radius={22}
        />
      </Stage>

      <Headline lines={[["Your", "capital."], ["In", "context."]]} from={764} to={906} x={96} y={372} size={98} stagger={5} />
      <Headline lines={[["Read-only,"], ["by", "design."]]} from={912} to={1064} x={96} y={372} size={98} stagger={5} exit="none" accent={{ 2: C.citron }} />
    </AbsoluteFill>
  );
};
