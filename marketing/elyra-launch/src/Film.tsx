import React, { useEffect, useState } from "react";
import { AbsoluteFill, Sequence, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
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
   The film: 1920 × 1080, 60 fps, 2,600 frames (43.333 s).

   Revision 4 removed one bar (100 frames) from the opening: the three insert
   cuts and the price-tag hold are gone, and the handset now lands on 100.
   The opening is written in film frames. Every scene after it is still
   written in the frames of the 2,700-frame cut and mounted inside a
   <Sequence from={-TRIM}>, which plays that whole timeline TRIM frames
   earlier, unchanged. Inside it, a scene's frame g is film frame g − 100.

     film      scene (g)
     0–300     —           Opening   hook → the handset lands on 100
     300–664   400–764     01 Ask Elyra — question → answer on 500 (g 600)
     650–964   750–1064    02 Capital — context sources; read-only connections
     950–1264  1050–1364   03 Signals — "A quiet market is a signal, too."; smart money
     1250–1814 1350–1914   04 Research — Reports + PDF, Backtests, six-tool carousel, wall
     1800–2074 1900–2174   05 Wallet — action row; "You stay in control"
     2060–2246 2160–2346   06 Alerts — the price rule; tells you, never trades
     2240–2600 2340–2700   Launch (announcement at film frame 2300, g 2400)

   Scenes are mounted only while on screen. Where two overlap, the later one
   in this list draws on top. Chapters 02–06 enter behind a lime bar
   sweeping right to left.
--------------------------------------------------------------------------- */

export type FilmProps = { withAudio: boolean };

export const AUDIO_FILE = "audio/elyra-launch-mix.wav";

/** Frames removed from the opening in revision 4 (one bar at 144 BPM). */
export const TRIM = 100;

export const Film: React.FC<FilmProps> = ({ withAudio }) => {
  const f = useCurrentFrame();
  const g = f + TRIM; // the frame the scenes below are written in
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    loadFonts().then(() => continueRender(handle));
  }, [handle]);
  return (
    <AbsoluteFill style={{ background: C.base }}>
      {f < 300 && <Opening />}
      <Sequence from={-TRIM} layout="none" name="After the opening (scene frames)">
        {g >= 400 && g < 764 && <Ask />}
        {g >= 750 && g < 1064 && (
          <LimeWipe from={750}>
            <CapitalV2 />
          </LimeWipe>
        )}
        {g >= 1050 && g < 1364 && (
          <LimeWipe from={1050}>
            <SignalsV2 />
          </LimeWipe>
        )}
        {g >= 1350 && g < 1914 && (
          <LimeWipe from={1350}>
            <ResearchV2 />
          </LimeWipe>
        )}
        {g >= 1900 && g < 2174 && (
          <LimeWipe from={1900}>
            <Wallet />
          </LimeWipe>
        )}
        {g >= 2340 && <Launch />}
        {g >= 2160 && g < 2348 && (
          <LimeWipe from={2160}>
            <Alerts />
          </LimeWipe>
        )}
        <ChapterHUD />
      </Sequence>
      {withAudio && <Audio src={staticFile(AUDIO_FILE)} />}
    </AbsoluteFill>
  );
};
