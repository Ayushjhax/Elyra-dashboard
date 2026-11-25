import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Still } from "../components/Still";
import { Kicker, Sub, Title } from "../components/Type";
import { camAt, k, prog } from "../lib/motion";
import { C, H, W } from "../theme";

/* ---------------------------------------------------------------------------
   Bars 3–4 (frames 200–400). A real screen recording of the live website:
   ⌘K opens the search palette, "scout" is typed, Enter opens Scout.

   The recording (public/captures/palette-scout.mp4, 1920 × 1080 at 60 fps)
   starts at its frame 40, so its Enter (recording frame 190) lands on the
   downbeat at film frame 350 — scene frame 150. The camera follows the
   palette, then whips to the Scout panel the moment it opens.
--------------------------------------------------------------------------- */

const CARD_W = 1180;
const CARD_H = Math.round((CARD_W * 1080) / 1920);
const FIT = CARD_W / 1920;

const CAM = [
  k(0, 960, 540, FIT),
  k(16, 960, 540, FIT),
  k(54, 960, 300, FIT * 1.85, "land"),
  k(148, 960, 300, FIT * 1.92, "io"),
  /* The Scout panel (recording x 108–564) sits left of centre, clear of the caption on the right. */
  k(170, 740, 610, FIT * 1.32, "whip"),
  k(200, 740, 640, FIT * 1.36, "io"),
];

export const Palette: React.FC = () => {
  const f = useCurrentFrame();
  const cam = camAt(CAM, f);
  const arrive = prog(f, 0, 22, "land");
  const searchIn = prog(f, 20, 34, "land") * (1 - prog(f, 140, 150, "in"));
  const scoutIn = prog(f, 158, 172, "land");
  const push = prog(f, 193, 200, "in");
  /* Motion blur on the whip, which also hides the frames between Enter and Scout opening. */
  const whipBlur = 9 * Math.sin(Math.PI * prog(f, 148, 174, "lin"));
  return (
    <AbsoluteFill style={{ transform: `translateX(${-push * 40}px)` }}>
      <Backdrop glowY={300} />
      <div
        style={{
          position: "absolute",
          left: (W - CARD_W) / 2,
          top: (H - CARD_H) / 2,
          transform: `scale(${1.22 - 0.22 * arrive})`,
          opacity: prog(f, 0, 6, "out"),
          filter: whipBlur > 0.05 ? `blur(${whipBlur.toFixed(2)}px)` : undefined,
        }}
      >
        <Still src="captures/palette-scout.mp4" video={{ startFrom: 40, size: { w: 1920, h: 1080 } }} width={CARD_W} height={CARD_H} focus={{ x: cam.x, y: cam.y }} scale={cam.s} radius={18}>
          {/* a scrim under the captions, so they read over any part of the screen */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                f < 150
                  ? `linear-gradient(180deg, rgba(16,23,16,0) 52%, rgba(16,23,16,${0.92 * searchIn}) 88%)`
                  : `linear-gradient(270deg, rgba(16,23,16,${0.94 * scoutIn}) 30%, rgba(16,23,16,0) 66%)`,
            }}
          />
        </Still>
      </div>
      {f < 152 && (
        <div style={{ position: "absolute", left: 92, bottom: 72, display: "flex", flexDirection: "column", gap: 10, opacity: searchIn }}>
          <Kicker f={f} at={20}>
            Command K
          </Kicker>
          <Title f={f} at={22} text="Search *anything.*" size={56} />
        </div>
      )}
      {f >= 152 && (
        <div style={{ position: "absolute", right: 92, top: 0, height: H, width: 430, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
          <Kicker f={f} at={156}>
            New · Scout
          </Kicker>
          <Title f={f} at={158} text={"Every claim,\n*graded.*"} size={58} />
          <Sub f={f} at={166} maxWidth={430}>
            Paste a YouTube video, a post on X or an article. Scout grades each claim by its evidence.
          </Sub>
        </div>
      )}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", boxShadow: `inset 0 0 0 1px ${C.base}` }} />
    </AbsoluteFill>
  );
};
