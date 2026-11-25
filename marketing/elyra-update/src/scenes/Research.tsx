import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Mark, Still, type Region } from "../components/Still";
import { Fine, Kicker, Sub, Title } from "../components/Type";
import { mix, prog } from "../lib/motion";
import { H, SAFE } from "../theme";

/* ---------------------------------------------------------------------------
   Research, from the live website's Research workspace (signed out).

   Insider watch (bar 10, frames 900–1000) shows a real flagged wallet from
   25 November 2026. Both wallet addresses in the capture are blurred
   (public/captures/research-insiders.png): a flag is a pattern, never an
   accusation, so the film names nobody and says so on screen.

   Sentiment (bar 11, frames 1000–1100) stacks the page's three readings:
   the Fear & Greed Index, positioning and breadth.
--------------------------------------------------------------------------- */

const usePush = (f: number, dur: number) => prog(f, dur - 7, dur, "in");

/* Insider card: the flagged wallet, from its label to its last bullet. */
const INSIDER: Region = { x: 168, y: 1022, w: 1540, h: 640 };
const INSIDER_HEAD: Region = { x: 198, y: 1104, w: 376, h: 50 };

export const Insider: React.FC = () => {
  const f = useCurrentFrame();
  const push = usePush(f, 100);
  const cardW = 960;
  const fit = cardW / INSIDER.w;
  const height = Math.round(INSIDER.h * fit);
  const enter = prog(f, 0, 22, "land");
  const hold = prog(f, 6, 100, "io");
  const focus = { x: mix(INSIDER.x + INSIDER.w / 2, 760, hold), y: mix(INSIDER.y + INSIDER.h / 2, 1270, hold) };
  const scale = fit * mix(1, 1.14, hold);
  return (
    <AbsoluteFill style={{ transform: `translateX(${-push * 46}px)`, opacity: 1 - push * 0.25 }}>
      <Backdrop glowX={640} glowY={470} />
      <div style={{ position: "absolute", left: SAFE.x + 16, top: 52, display: "flex", flexDirection: "column", gap: 10, width: 1100 }}>
        <Kicker f={f}>New · Insider watch</Kicker>
        <Title f={f} at={2} text="Fresh wallet. *$6.89M* first bet. Flagged." size={50} />
        <Sub f={f} at={12} maxWidth={900} size={20}>
          New Hyperliquid wallets whose first trade is big, from public records, every five minutes.
        </Sub>
      </div>
      <div style={{ position: "absolute", left: (1280 - cardW) / 2, top: 236, perspective: 1800 }}>
        <div style={{ transform: `translateY(${(1 - enter) * 90}px) rotateX(${mix(18, 2, enter)}deg)`, transformOrigin: "center top", opacity: prog(f, 0, 9, "out") }}>
          <Still src="captures/research-insiders.png" width={cardW} height={height} focus={focus} scale={scale}>
            <Mark region={INSIDER_HEAD} card={{ width: cardW, height, focus, scale }} t={prog(f, 30, 40, "land")} />
          </Still>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 236 + height + 14, display: "flex", justifyContent: "center" }}>
        <Fine f={f} at={34} align="center">
          A pattern, not proof. Nobody is accused of anything, and none of it is advice.
        </Fine>
      </div>
    </AbsoluteFill>
  );
};

const READINGS: Region[] = [
  { x: 168, y: 662, w: 982, h: 196 },
  { x: 1172, y: 662, w: 984, h: 196 },
  { x: 2176, y: 662, w: 984, h: 196 },
];
const FEAR: Region = { x: 192, y: 738, w: 362, h: 48 };

export const Sentiment: React.FC = () => {
  const f = useCurrentFrame();
  const push = usePush(f, 100);
  const cardW = 590;
  return (
    <AbsoluteFill style={{ transform: `translateX(${-push * 46}px)`, opacity: 1 - push * 0.25 }}>
      <Backdrop glowX={880} glowY={360} />
      <div style={{ position: "absolute", left: SAFE.x + 8, top: 0, height: H, width: 470, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
        <Kicker f={f}>New · Sentiment</Kicker>
        <Title f={f} at={2} text="Read the *room.*" size={60} />
        <Sub f={f} at={12} maxWidth={440}>
          Fear and greed, how Hyperliquid's perps are positioned, and the day's breadth. Side by side.
        </Sub>
        <Fine f={f} at={28}>
          Readings, not forecasts.
        </Fine>
      </div>
      {READINGS.map((region, i) => {
        const fit = cardW / region.w;
        const height = Math.round(region.h * fit);
        const enter = prog(f, i * 6, i * 6 + 22, "land");
        const focus = { x: region.x + region.w / 2, y: region.y + region.h / 2 };
        const scale = fit * mix(1, 1.04, prog(f, 10, 100, "io"));
        return (
          <div key={i} style={{ position: "absolute", left: 1280 - SAFE.x - cardW + 8, top: 360 - (height * 3 + 36) / 2 + i * (height + 18), perspective: 1600 }}>
            <div style={{ transform: `translateX(${(1 - enter) * 140}px) rotateY(${mix(-24, -6, enter)}deg)`, transformOrigin: "left center", opacity: prog(f, i * 6, i * 6 + 9, "out") }}>
              <Still src="captures/research-sentiment.png" width={cardW} height={height} focus={focus} scale={scale} radius={14}>
                {i === 0 && <Mark region={FEAR} card={{ width: cardW, height, focus, scale }} t={prog(f, 34, 44, "land")} pad={6} />}
              </Still>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
