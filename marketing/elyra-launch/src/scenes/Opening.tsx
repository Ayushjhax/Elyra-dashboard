import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Device, deviceFor, deviceMap, type DeviceT } from "../components/Device";
import { Media } from "../components/Shot";
import { Headline, Label } from "../components/Type";
import { prog, mix, ease, type Ease, track } from "../lib/motion";
import { FILM } from "../theme";

/* ---------------------------------------------------------------------------
   0–300 · Enter under pressure → Reveal one: the terminal is mobile.

   One object carries the whole opening: the handset. For the first 84
   frames it is so close that only its screen exists — an extreme macro of
   the real SOL chart (01-markets) drifting across candles toward the live
   price, under "LOOK PAST THE PRICE." At 84 the same image pulls out,
   without a cut, into the handset, which lands on the bass impact at 100.
   (Revision 4 removed the three insert cuts and the price-tag hold that
   used to sit between the hook and the pull-out — one bar, 100 frames.)
--------------------------------------------------------------------------- */

type DK = { f: number; x: number; y: number; s: number; ry: number; rx: number; e?: Ease; cut?: boolean };

/* focus = content point at the frame centre; s = output px per device px */
const KEYS: DK[] = [
  { f: 0, x: 340, y: 1560, s: 3.0, ry: 0, rx: 0 },
  { f: 84, x: 700, y: 1560, s: 2.74, ry: 0, rx: 0, e: "lin" },
  { f: 102, x: 600, y: 1216, s: 0.345, ry: -15, rx: 5, e: "land" }, // the pull-out, landing on 100
  { f: 162, x: 600, y: 1216, s: 0.35, ry: -9, rx: 3, e: "land" },
  { f: 202, x: 600, y: 1300, s: 0.37, ry: -3, rx: 1.5, e: "io" },
  { f: 252, x: 600, y: 1470, s: 0.47, ry: -1, rx: 0.5, e: "io" },
  { f: 290, x: 600, y: 1540, s: 0.62, ry: 0, rx: 0, e: "io" },
  { f: 300, x: 600, y: 1480, s: 1.6, ry: 0, rx: 0, e: "in" },
];

function deviceAt(f: number): DeviceT {
  let a = KEYS[0];
  let b = KEYS[0];
  let t = 0;
  if (f >= KEYS[KEYS.length - 1].f) {
    a = b = KEYS[KEYS.length - 1];
  } else if (f > KEYS[0].f) {
    for (let i = 1; i < KEYS.length; i++) {
      if (f < KEYS[i].f) {
        a = KEYS[i - 1];
        b = KEYS[i];
        t = b.cut ? 0 : ease(b.e ?? "io", (f - a.f) / (b.f - a.f));
        break;
      }
    }
  }
  const x = mix(a.x, b.x, t);
  const y = mix(a.y, b.y, t);
  const s = Math.exp(mix(Math.log(a.s), Math.log(b.s), t));
  const base = deviceFor(x, y, s);
  return { ...base, ry: mix(a.ry, b.ry, t), rx: mix(a.rx, b.rx, t) };
}

/** The handset's screen: the chart, a native stack pop to Ask, the attach
 *  sheet, then the "/" shortcut list. */
const Screen: React.FC = () => {
  const f = useCurrentFrame();
  const pop = prog(f, 162, 180, "land");
  const toShortcuts = prog(f, 252, 258, "lin");
  return (
    <>
      {f < 262 && f >= 162 && (
        <Sequence from={162} layout="none">
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: `translateX(${-300 * (1 - pop)}px)`,
              opacity: 1 - toShortcuts,
            }}
          >
            <Media src={{ v: "23-composer.mp4", t: 32 }} />
            <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${0.45 * (1 - pop)})` }} />
          </div>
        </Sequence>
      )}
      {f >= 252 && (
        <Sequence from={252} layout="none">
          <div style={{ position: "absolute", inset: 0, opacity: toShortcuts }}>
            <Media src={{ v: "23-composer.mp4", t: 1318 }} />
          </div>
        </Sequence>
      )}
      {f < 180 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translateX(${1200 * pop}px)`,
            boxShadow: pop > 0 ? "-24px 0 48px rgba(0,0,0,0.5)" : undefined,
          }}
        >
          <Media src={{ v: "01-markets.mp4", t: 0 }} />
        </div>
      )}
    </>
  );
};

export const Opening: React.FC = () => {
  const f = useCurrentFrame();
  const t = deviceAt(f);
  const scrim = track(
    [
      [0, 0.5],
      [80, 0.5],
      [90, 0.12, "out"],
    ],
    f,
  );
  const glow = prog(f, 86, 114, "out");
  return (
    <AbsoluteFill>
      <Backdrop glow={glow} glowY={560} />
      <Device t={t} status={f < 171 ? "asset" : "home"} shadow={glow}>
        <Screen />
      </Device>

      {/* the hook sits over the chart macro */}
      {f < 90 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(1100px 620px at 50% 50%, rgba(8,12,8,${scrim}) 0%, rgba(8,12,8,${scrim * 0.6}) 60%, rgba(8,12,8,${scrim * 0.25}) 100%)`,
          }}
        />
      )}
      <Headline
        lines={[["LOOK", "PAST"], ["THE", "PRICE."]]}
        from={1}
        to={90}
        x={960}
        y={540 - 162}
        align="center"
        size={168}
        weight={800}
        tracking={-0.035}
        lineHeight={0.94}
        stagger={4}
        dur={12}
      />

      {/* Reveal one */}
      <Headline lines={[["A", "terminal."]]} from={105} to={200} x={688} y={318} align="right" size={100} stagger={4} />
      <Headline lines={[["In", "your", "hand."]]} from={115} to={200} x={1232} y={652} align="left" size={100} stagger={4} />

      {/* native affordances, anchored to the real controls on the handset */}
      <Label
        from={230}
        to={256}
        x={96}
        y={560}
        eyebrow="Ask Elyra"
        text="Attach images, PDFs and text files"
        width={520}
        anchor={deviceMap(t, 210, 2242)}
        leaderFrom={[520, 74]}
      />
      <Label
        from={258}
        to={300}
        x={1352}
        y={300}
        eyebrow="Ask Elyra"
        text="Type / for shortcuts"
        anchor={deviceMap(t, 1040, 700)}
        leaderFrom={[-20, 74]}
      />
      <Label
        from={264}
        to={300}
        x={1352}
        y={620}
        text="Dictate into the composer"
        anchor={deviceMap(t, 933, 1472)}
        leaderFrom={[-20, 24]}
      />
      {/* a hairline of light on the hardware edge as it lands */}
      {f >= 96 && f < 136 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(900px 500px at 50% 52%, ${FILM.glow}, rgba(0,0,0,0))`,
            opacity: 1 - prog(f, 100, 136, "out"),
          }}
        />
      )}
    </AbsoluteFill>
  );
};
