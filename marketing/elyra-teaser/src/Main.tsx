import React, { useEffect, useState } from "react";
import { AbsoluteFill, getStaticFiles, staticFile, useCurrentFrame, useDelayRender } from "remotion";
import { Audio } from "@remotion/media";
import { Backdrop, Grain, type Light } from "./components/Backdrop";
import { Device } from "./components/Device";
import { DirBlur } from "./components/DirBlur";
import { EASE, prog, track } from "./lib/anim";
import { feedScroll, phoneAt, visionSlide } from "./camera";
import { loadFonts } from "./fonts";
import { CaptureScreen } from "./screens/ui";
import { AskScreen } from "./screens/AskScreen";
import { PortfolioScreen } from "./screens/PortfolioScreen";
import { FeedScreen } from "./screens/FeedScreen";
import { SwapScreen } from "./screens/SwapScreen";
import { StrategyScreen } from "./screens/StrategyScreen";
import { S1Markets } from "./scenes/S1Markets";
import { TypeMatch } from "./scenes/TypeMatch";
import { Labels, Lockup, MontageLabels, PLANE_LOCK, RailMatch, SceneHeadlines, VenuePlanes } from "./scenes/Overlays";

/* ---------------------------------------------------------------------------
   The film. Layers, back to front: the room (backdrop), scene 1's market
   field, the one persistent handset, the type and labels, grain. The
   soundtrack is the mastered mix in public/audio (see audio/synth.py).
--------------------------------------------------------------------------- */

const MIX = "audio/elyra-teaser-mix.wav";

function lightAt(frame: number): Light {
  const keys = (pick: (l: number[]) => number) =>
    track(
      frame,
      [
        [0, [1250, 470, 1150, 0.9]],
        [100, [1420, 470, 900, 1.0]],
        [200, [1450, 560, 1000, 1.0]],
        [400, [1350, 420, 1000, 1.0]],
        [600, [1400, 540, 1000, 0.9]],
        [800, [1400, 600, 950, 1.0]],
        [1000, [1420, 470, 900, 1.15]],
        [1199, [1405, 480, 930, 1.22]],
      ].map(([f, v]) => [f as number, pick(v as number[]), EASE.inOut] as const),
    );
  return { x: keys((v) => v[0]), y: keys((v) => v[1]), r: keys((v) => v[2]), strength: keys((v) => v[3]) };
}

function deviceOpacity(frame: number): number {
  if (frame < 100) return 0;
  if (frame >= 388 && frame < 400) return 1 - prog(frame, 389, 397, EASE.in);
  if (frame >= 400 && frame < 410) return prog(frame, 400, 407, EASE.out);
  return 1;
}

const Screen: React.FC<{ frame: number }> = ({ frame }) => {
  const layers: React.ReactNode[] = [];
  // Real capture: the reveal (scene 2) and the hero (scene 7).
  if (frame < 200) layers.push(<CaptureScreen key="cap-a" file="01-ask-elyra.png" opacity={1 - prog(frame, 192, 198, EASE.linear)} />);
  if (frame >= 192 && frame < 400)
    layers.push(
      <div key="ask" style={{ position: "absolute", inset: 0, opacity: prog(frame, 192, 198, EASE.linear) * (1 - prog(frame, 389, 396, EASE.linear)) }}>
        <AskScreen frame={frame} />
      </div>,
    );
  if (frame >= 400 && frame < 598) {
    const locked = PLANE_LOCK.filter((l) => frame >= l).length;
    layers.push(
      <div key="pf" style={{ position: "absolute", inset: 0, opacity: 1 - prog(frame, 592, 597, EASE.linear) }}>
        <PortfolioScreen
          venues={Math.max(locked, frame >= 400 ? 0 : 0)}
          alloc={prog(frame, 410, 456, EASE.out)}
          risk={prog(frame, 502, 522, EASE.out)}
          capMark={frame >= 412}
        />
      </div>,
    );
  }
  if (frame >= 592 && frame < 800) {
    const sc = feedScroll(frame);
    const v = sc - feedScroll(frame - 1);
    layers.push(
      <div key="feed" style={{ position: "absolute", inset: 0, background: "#101710", opacity: prog(frame, 592, 597, EASE.linear) * (1 - prog(frame, 794, 799, EASE.linear)) }}>
        <DirBlur dx={0} dy={v}>
          <FeedScreen frame={frame} scroll={sc} />
        </DirBlur>
      </div>,
    );
  }
  if (frame >= 794 && frame < 902) {
    const slide = visionSlide(frame);
    const v = (slide - visionSlide(frame - 1)) * 412;
    layers.push(
      <div key="swap" style={{ position: "absolute", inset: 0, opacity: prog(frame, 794, 799, EASE.linear) }}>
        <DirBlur dx={v} dy={0}>
          <div style={{ position: "absolute", inset: 0, background: "#101710", transform: `translateX(${-slide * 412}px)` }}>
            <SwapScreen frame={frame} />
          </div>
        </DirBlur>
      </div>,
    );
  }
  if (frame >= 892 && frame < 1000) {
    const slide = visionSlide(frame);
    const v = (slide - visionSlide(frame - 1)) * 412;
    layers.push(
      <div key="strategy" style={{ position: "absolute", inset: 0, opacity: 1 - prog(frame, 991, 998, EASE.linear) }}>
        <DirBlur dx={v} dy={0}>
          <div style={{ position: "absolute", inset: 0, background: "#101710", transform: `translateX(${(1 - slide) * 412}px)` }}>
            <StrategyScreen frame={frame} emblemOpacity={frame >= 988 ? 0 : 1} titleOpacity={frame >= 988 ? 0 : 1} />
          </div>
        </DirBlur>
      </div>,
    );
  }
  if (frame >= 990) layers.push(<CaptureScreen key="cap-b" file="01-ask-elyra.png" opacity={prog(frame, 990, 998, EASE.linear)} />);
  return <>{layers}</>;
};

export const Main: React.FC = () => {
  const frame = useCurrentFrame();
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Loading local fonts"));
  useEffect(() => {
    loadFonts().then(() => continueRender(handle));
  }, [continueRender, handle]);

  const p = phoneAt(frame);
  const ref = frame === 400 ? 401 : frame;
  const a = phoneAt(ref);
  const b = phoneAt(ref - 1);
  const ds = a.s - b.s;
  const motion = { dx: Math.abs(a.x - b.x) + Math.abs(ds) * 180, dy: Math.abs(a.y - b.y) + Math.abs(ds) * 280 };
  const hasMix = getStaticFiles().some((f) => f.name === MIX);
  const lockupLight: Light | undefined = frame >= 988 ? { x: 290, y: 360, r: 760, strength: 0.7 * prog(frame, 988, 1004, EASE.out) } : undefined;

  return (
    <AbsoluteFill style={{ backgroundColor: "#101710" }}>
      <Backdrop frame={frame} light={lightAt(frame)} second={lockupLight} />
      <S1Markets frame={frame} />
      {frame >= 100 && (
        <Device p={{ ...p, opacity: deviceOpacity(frame) }} motion={motion}>
          <Screen frame={frame} />
        </Device>
      )}
      <VenuePlanes frame={frame} />
      <RailMatch frame={frame} />
      <TypeMatch frame={frame} />
      <SceneHeadlines frame={frame} />
      <MontageLabels frame={frame} />
      <Labels frame={frame} />
      <Lockup frame={frame} />
      <Grain frame={frame} />
      {hasMix && <Audio src={staticFile(MIX)} />}
    </AbsoluteFill>
  );
};
