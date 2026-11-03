import React, { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { loadFonts } from "./fonts";
import { C } from "./theme";
import { Opening } from "./scenes/Opening";
import { Evidence } from "./scenes/Evidence";
import { Capital } from "./scenes/Capital";
import { Signals } from "./scenes/Signals";
import { Research } from "./scenes/Research";
import { Move } from "./scenes/Move";
import { Condition } from "./scenes/Condition";
import { Launch } from "./scenes/Launch";

/* ---------------------------------------------------------------------------
   The 45-second film: 1920 × 1080, 60 fps, 2,700 frames.
   Scenes are written in absolute frames and mounted only while on screen.
   Where two overlap, the later one in this list draws on top.

     0–400      Opening   hook → mobile reveal (frame 200)
     400–720    Evidence  question → answer (frame 600) → the lime rail
     700–1000   Capital
     1000–1200  Signals / smart money
     1200–1800  Research
     1800–2100  Prepare your move
     2100–2352  Set the condition
     2340–2700  Launch (announcement at frame 2400)
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
      {f >= 700 && f < 1000 && <Capital />}
      {f >= 400 && f < 720 && <Evidence />}
      {f >= 1000 && f < 1200 && <Signals />}
      {f >= 1200 && f < 1800 && <Research />}
      {f >= 1800 && f < 2100 && <Move />}
      {f >= 2340 && <Launch />}
      {f >= 2100 && f < 2352 && <Condition />}
      {withAudio && <Audio src={staticFile(AUDIO_FILE)} />}
    </AbsoluteFill>
  );
};
