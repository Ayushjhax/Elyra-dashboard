import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, staticFile } from "remotion";
import { loadFonts } from "./fonts";
import { Claim } from "./scenes/Claim";
import { End } from "./scenes/End";
import { Feature } from "./scenes/Feature";
import { Hook } from "./scenes/Hook";
import { Markets } from "./scenes/Markets";
import { Montage } from "./scenes/Montage";
import { Switch } from "./scenes/Switch";
import { BAR, C } from "./theme";

/* ---------------------------------------------------------------------------
   The cut, in film frames (60 fps, 144 BPM, one bar = 100 frames). Every
   scene starts on a downbeat, so every cut lands on the score; the cue map
   in audio/score.mjs uses the same numbers.

     0–200      Hook: Trade $100,000. Risk $0.
     200–500    The claim, on the real screens: Live → Paper → $100,000
     500–600    Real prices, real costs (the ticket)
     600–700    The fill report
     700–800    Market or limit, exits attached
     800–900    33 markets
     900–1000   Position controls
     1000–1100  Paper trade analysis
     1100–1200  Rules start on paper
     1200–1300  Two accounts, one switch
     1300–1400  The balance is the trades
     1400–1500  Reset
     1500–1700  Everything, ticked off
     1700–2000  End card

   Captures: the website at 1600 × 900 CSS pixels, 2x, signed in to a demo
   account whose paper history is stand-in data in the app's own shapes;
   prices, the order book and the chart are live (README.md, "What is real").
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
      <Sequence from={at(2)} durationInFrames={at(3)} name="The claim">
        <Claim />
      </Sequence>
      <Sequence from={at(5)} durationInFrames={at(1)} name="Real prices">
        <Feature
          dur={BAR}
          kicker="Hyperliquid's live book"
          title={"Real prices.\n*Real costs.*"}
          sub="Paper orders fill at Hyperliquid's live prices, less the fees and slippage a live order would pay."
          fine="0.045% taker fee and 0.05% slippage on every paper fill."
          src="captures/04-ticket.png"
          region={{ x: 1062, y: 420, w: 1076, h: 720 }}
          cardW={600}
          cardH={460}
          focusTo={{ x: 1600, y: 860 }}
          zoomTo={1.08}
          mark={{ x: 1114, y: 882, w: 972, h: 168 }}
          markAt={30}
        />
      </Sequence>
      <Sequence from={at(6)} durationInFrames={at(1)} name="Fill report">
        <Feature
          dur={BAR}
          side="left"
          kicker="Fill report"
          title={"Every fill,\n*shown in full.*"}
          sub="Each fill against the price it was sent at, and what the slippage cost."
          src="captures/06-filled.png"
          region={{ x: 1062, y: 900, w: 1076, h: 720 }}
          cardW={600}
          cardH={440}
          focusTo={{ x: 1600, y: 1010 }}
          zoomTo={1.08}
          mark={{ x: 1114, y: 946, w: 972, h: 148 }}
          markAt={30}
        />
      </Sequence>
      <Sequence from={at(7)} durationInFrames={at(1)} name="Exits attached">
        <Feature
          dur={BAR}
          kicker="Order ticket"
          title={"Market or limit.\n*Exits attached.*"}
          sub="Every order carries its take-profit and stop-loss. Limit prices come straight from the chart."
          src="captures/05-limit.png"
          region={{ x: 1062, y: 270, w: 1076, h: 700 }}
          cardW={600}
          cardH={440}
          focusTo={{ x: 1600, y: 560 }}
          zoomTo={1.06}
          mark={{ x: 1114, y: 506, w: 972, h: 100 }}
          markAt={30}
        />
      </Sequence>
      <Sequence from={at(8)} durationInFrames={at(1)} name="33 markets">
        <Markets dur={BAR} />
      </Sequence>
      <Sequence from={at(9)} durationInFrames={at(1)} name="Position controls">
        <Feature
          dur={BAR}
          side="left"
          kicker="Position controls"
          title={"Take profit\n*a piece at a time.*"}
          sub="Close 25, 50 or 75%, or move your stop. The same controls as live."
          src="captures/card-trades.png"
          size={{ w: 732, h: 3372 }}
          region={{ x: 0, y: 0, w: 732, h: 660 }}
          cardW={540}
          focusTo={{ x: 366, y: 330 }}
          zoomTo={1.05}
          mark={{ x: 196, y: 264, w: 446, h: 50 }}
          markAt={30}
        />
      </Sequence>
      <Sequence from={at(10)} durationInFrames={at(1)} name="Analysis">
        <Feature
          dur={BAR}
          kicker="Paper trade analysis"
          title={"Find out what\n*actually works.*"}
          sub="Win rate and result by leverage, side, hour and exit, from your closed paper trades."
          fine="Demo account. Under 20 trades, Elyra calls every split noise."
          src="captures/card-analysis.png"
          size={{ w: 732, h: 2632 }}
          region={{ x: 0, y: 0, w: 732, h: 860 }}
          cardW={480}
          cardH={560}
          focusTo={{ x: 366, y: 470 }}
          zoomTo={1.04}
          mark={{ x: 28, y: 748, w: 530, h: 44 }}
          markAt={32}
          titleSize={54}
        />
      </Sequence>
      <Sequence from={at(11)} durationInFrames={at(1)} name="Rules on paper">
        <Feature
          dur={BAR}
          side="left"
          kicker="Automation"
          title={"Automate it.\n*On paper first.*"}
          sub="New rules and AI funds start on paper. Going live is a switch you press yourself."
          src="captures/card-rules.png"
          size={{ w: 732, h: 746 }}
          region={{ x: 0, y: 0, w: 732, h: 746 }}
          cardW={540}
          focusTo={{ x: 366, y: 330 }}
          zoomTo={1.05}
          mark={{ x: 596, y: 114, w: 102, h: 48 }}
          markAt={30}
        />
      </Sequence>
      <Sequence from={at(12)} durationInFrames={at(1)} name="One switch">
        <Switch dur={BAR} />
      </Sequence>
      <Sequence from={at(13)} durationInFrames={at(1)} name="The balance">
        <Feature
          dur={BAR}
          kicker="Paper account"
          title={"Your balance\n*is your trades.*"}
          sub="Never stored: always $100,000 plus every paper trade since, after fees."
          src="captures/08-account.png"
          region={{ x: 1150, y: 560, w: 900, h: 680 }}
          cardW={600}
          focusTo={{ x: 1600, y: 860 }}
          zoomTo={1.06}
          mark={{ x: 1186, y: 740, w: 828, h: 200 }}
          markAt={30}
        />
      </Sequence>
      <Sequence from={at(14)} durationInFrames={at(1)} name="Reset">
        <Feature
          dur={BAR}
          side="left"
          kicker="Reset"
          title={"Blew it up?\n*Start again.*"}
          sub="Reset to $100,000 whenever nothing is open. Your past paper trades stay in your history."
          src="captures/09-reset.png"
          region={{ x: 1150, y: 478, w: 900, h: 848 }}
          cardW={600}
          focusTo={{ x: 1600, y: 960 }}
          zoomTo={1.06}
          mark={{ x: 1728, y: 1190, w: 252, h: 62 }}
          markAt={30}
        />
      </Sequence>
      <Sequence from={at(15)} durationInFrames={at(2)} name="Everything">
        <Montage dur={at(2)} />
      </Sequence>
      <Sequence from={at(17)} durationInFrames={at(3)} name="End card">
        <End />
      </Sequence>
      {withAudio && <Audio src={staticFile("audio/paper-trading-mix.wav")} />}
    </AbsoluteFill>
  );
};
