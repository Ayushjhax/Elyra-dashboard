import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Pointer } from "../components/Pointer";
import { Mark, type Region } from "../components/Still";
import { Kicker, Title } from "../components/Type";
import { camAt, k, mix, prog, track, type Cam, type NumKey } from "../lib/motion";
import { C, W } from "../theme";

/* ---------------------------------------------------------------------------
   Bars 3–5 (frames 200–500 of the film; 0–300 here). The claim, as it happens
   on the website: three captures of one session, in order.

     01-home-live   signed in, Live selected in the header
     02-claim       Paper pressed: the claim dialog, "Claim $100,000"
     03-home-paper  claimed: Paper selected, the green band with the equity

   One camera moves over all three (source pixels, 3200 × 1800), and the
   pointer is pinned to source points, so it stays on the button it is
   pressing while the camera travels. Captures cross-dissolve where the
   website itself changed state.
--------------------------------------------------------------------------- */

const CARD = { w: 1040, h: 585, x: (W - 1040) / 2, y: 118 };
const SRC = { w: 3200, h: 1800 };
const FIT = CARD.w / SRC.w;

/* Points on the captures. */
const PAPER_RADIO = { x: 2184, y: 62 };
const CLAIM_BUTTON = { x: 1876, y: 1116 };
const CLAIM_COPY: Region = { x: 1210, y: 690, w: 760, h: 74 };
const BAND_FIGURES: Region = { x: 2338, y: 142, w: 506, h: 48 };

const CAMERA = [
  k(0, 1600, 900, FIT),
  k(16, 1600, 900, FIT),
  k(60, 2050, 472, 0.62),
  k(84, 2050, 472, 0.62),
  k(120, 1600, 900, 0.86),
  k(178, 1600, 900, 0.86),
  k(214, 2080, 472, 0.62),
  k(300, 2140, 472, 0.7, "lin"),
];

/* Where the pointer is, in source pixels, and when it presses. */
const POINTER_X: NumKey[] = [
  [0, 2900],
  [30, 2900],
  [62, PAPER_RADIO.x, "land"],
  [120, PAPER_RADIO.x],
  [158, CLAIM_BUTTON.x, "land"],
];
const POINTER_Y: NumKey[] = [
  [0, 1500],
  [30, 1500],
  [62, PAPER_RADIO.y, "land"],
  [120, PAPER_RADIO.y],
  [158, CLAIM_BUTTON.y, "land"],
];

const toCard = (p: { x: number; y: number }, cam: Cam) => ({
  x: CARD.w / 2 + (p.x - cam.x) * cam.s,
  y: CARD.h / 2 + (p.y - cam.y) * cam.s,
});

/** One capture under the camera, at an opacity. */
const Layer: React.FC<{ src: string; cam: Cam; opacity: number }> = ({ src, cam, opacity }) =>
  opacity <= 0 ? null : (
    <div style={{ position: "absolute", left: CARD.w / 2 - cam.x * cam.s, top: CARD.h / 2 - cam.y * cam.s, width: SRC.w * cam.s, height: SRC.h * cam.s, opacity }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%" }} />
    </div>
  );

/** A headline that rises in at `at` and lifts away at `out`. */
const Line: React.FC<{ f: number; at: number; out: number; kicker: string; text: string }> = ({ f, at, out, kicker, text }) => {
  if (f < at - 2 || f > out + 10) return null;
  const leave = prog(f, out, out + 9, "in");
  return (
    <div style={{ position: "absolute", left: CARD.x + 4, top: 30, display: "flex", flexDirection: "column", gap: 8, opacity: 1 - leave, transform: `translateY(${-leave * 14}px)` }}>
      <Kicker f={f} at={at}>
        {kicker}
      </Kicker>
      <Title f={f} at={at + 2} text={text} size={42} stagger={2} />
    </div>
  );
};

export const Claim: React.FC = () => {
  const f = useCurrentFrame();
  const cam = camAt(CAMERA, f);
  const enter = prog(f, 0, 26, "land");
  const toClaim = prog(f, 74, 82, "io");
  const toPaper = prog(f, 170, 178, "io");
  const pointer = toCard({ x: track(POINTER_X, f), y: track(POINTER_Y, f) }, cam);
  const press1 = f >= 64 && f < 84 ? (f - 64) / 20 : 0;
  const press2 = f >= 160 && f < 180 ? (f - 160) / 20 : 0;
  const pointerOpacity = prog(f, 28, 36, "out") * (1 - prog(f, 184, 196, "lin"));
  const card = { width: CARD.w, height: CARD.h, focus: { x: cam.x, y: cam.y }, scale: cam.s };
  return (
    <AbsoluteFill>
      <Backdrop glowY={420} />
      <Line f={f} at={4} out={76} kicker="Live → Paper" text="Flip the switch to *Paper.*" />
      <Line f={f} at={86} out={172} kicker="Claim it" text="*$100,000* in virtual funds." />
      <Line f={f} at={182} out={400} kicker="Paper mode" text="Now every order is *paper.*" />
      <div style={{ position: "absolute", left: CARD.x, top: CARD.y, perspective: 1800 }}>
        <div
          style={{
            width: CARD.w,
            height: CARD.h,
            transform: `scale(${mix(0.86, 1, enter)}) rotateX(${mix(14, 0, enter)}deg)`,
            transformOrigin: "center 30%",
            opacity: prog(f, 0, 10, "out"),
            position: "relative",
            borderRadius: 16,
            overflow: "hidden",
            background: C.panel,
            border: `1px solid ${C.border}`,
            boxShadow: "0 30px 70px rgba(0,0,0,0.5), 0 6px 18px rgba(0,0,0,0.35)",
          }}
        >
          <Layer src="captures/01-home-live.png" cam={cam} opacity={1 - toClaim} />
          <Layer src="captures/02-claim.png" cam={cam} opacity={toClaim * (1 - toPaper)} />
          <Layer src="captures/03-home-paper.png" cam={cam} opacity={toPaper} />
          <Mark region={CLAIM_COPY} card={card} t={prog(f, 122, 132, "land") * (1 - prog(f, 150, 158, "lin"))} />
          <Mark region={BAND_FIGURES} card={card} t={prog(f, 226, 236, "land")} />
          <Pointer x={pointer.x} y={pointer.y} press={press1 || press2} opacity={pointerOpacity} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

