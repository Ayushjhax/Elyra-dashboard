import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { loadFonts } from "./fonts";
import { C } from "./theme";
import { Opening } from "./scenes/Opening";
import { Ask } from "./scenes/Ask";
import { CapitalV2 } from "./scenes/CapitalV2";
import { SignalsV2 } from "./scenes/SignalsV2";
import { ResearchV2 } from "./scenes/ResearchV2";
import { Wallet, Alerts } from "./scenes/WalletAlerts";
import { Launch } from "./scenes/Launch";
import { ChapterHUD, LimeWipe } from "./components/Chapter";

/* ---------------------------------------------------------------------------
   The 45-second film: 1920 × 1080, 60 fps, 2,700 frames.
   Scenes are written in absolute frames and mounted only while on screen.
   Where two overlap, the later one in this list draws on top.

     0–400      Opening   hook → mobile reveal (frame 200)
     400–764    01 Ask Elyra — question → answer on 600 → its sources
     750–1064   02 Capital — context sources; read-only connections
     1050–1364  03 Signals — "A quiet market is a signal, too."; smart money
     1350–1914  04 Research — Reports + PDF, Backtests, six-tool carousel, wall
     1900–2174  05 Wallet — action row; "You stay in control"
     2160–2346  06 Alerts — the price rule; tells you, never trades
     2340–2700  Launch (announcement at frame 2400)
   Chapters 02–06 enter behind a lime bar sweeping right to left.
--------------------------------------------------------------------------- */

export type FilmProps = { withAudio: boolean };

export const AUDIO_FILE = "audio/elyra-launch-mix.wav";

export const Film: React.FC<FilmProps> = ({ withAudio }) => {
  const f = useCurrentFrame();
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    loadFonts().then(() => continueRender(handle));
  }, [handle]);
  return (
    <AbsoluteFill style={{ background: C.base }}>
      {f < 400 && <Opening />}
      {f >= 400 && f < 764 && <Ask />}
      {f >= 750 && f < 1064 && (
        <LimeWipe from={750}>
          <CapitalV2 />
        </LimeWipe>
      )}
      {f >= 1050 && f < 1364 && (
        <LimeWipe from={1050}>
          <SignalsV2 />
        </LimeWipe>
      )}
      {f >= 1350 && f < 1914 && (
        <LimeWipe from={1350}>
          <ResearchV2 />
        </LimeWipe>
      )}
      {f >= 1900 && f < 2174 && (
        <LimeWipe from={1900}>
          <Wallet />
        </LimeWipe>
      )}
      {f >= 2340 && <Launch />}
      {f >= 2160 && f < 2348 && (
        <LimeWipe from={2160}>
          <Alerts />
        </LimeWipe>
      )}
      <ChapterHUD />
      {withAudio && <Audio src={staticFile(AUDIO_FILE)} />}
    </AbsoluteFill>
  );
};
