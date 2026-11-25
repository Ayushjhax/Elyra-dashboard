import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Mark, Still, centre, fitScale, type Region } from "../components/Still";
import { Fine, Kicker, Sub, Title } from "../components/Type";
import { mix, prog } from "../lib/motion";
import { H, SAFE, W } from "../theme";

/* ---------------------------------------------------------------------------
   One feature, one bar: the claim on one side, the real screen on the other.

   The card flies in on a 3D turn that lands almost flat, then the camera
   creeps toward the part of the screen the headline is about, where a
   citron mark appears. The last frames push the whole frame away, so the
   hard cut on the next downbeat reads as a throw, not a stop.
--------------------------------------------------------------------------- */

export type FeatureProps = {
  kicker: string;
  title: string;
  sub: string;
  fine?: string;
  src: string;
  region: Region;
  cardW: number;
  cardH?: number;
  /** Where the camera ends: a source point and a zoom on the fit. */
  focusTo?: { x: number; y: number };
  zoomTo?: number;
  mark?: Region;
  markAt?: number;
  side?: "left" | "right";
  titleSize?: number;
};

export const Feature: React.FC<FeatureProps & { dur: number }> = ({ dur, kicker, title, sub, fine, src, region, cardW, cardH, focusTo, zoomTo = 1.12, mark, markAt = 34, side = "right", titleSize = 58 }) => {
  const f = useCurrentFrame();
  const fit = fitScale(region, cardW);
  const height = cardH ?? Math.min(560, Math.round(region.h * fit));
  const enter = prog(f, 0, 24, "land");
  const hold = prog(f, 6, dur, "io");
  const push = prog(f, dur - 7, dur, "in");
  const from = centre(region);
  const to = focusTo ?? from;
  const focus = { x: mix(from.x, to.x, hold), y: mix(from.y, to.y, hold) };
  const scale = fit * Math.exp(mix(0, Math.log(zoomTo), hold));
  const dir = side === "right" ? 1 : -1;
  const cardX = side === "right" ? W - SAFE.x - cardW + 8 : SAFE.x - 8;
  const textX = side === "right" ? SAFE.x + 8 : SAFE.x + cardW + 56;
  const textW = W - cardW - SAFE.x * 2 - 56;
  return (
    <AbsoluteFill style={{ transform: `translateX(${-push * 46 * dir}px) scale(${1 + push * 0.025})`, opacity: 1 - push * 0.25 }}>
      <Backdrop glowX={side === "right" ? 860 : 420} glowY={360} />
      <div style={{ position: "absolute", left: textX, top: 0, height: H, width: textW, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
        <Kicker f={f}>{kicker}</Kicker>
        <Title f={f} at={2} text={title} size={titleSize} />
        <Sub f={f} at={12} maxWidth={textW}>
          {sub}
        </Sub>
        {fine && <Fine f={f} at={26}>{fine}</Fine>}
      </div>
      <div style={{ position: "absolute", left: cardX, top: (H - height) / 2, perspective: 1600 }}>
        <div
          style={{
            transform: `translateX(${(1 - enter) * 130 * dir}px) rotateY(${mix(-26 * dir, -7 * dir, enter) + 4 * dir * hold}deg) rotateX(${mix(6, 1.5, enter)}deg)`,
            transformOrigin: side === "right" ? "left center" : "right center",
            opacity: prog(f, 0, 9, "out"),
          }}
        >
          <Still src={src} width={cardW} height={height} focus={focus} scale={scale}>
            {mark && <Mark region={mark} card={{ width: cardW, height, focus, scale }} t={prog(f, markAt, markAt + 10, "land")} />}
          </Still>
        </div>
      </div>
    </AbsoluteFill>
  );
};
