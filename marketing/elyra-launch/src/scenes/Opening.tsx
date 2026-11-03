import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Device, deviceFor, deviceMap, type DeviceT } from "../components/Device";
import { Media, Shot } from "../components/Shot";
import { Headline, Label } from "../components/Type";
import { k, prog, mix, ease, type Ease, track } from "../lib/motion";
import { FILM } from "../theme";

/* ---------------------------------------------------------------------------
   0–400 · Enter under pressure → Reveal one: the terminal is mobile.

   One object carries the whole opening: the handset. For the first 184
   frames it is so close that only its screen exists — an extreme macro of
   the real SOL chart (01-markets) drifting across candles toward the live
   price. Three hard-cut accents show what the chart alone cannot explain:
   real funding extremes, real open interest, and the Pyth provenance line.
   At 184 the same image pulls out, without a cut, into the handset, which
   lands on the bass impact at 200.
--------------------------------------------------------------------------- */

type DK = { f: number; x: number; y: number; s: number; ry: number; rx: number; e?: Ease; cut?: boolean };

/* focus = content point at the frame centre; s = output px per device px */
const KEYS: DK[] = [
  { f: 0, x: 340, y: 1560, s: 3.0, ry: 0, rx: 0 },
  { f: 106, x: 790, y: 1560, s: 2.66, ry: 0, rx: 0, e: "lin" },
  { f: 162, x: 1010, y: 1536, s: 2.9, ry: 0, rx: 0, cut: true },
  { f: 184, x: 1030, y: 1536, s: 3.12, ry: 0, rx: 0, e: "lin" },
  { f: 202, x: 600, y: 1216, s: 0.345, ry: -15, rx: 5, e: "land" },
  { f: 262, x: 600, y: 1216, s: 0.35, ry: -9, rx: 3, e: "land" },
  { f: 302, x: 600, y: 1300, s: 0.37, ry: -3, rx: 1.5, e: "io" },
  { f: 352, x: 600, y: 1470, s: 0.47, ry: -1, rx: 0.5, e: "io" },
  { f: 390, x: 600, y: 1540, s: 0.62, ry: 0, rx: 0, e: "io" },
  { f: 400, x: 600, y: 1480, s: 1.6, ry: 0, rx: 0, e: "in" },
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
  const pop = prog(f, 262, 280, "land");
  const toShortcuts = prog(f, 352, 358, "lin");
  return (
    <>
      {f < 362 && f >= 262 && (
        <Sequence from={262} layout="none">
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
      {f >= 352 && (
        <Sequence from={352} layout="none">
          <div style={{ position: "absolute", inset: 0, opacity: toShortcuts }}>
            <Media src={{ v: "23-composer.mp4", t: 1318 }} />
          </div>
        </Sequence>
      )}
      {f < 280 && (
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
      [96, 0.5],
      [106, 0.12, "out"],
    ],
    f,
  );
  const glow = prog(f, 186, 214, "out");
  return (
    <AbsoluteFill>
      <Backdrop glow={glow} glowY={560} />
      <Device t={t} status={f < 271 ? "asset" : "home"} shadow={glow}>
        <Screen />
      </Device>

      {/* the hook sits over the chart macro */}
      {f < 106 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(1100px 620px at 50% 50%, rgba(8,12,8,${scrim}) 0%, rgba(8,12,8,${scrim * 0.6}) 60%, rgba(8,12,8,${scrim * 0.25}) 100%)`,
          }}
        />
      )}
      <Headline
        lines={[["LOOK", "PAST"], ["THE", "PRICE."]]}
        from={1}
        to={104}
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

      {/* what the chart alone cannot explain — real adjacent UI, hard cuts */}
      <Shot from={106} to={125} src={{ img: "stills/pulse-funding.png" }} cam={[k(106, 600, 1000, 1.75), k(125, 600, 1018, 1.78, "lin")]} name="Funding extremes" />
      <Shot from={125} to={144} src={{ img: "stills/pulse-oi.png" }} cam={[k(125, 600, 1060, 1.7), k(144, 600, 1084, 1.72, "lin")]} name="Largest open interest" />
      <Shot from={144} to={162} src={{ v: "01-markets.mp4", t: 144 }} cam={[k(144, 566, 2404, 1.85), k(162, 566, 2396, 1.88, "lin")]} name="Pyth provenance" />

      {/* Reveal one */}
      <Headline lines={[["A", "terminal."]]} from={205} to={300} x={688} y={318} align="right" size={100} stagger={4} />
      <Headline lines={[["In", "your", "hand."]]} from={215} to={300} x={1232} y={652} align="left" size={100} stagger={4} />

      {/* native affordances, anchored to the real controls on the handset */}
      <Label
        from={330}
        to={356}
        x={96}
        y={560}
        eyebrow="Ask Elyra"
        text="Attach images, PDFs and text files"
        width={520}
        anchor={deviceMap(t, 210, 2242)}
        leaderFrom={[520, 74]}
      />
      <Label
        from={358}
        to={400}
        x={1352}
        y={300}
        eyebrow="Ask Elyra"
        text="Type / for shortcuts"
        anchor={deviceMap(t, 1040, 700)}
        leaderFrom={[-20, 74]}
      />
      <Label
        from={364}
        to={400}
        x={1352}
        y={620}
        text="Dictate into the composer"
        anchor={deviceMap(t, 933, 1472)}
        leaderFrom={[-20, 24]}
      />
      {/* a hairline of light on the hardware edge as it lands */}
      {f >= 196 && f < 236 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(900px 500px at 50% 52%, ${FILM.glow}, rgba(0,0,0,0))`,
            opacity: 1 - prog(f, 200, 236, "out"),
          }}
        />
      )}
    </AbsoluteFill>
  );
};
