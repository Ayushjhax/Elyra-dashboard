import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, FILM } from "../theme";

/* ---------------------------------------------------------------------------
   The film's room: the app's forest base, one olive falloff in the spirit of
   the app's own Glow (olive → moss → nothing), fine grain and a vignette.
   Grain tiles are pre-rendered (public/texture) and stepped every 2 frames,
   so the texture is deterministic and cheap.
--------------------------------------------------------------------------- */

export type Light = { x: number; y: number; r: number; strength: number };

export const Backdrop: React.FC<{ frame: number; light: Light; second?: Light }> = ({ frame, light, second }) => {
  const g = (l: Light) =>
    `radial-gradient(circle ${l.r}px at ${l.x}px ${l.y}px, rgba(168,180,78,${(0.13 * l.strength).toFixed(3)}) 0%, rgba(69,112,61,${(0.075 * l.strength).toFixed(3)}) 40%, rgba(69,112,61,0) 100%)`;
  return (
    <AbsoluteFill style={{ background: C.base }}>
      <AbsoluteFill style={{ background: second ? `${g(light)}, ${g(second)}` : g(light) }} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 120% 95% at 50% 46%, rgba(0,0,0,0) 52%, ${FILM.vignette} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Grain sits above everything except the frame edge; overlay keeps the mean colour. */
export const Grain: React.FC<{ frame: number; opacity?: number }> = ({ frame, opacity = 0.32 }) => {
  const i = Math.floor(frame / 2) % 6;
  const ox = ((frame * 37) % 384) | 0;
  const oy = ((frame * 91) % 384) | 0;
  return (
    <AbsoluteFill style={{ mixBlendMode: "overlay", opacity, pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: -ox,
          top: -oy,
          width: 1920 + 768,
          height: 1080 + 768,
          backgroundImage: `url(${staticFile(`texture/grain-${i}.png`)})`,
          backgroundRepeat: "repeat",
          backgroundSize: "384px 384px",
        }}
      />
      {/* Preload every tile so a step never waits on a decode. */}
      <div style={{ display: "none" }}>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <Img key={n} src={staticFile(`texture/grain-${n}.png`)} />
        ))}
      </div>
    </AbsoluteFill>
  );
};
