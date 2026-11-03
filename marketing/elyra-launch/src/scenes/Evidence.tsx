import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Shot, type Box } from "../components/Shot";
import { Brackets, Headline } from "../components/Type";
import { k, prog, mix } from "../lib/motion";
import { C } from "../theme";

/* ---------------------------------------------------------------------------
   400–700 · Reveal two: the answer has evidence.

   02-ask-stream, one real question and its real answer:
     source 0–478     the question drafted in the composer
     source 478       sent
     source 478–1369  "Elyra is working…" (≈15 s — compressed here to ≈2.5 s;
                      the compression is editorial, not a speed claim)
     source 1369      the completed answer, sources Pyth and Binance
   Timeline 600 is source 1369: the answer lands on the tonal hit.
--------------------------------------------------------------------------- */

const HOME_BG = "rgb(21,32,18)";

export const Evidence: React.FC = () => {
  const f = useCurrentFrame();
  const slab = (fr: number): Box => {
    const t = prog(fr, 470, 556, "out");
    const w = mix(1240, 1120, t);
    const h = mix(860, 780, t);
    return { x: 960 - w / 2, y: 548 - h / 2, w, h, r: 28, border: true, shadow: true };
  };
  /* the rail hand-off: the agent's lime rail becomes Capital's tab underline */
  const railT = prog(f, 692, 712, "whip");
  const railFade = 1 - prog(f, 712, 720, "lin");
  return (
    <AbsoluteFill>
      {/* the question, sent */}
      <Shot
        from={400}
        to={452}
        src={{ v: "02-ask-stream.mp4", t: 400, r: 1.5 }}
        cam={[k(400, 560, 2150, 1.6), k(452, 640, 2160, 1.72, "lin")]}
        name="Question" bg={HOME_BG}
      >
        {({ f: ff, map }) => {
          const [x, y] = map(1078, 2250);
          const p = prog(ff, 444, 452, "out");
          return (
            <svg style={{ position: "absolute", left: 0, top: 0 }} width={1920} height={1080}>
              <circle cx={x} cy={y} r={mix(20, 74, p)} fill="none" stroke={C.lime} strokeWidth={3} opacity={ff >= 444 ? 1 - p * 0.6 : 0} />
            </svg>
          );
        }}
      </Shot>

      {/* working */}
      <Shot from={452} to={470} src={{ v: "02-ask-stream.mp4", t: 560 }} cam={[k(452, 420, 1825, 2.4), k(470, 470, 1825, 2.5, "lin")]} name="Working" bg={HOME_BG} />

      {/* the headline over the real working state */}
      {f >= 470 && f < 556 && <Backdrop glow={0.8} />}
      <Shot from={470} to={556} src={{ v: "02-ask-stream.mp4", t: 650 }} box={slab} dim={0.6} cam={[k(470, 600, 1560, 1.02), k(556, 600, 1560, 0.98, "lin")]} name="Evidence slab" />
      <Headline
        lines={[["Intelligence."], ["With", "evidence."]]}
        from={472}
        to={556}
        x={960}
        y={548 - 136}
        align="center"
        size={132}
        stagger={6}
        dur={14}
        accent={{ 2: C.citron }}
      />

      {/* withdrawal: the work, closer */}
      <Shot from={556} to={600} src={{ v: "02-ask-stream.mp4", t: 1325 }} cam={[k(556, 420, 1825, 2.5), k(600, 440, 1825, 2.78, "in")]} name="Working, closer" bg={HOME_BG} />

      {/* the answer lands — hold the useful part, then its sources */}
      <Shot
        from={600}
        to={700}
        src={{ v: "02-ask-stream.mp4", t: 1369 }}
        cam={[k(600, 600, 1368, 1.62), k(614, 600, 1368, 1.52, "land"), k(664, 600, 1380, 1.52, "lin"), k(690, 430, 1572, 2.1, "land"), k(700, 430, 1584, 2.13, "lin")]}
        name="Answer" bg={HOME_BG}
      >
        {({ f: ff, map }) => {
          if (ff < 674) return null;
          const [x0, y0] = map(84, 1644);
          const [x1, y1] = map(574, 1708);
          const o = prog(ff, 674, 682, "out") * (1 - prog(ff, 694, 700, "lin"));
          return <Brackets rect={[x0, y0, x1 - x0, y1 - y0]} opacity={o} len={22} />;
        }}
      </Shot>

      {/* rail → underline */}
      {f >= 692 && f < 720 && (
        <svg style={{ position: "absolute", left: 0, top: 0 }} width={1920} height={1080}>
          <line
            x1={mix(162, 600, railT)}
            y1={mix(-20, 566, railT)}
            x2={mix(162, 1320, railT)}
            y2={mix(1100, 566, railT)}
            stroke={C.lime}
            strokeWidth={mix(9, 6, railT)}
            strokeLinecap="round"
            opacity={railFade}
          />
        </svg>
      )}
    </AbsoluteFill>
  );
};
