import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Shot, FULL, type Box } from "../components/Shot";
import { Label } from "../components/Type";
import { k, prog, mix } from "../lib/motion";

/* ---------------------------------------------------------------------------
   1000–1200 · Follow the signal.

   Market information first: SOL's signal check (no threshold crossed — the
   app's own line is "A quiet market is a signal, too.") and what was checked
   (price movement, funding, venue divergence). The camera keeps falling, into
   tracked-wallet consensus (07-smart-money, populated Hyperliquid data).

   Semantics are kept: the percentage is Share of value — the observed share
   of position value on one side — and the label beside it says so.
--------------------------------------------------------------------------- */

const HOME_BG = "rgb(21,32,18)";
const SLAB: Box = { x: 112, y: 60, w: 1150, h: 960, r: 28, border: true, shadow: true };

export const Signals: React.FC = () => {
  const box = (f: number): Box => {
    const t = prog(f, 1080, 1100, "land");
    return {
      x: mix(FULL.x, SLAB.x, t),
      y: mix(FULL.y, SLAB.y, t),
      w: mix(FULL.w, SLAB.w, t),
      h: mix(FULL.h, SLAB.h, t),
      r: mix(0, 28, t),
      border: t > 0.5,
      shadow: t > 0.5,
    };
  };
  return (
    <AbsoluteFill>
      <Backdrop glowX={700} />
      <Shot
        from={1000}
        to={1080}
        src={{ img: "stills/research-signals.png" }}
        cam={[k(1000, 600, 1170, 1.42), k(1044, 600, 1196, 1.46, "lin"), k(1062, 600, 2050, 1.36, "land"), k(1080, 600, 2090, 1.36, "lin")]}
        name="Signals, in context"
      />
      <Label from={1004} to={1078} x={1824} y={40} align="right" eyebrow="Signals" text="Price, funding and venue checks" size={34} />

      <Shot
        from={1080}
        to={1200}
        src={{ v: "07-smart-money.mp4", t: 60 }}
        bg={HOME_BG}
        box={box}
        cam={[k(1080, 600, 760, 1.36), k(1100, 600, 1372, 1.0, "land"), k(1200, 600, 1392, 1.02, "lin")]}
        name="Smart-money consensus"
      >
        {({ f, map }) => {
          if (f < 1104) return null;
          const header = map(1092, 1180);
          return (
            <>
              <Label from={1104} to={1200} x={1340} y={130} eyebrow="Signals / Smart money" text="Tracked-wallet consensus on Hyperliquid" width={470} size={40} />
              <Label
                from={1118}
                to={1200}
                x={1340}
                y={470}
                text="Share of value: the observed share of position value on that side — not a win rate."
                width={470}
                size={36}
                anchor={[header[0] + 70, header[1]]}
                leaderFrom={[-22, 20]}
              />
            </>
          );
        }}
      </Shot>
    </AbsoluteFill>
  );
};
