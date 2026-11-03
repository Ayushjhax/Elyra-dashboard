import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Shot, FULL, type Box } from "../components/Shot";
import { Brackets, Label, rectAt } from "../components/Type";
import { k, prog } from "../lib/motion";

/* ---------------------------------------------------------------------------
   700–1000 · Bring capital into context.

   The recorded account has no positions, activity or memory and tracks $0.
   None of that is hidden or repainted, and none of it is the hero: the
   sequence is about what context Elyra can take in, shown through the real
   selection controls, the real History / Memory surfaces, the portfolio's
   capital, holdings, risk and DeFi views, and the read-only connections —
   whose options say "Not connected", as they are.
--------------------------------------------------------------------------- */

const HOME_BG = "rgb(21,32,18)";

/* Account-context tiles in 03-capital-context (source px) */
const TILES: [number, number, number, number][] = [
  [62, 842, 520, 210], // Portfolio · Connected
  [614, 842, 526, 210], // Positions · None yet
  [62, 1088, 520, 210], // Activity · None yet
  [614, 1088, 526, 210], // Memory · Not set
];

export const Capital: React.FC = () => {
  const f = useCurrentFrame();
  /* History → Memory: a lateral slide, like the tab underline it follows */
  const slide = prog(f, 806, 820, "land");
  const histBox = (): Box => ({ ...FULL, x: -1920 * slide });
  const memBox = (): Box => ({ ...FULL, x: 1920 * (1 - slide) });
  return (
    <AbsoluteFill>
      <Backdrop />
      <Shot
        from={700}
        to={790}
        src={{ v: "03-capital-context.mp4", t: 0 }}
        bg={HOME_BG}
        cam={[k(700, 240, 655, 2.0), k(714, 240, 655, 2.0, "lin"), k(732, 600, 1000, 1.32, "land"), k(778, 600, 1036, 1.32, "lin"), k(790, 600, 1010, 1.24, "land")]}
        name="Account context"
      >
        {({ f: ff, map }) => {
          if (ff < 736) return null;
          const r = (i: number): [number, number, number, number] => {
            const [x, y, w, h] = TILES[i];
            const [a, b] = map(x, y);
            const [c, d] = map(x + w, y + h);
            return [a, b, c - a, d - b];
          };
          const rect = rectAt(
            [
              [738, r(0)],
              [750, r(1), "land"],
              [763, r(2), "land"],
              [775, r(3), "land"],
            ],
            ff,
          );
          const o = prog(ff, 736, 740, "out") * (1 - prog(ff, 782, 789, "lin"));
          return <Brackets rect={rect} opacity={o} len={30} />;
        }}
      </Shot>
      <Label from={752} to={850} x={1824} y={900} align="right" eyebrow="Capital intelligence" text="Your capital. In context." size={42} />

      {/* History, then Memory — conversational history and saved preferences */}
      <Shot from={790} to={820} src={{ img: "stills/capital-history.png" }} bg={HOME_BG} box={histBox} cam={[k(790, 600, 540, 1.62), k(820, 610, 540, 1.66, "lin")]} name="History" />
      <Shot from={806} to={850} src={{ img: "stills/capital-memory.png" }} bg={HOME_BG} box={memBox} cam={[k(806, 600, 528, 1.62), k(850, 600, 540, 1.68, "lin")]} name="Memory" />

      {/* the portfolio's capital surfaces */}
      <Shot
        from={850}
        to={925}
        src={{ img: "stills/portfolio-explore.png" }}
        cam={[k(850, 600, 1690, 1.3), k(925, 600, 1930, 1.3, "lin")]}
        name="Explore your portfolio"
      />

      {/* connections: read-only by design, honestly not connected */}
      <Shot
        from={925}
        to={1000}
        src={{ img: "stills/connections.png" }}
        cam={[k(925, 600, 540, 1.48), k(950, 600, 560, 1.48, "lin"), k(1000, 600, 820, 1.42, "io")]}
        name="Connections"
      />
    </AbsoluteFill>
  );
};
