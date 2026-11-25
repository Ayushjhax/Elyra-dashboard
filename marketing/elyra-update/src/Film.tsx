import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile } from "remotion";
import { loadFonts } from "./fonts";
import { Arena } from "./scenes/Arena";
import { Chinese } from "./scenes/Chinese";
import { Desk } from "./scenes/Desk";
import { End } from "./scenes/End";
import { Feature } from "./scenes/Feature";
import { Hook } from "./scenes/Hook";
import { Montage } from "./scenes/Montage";
import { Palette } from "./scenes/Palette";
import { Rails } from "./scenes/Rails";
import { Insider, Sentiment } from "./scenes/Research";
import { BAR, C } from "./theme";

/* ---------------------------------------------------------------------------
   The cut, in film frames (60 fps, 144 BPM, one bar = 100 frames). Every
   scene starts on a downbeat, so every cut lands on the score; the cue map
   in audio/score.mjs uses the same numbers.

     0–200      Hook: 20 features. 8 days.
     200–400    ⌘K → Scout (real screen recording)
     400–500    Scout · smart money
     500–700    The Desk
     700–900    Arena leagues
     900–1000   Insider watch
     1000–1100  Sentiment
     1100–1200  Tokenized stocks
     1200–1300  Strategy lab
     1300–1400  Copy trading
     1400–1500  Agents ask. You sign.
     1500–1600  English and 中文
     1600–1900  The twenty, then the claim, then silence
     1900–2200  End card
--------------------------------------------------------------------------- */

const at = (bar: number) => bar * BAR;

export const Film: React.FC<{ withAudio: boolean }> = ({ withAudio }) => {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    loadFonts().then(() => continueRender(handle));
  }, [handle]);
  return (
  <AbsoluteFill style={{ background: C.base }}>
    <Sequence from={at(0)} durationInFrames={at(2)} name="Hook">
      <Hook />
    </Sequence>
    <Sequence from={at(2)} durationInFrames={at(2)} name="Palette → Scout">
      <Palette />
    </Sequence>
    <Sequence from={at(4)} durationInFrames={at(1)} name="Scout · smart money">
      <Feature
        dur={BAR}
        kicker="Scout · Smart money"
        title={"Then see what\n*smart money* did."}
        sub="Signals from the leaderboard's wallets, counted by wallet. One whale is one opinion."
        src="captures/scout-smart.png"
        region={{ x: 200, y: 700, w: 1056, h: 1060 }}
        cardW={600}
        focusTo={{ x: 640, y: 1000 }}
        zoomTo={1.25}
        mark={{ x: 220, y: 878, w: 1020, h: 44 }}
        markAt={32}
      />
    </Sequence>
    <Sequence from={at(5)} durationInFrames={at(2)} name="The Desk">
      <Desk />
    </Sequence>
    <Sequence from={at(7)} durationInFrames={at(2)} name="Arena leagues">
      <Arena />
    </Sequence>
    <Sequence from={at(9)} durationInFrames={at(1)} name="Insider watch">
      <Insider />
    </Sequence>
    <Sequence from={at(10)} durationInFrames={at(1)} name="Sentiment">
      <Sentiment />
    </Sequence>
    <Sequence from={at(11)} durationInFrames={at(1)} name="Tokenized stocks">
      <Feature
        dur={BAR}
        kicker="New · Tokenized stocks"
        title={"Every tokenized stock.\n*One list.*"}
        sub="Backpack Securities, xStocks, Ondo and Robinhood, grouped by the share behind them."
        fine="Tokens are not the shares. Not offered to US persons."
        src="captures/stocks.png"
        region={{ x: 200, y: 480, w: 1056, h: 1120 }}
        cardW={560}
        focusTo={{ x: 590, y: 720 }}
        zoomTo={1.4}
        mark={{ x: 232, y: 592, w: 372, h: 36 }}
        markAt={30}
        titleSize={52}
      />
    </Sequence>
    <Sequence from={at(12)} durationInFrames={at(1)} name="Strategy lab">
      <Feature
        dur={BAR}
        side="left"
        kicker="New · Strategy lab"
        title={"Design it.\n*Backtest it.*"}
        sub="Start from a library of strategies, each written out with how it tends to fail."
        fine="Nothing here trades."
        src="captures/strategies-library.png"
        region={{ x: 200, y: 690, w: 1056, h: 1030 }}
        cardW={560}
        focusTo={{ x: 630, y: 1090 }}
        zoomTo={1.3}
        mark={{ x: 258, y: 1210, w: 282, h: 52 }}
        markAt={30}
      />
    </Sequence>
    <Sequence from={at(13)} durationInFrames={at(1)} name="Copy trading">
      <Feature
        dur={BAR}
        kicker="New · Copy trading"
        title={"Follow a strategy.\n*Your account.*"}
        sub="Copy a shared rule set's trades in your own account, at your size, with its stops."
        fine="Elyra's own sets trade on paper."
        src="captures/copy.png"
        region={{ x: 200, y: 760, w: 1056, h: 1010 }}
        cardW={560}
        focusTo={{ x: 630, y: 1000 }}
        zoomTo={1.3}
        mark={{ x: 232, y: 890, w: 530, h: 46 }}
        markAt={30}
        titleSize={54}
      />
    </Sequence>
    <Sequence from={at(14)} durationInFrames={at(1)} name="Agent rails">
      <Rails />
    </Sequence>
    <Sequence from={at(15)} durationInFrames={at(1)} name="English and 中文">
      <Chinese />
    </Sequence>
    <Sequence from={at(16)} durationInFrames={at(3)} name="The twenty">
      <Montage />
    </Sequence>
    <Sequence from={at(19)} durationInFrames={at(3)} name="End card">
      <End />
    </Sequence>
    {withAudio && <Audio src={staticFile("audio/elyra-update-mix.wav")} />}
  </AbsoluteFill>
  );
};
