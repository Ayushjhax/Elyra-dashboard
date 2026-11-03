import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Card, Stage, type Rect } from "../components/Card";
import { Device, deviceMap, type DeviceT } from "../components/Device";
import { Media } from "../components/Shot";
import { Brackets, Headline } from "../components/Type";
import { prog, mix, track } from "../lib/motion";
import { useAbsFrame } from "../lib/frame";
import { C, F } from "../theme";

/* ---------------------------------------------------------------------------
   Chapter 01 · Ask Elyra (400–764)

   The phone plays the real recording (02-ask-stream, source frame = film
   frame here). Its question lifts out of the composer as a card and is sent
   on the recording's own send, frame 478. "Elyra is working…" follows. The
   headline lands while the work recedes; the real answer flies forward on
   the tonal hit at 600 and reveals bullet by bullet, held to read. Its
   sources then lift out on their own. ~15 s of waiting is compressed to ~2 s.
--------------------------------------------------------------------------- */

const Q: Rect = [200, 1355, 960, 360];
const WORK: Rect = [36, 1755, 1128, 140];
const ANS: Rect = [36, 1010, 1128, 710];
const SRC: Rect = [70, 1640, 560, 76];

export const Ask: React.FC = () => {
  const f = useAbsFrame();
  if (f < 400 || f >= 764) return null;

  /* the phone: in from the left, then pushed into depth for the headline */
  const pin = prog(f, 400, 418, "land");
  const pout = prog(f, 538, 562, "in");
  const phone: DeviceT = {
    x: mix(300, 430, pin) - 260 * pout,
    y: 560,
    s: mix(0.33, 0.31, pin) * (1 - 0.25 * pout),
    ry: mix(34, 20, pin),
    rx: 4,
  };
  const composer = deviceMap(phone, 600, 2150);

  /* question card: pops out of the composer, then is sent upward */
  const qPop = prog(f, 402, 426, "land");
  const qSend = prog(f, 478, 500, "land");
  const back = prog(f, 540, 558, "land"); // everything recedes for the headline
  const qx = mix(composer[0], 1222, qPop);
  const qy = mix(composer[1], 470, qPop) - 230 * qSend;
  const qScale = mix(0.22, 1, qPop) * mix(1, 0.78, qSend);

  /* working */
  const wIn = prog(f, 486, 502, "land");
  const pulse = (f - 486) % 25;
  const bar = prog(f, 492, 556, "lin");

  /* answer */
  const aIn = prog(f, 600, 618, "land");
  const reveal = track(
    [
      [600, 0.09],
      [606, 0.1],
      [616, 0.31, "land"],
      [628, 0.53, "land"],
      [642, 0.88, "land"],
      [652, 1, "land"],
    ],
    f,
  );
  const aUp = prog(f, 700, 718, "land");
  const srcPop = prog(f, 704, 724, "land");

  return (
    <AbsoluteFill>
      <Backdrop glowX={mix(1100, 960, back)} glowY={540} />
      {f < 566 && (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - pout, filter: back > 0 ? `blur(${6 * back}px)` : undefined }}>
          <Device t={phone} status="home" time="12:33" shadow={1 - pout}>
            <Sequence from={400} layout="none">
              <Media src={{ v: "02-ask-stream.mp4", t: 400 }} />
            </Sequence>
          </Device>
        </div>
      )}

      <Stage>
        {f < 600 && (
          <Card
            src="stills/ask-question-working.png"
            rect={Q}
            w={1150}
            x={qx}
            y={qy}
            scale={qScale}
            ry={mix(18, 0, qPop)}
            z={-700 * back}
            blur={7 * back}
            dim={0.45 * back}
            opacity={1 - prog(f, 586, 600, "lin")}
          />
        )}
        {f >= 486 && f < 600 && (
          <Card
            src="stills/ask-question-working.png"
            rect={WORK}
            w={1150}
            x={1222}
            y={mix(640, 560, wIn)}
            opacity={wIn * (1 - prog(f, 586, 600, "lin"))}
            z={-700 * back}
            blur={7 * back}
            dim={0.45 * back}
          >
            {({ w, h, at }) => {
              const [ix, iy] = at(110, 1826);
              const r = 18 + pulse * 2.2;
              return (
                <svg width={w} height={h + 40} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                  <circle cx={ix} cy={iy} r={r} fill="none" stroke={C.lime} strokeWidth={3} opacity={Math.max(0, 1 - pulse / 22)} />
                  <rect x={0} y={h + 18} width={w * bar} height={4} rx={2} fill={C.lime} />
                </svg>
              );
            }}
          </Card>
        )}

        {f >= 600 && (
          <Card
            src="stills/ask-answer-sol.png"
            rect={ANS}
            w={1240}
            x={960}
            y={mix(604, 470, aUp)}
            z={mix(-900, 0, aIn)}
            rx={mix(14, 0, aIn)}
            opacity={aIn}
            reveal={reveal}
            scale={mix(1, 0.9, aUp)}
            dim={0.4 * aUp}
          >
            {({ at }) => {
              if (f < 690) return null;
              const [x0, y0] = at(70, 1640);
              const [x1, y1] = at(630, 1716);
              const o = prog(f, 690, 698, "out") * (1 - prog(f, 712, 720, "lin"));
              return <Brackets rect={[x0, y0, x1 - x0, y1 - y0]} opacity={o} len={20} />;
            }}
          </Card>
        )}
        {f >= 704 && (
          <Card
            src="stills/ask-answer-sol.png"
            rect={SRC}
            w={920}
            x={960}
            y={mix(800, 846, srcPop)}
            z={mix(-300, 80, srcPop)}
            opacity={srcPop}
            radius={18}
          >
            {({ w, h }) => <Brackets rect={[-14, -14, w + 28, h + 28]} opacity={prog(f, 716, 724, "out")} len={30} stroke={4} />}
          </Card>
        )}
      </Stage>

      <Headline
        lines={[["Intelligence."], ["With", "evidence."]]}
        from={544}
        to={606}
        x={960}
        y={540 - 140}
        align="center"
        size={136}
        stagger={6}
        dur={14}
        accent={{ 2: C.citron }}
      />
      <Headline
        lines={[["Intelligence.", "With", "evidence."]]}
        from={606}
        to={700}
        x={960}
        y={104}
        align="center"
        size={58}
        stagger={2}
        dur={12}
        accent={{ 2: C.citron }}
      />
      {f >= 718 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            width: 1920,
            top: 948,
            textAlign: "center",
            fontFamily: F.sans,
            fontWeight: 500,
            fontSize: 40,
            color: C.ivory,
            opacity: prog(f, 718, 732, "out"),
            transform: `translateY(${(1 - prog(f, 718, 732, "land")) * 16}px)`,
          }}
        >
          Sources come from the tools it used.
        </div>
      )}
    </AbsoluteFill>
  );
};
