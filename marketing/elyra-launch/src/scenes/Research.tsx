import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Shot, type Box } from "../components/Shot";
import { Label } from "../components/Type";
import { k, prog, mix } from "../lib/motion";
import { useAbsFrame } from "../lib/frame";

/* ---------------------------------------------------------------------------
   1200–1800 · Research at full depth.

   Every result here was produced on the Seeker for this film:
   - Reports: "NVDA latest earnings" → the NVIDIA Q2 FY2027 earnings report
     (status "Verified with warnings", shown as such) and its PDF.
   - Backtests: SOL · RSI (12), one year of hourly bars, and the three-way
     comparison. Returns are negative and shown unchanged; the app's own
     line closes the beat: "No winner is named: one period on one asset is
     not a forecast."
   - Prediction markets, then the tab rhythm — Market recap, Signals, Yield,
     Unlocks (whose provider is unavailable, and says so) — then SEC filings
     and insider activity.
   Durations are deliberately unequal: richest evidence longest.
--------------------------------------------------------------------------- */

const pageBox = (f: number, i: number): Box => {
  const t = prog(f, 1315 + i * 5, 1333 + i * 5, "land");
  const w = 690;
  const h = 880;
  const x = i === 0 ? 230 : 1000;
  return { x, y: mix(1080, 160, t), w, h, r: 14, border: i === 0, shadow: true };
};

export const Research: React.FC = () => {
  const f = useAbsFrame();
  return (
    <AbsoluteFill>
      <Backdrop glowY={480} />

      {/* Reports: a real query becomes a real report */}
      <Shot from={1200} to={1240} src={{ v: "10-report-start.mp4", t: 70 }} cam={[k(1200, 600, 1080, 1.32), k(1240, 600, 1110, 1.38, "lin")]} name="Create a report" />
      <Shot from={1240} to={1275} src={{ img: "stills/report-card.png" }} cam={[k(1240, 600, 1945, 1.5), k(1275, 600, 1955, 1.56, "lin")]} name="Your reports" />
      <Shot from={1275} to={1315} src={{ img: "stills/report-top.png" }} cam={[k(1275, 600, 590, 1.6), k(1290, 600, 610, 1.6, "lin"), k(1315, 600, 1740, 1.6, "io")]} name="NVIDIA report" />
      <Label from={1204} to={1273} x={96} y={64} eyebrow="Research" text="Reports" size={36} />

      {/* the report as a PDF — cover and scorecard page */}
      {f >= 1315 && f < 1350 && <Backdrop glowY={540} />}
      <Shot from={1315} to={1350} src={{ img: "stills/pdf-cover.png", w: 1200, h: 2040 }} box={(fr) => pageBox(fr, 0)} cam={[k(1315, 600, 780, 0.58), k(1350, 600, 760, 0.6, "lin")]} name="PDF cover" />
      <Shot from={1315} to={1350} src={{ img: "stills/pdf-page2.png", w: 1200, h: 1600 }} box={(fr) => pageBox(fr, 1)} cam={[k(1315, 600, 800, 0.58), k(1350, 600, 780, 0.6, "lin")]} name="PDF page 2" />
      <Label from={1322} to={1350} x={230} y={30} eyebrow="Research" text="Reports · PDF" size={36} />

      {/* the chart's fall becomes the backtest's trace */}
      <Shot from={1350} to={1362} src={{ v: "01-markets.mp4", t: 300 }} cam={[k(1350, 260, 1380, 2.6), k(1362, 440, 1900, 2.6, "lin")]} name="Chart descent" />
      <Shot
        from={1362}
        to={1430}
        src={{ img: "stills/bt-curve.png" }}
        cam={[k(1362, 470, 1080, 2.4), k(1382, 600, 1000, 1.26, "land"), k(1430, 600, 1012, 1.29, "lin")]}
        name="Backtest"
      />
      <Label from={1384} to={1500} x={96} y={64} eyebrow="Research" text="Backtests" size={36} />
      <Shot
        from={1430}
        to={1500}
        src={{ img: "stills/bt-compare.png" }}
        cam={[k(1430, 600, 800, 1.5), k(1446, 600, 820, 1.5, "lin"), k(1466, 600, 1452, 1.5, "io"), k(1480, 600, 1462, 1.5, "lin"), k(1496, 600, 2040, 1.5, "io"), k(1500, 600, 2046, 1.5, "lin")]}
        name="Compare"
      />

      {/* a tab underline carries us into prediction markets */}
      <Shot from={1500} to={1525} src={{ v: "05-research-tour.mp4", t: 426 }} cam={[k(1500, 600, 330, 1.6), k(1525, 612, 346, 1.6, "lin")]} name="Tab to Prediction markets" />
      <Shot
        from={1525}
        to={1590}
        src={{ img: "stills/research-predictions.png" }}
        cam={[k(1525, 612, 380, 1.6), k(1548, 600, 1300, 1.16, "land"), k(1562, 600, 1320, 1.16, "lin"), k(1590, 600, 2060, 1.22, "io")]}
        name="Prediction markets"
      />
      <Label from={1530} to={1588} x={1824} y={64} align="right" eyebrow="Research" text="Prediction markets" size={36} />

      {/* the tab rhythm, cut on the native underline */}
      {(
        [
          [1590, 1625, 20],
          [1625, 1658, 612],
          [1658, 1688, 1058],
          [1688, 1725, 1598],
        ] as const
      ).map(([a, b, t]) => (
        <Shot key={a} from={a} to={b} src={{ v: "16-research-tabs.mp4", t, r: a === 1658 ? 1.6 : 1 }} cam={[k(a, 600, 520, 1.4), k(b, 600, 528, 1.42, "lin")]} name={`Tab ${t}`} />
      ))}

      {/* SEC filings and insider activity (Apple, public EDGAR data) */}
      <Shot from={1725} to={1748} src={{ img: "stills/research-sec.png" }} cam={[k(1725, 600, 560, 1.4), k(1748, 600, 572, 1.42, "lin")]} name="SEC" />
      <Shot
        from={1748}
        to={1800}
        src={{ img: "stills/sec-company.png" }}
        cam={[k(1748, 600, 960, 1.36), k(1760, 600, 980, 1.36, "lin"), k(1778, 600, 1790, 1.36, "io"), k(1800, 600, 1800, 1.37, "lin")]}
        name="Insider activity"
      />
      <Label from={1752} to={1800} x={1824} y={64} align="right" eyebrow="Research" text="SEC filings · Insider activity" size={36} />
    </AbsoluteFill>
  );
};
