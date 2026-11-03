import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Shot, type Box } from "../components/Shot";
import { Label } from "../components/Type";
import { k, prog, mix } from "../lib/motion";

/* ---------------------------------------------------------------------------
   1800–2100 · Prepare your move.

   This account is unfunded, so no quote exists and none is shown. What is
   real: the wallet's action row (Swap, Transfer and Withdraw honestly say
   "receive first"), the Actions surface where prepared swaps wait for review
   ("You stay in control … Nothing is sent until your wallet signs"), and
   Receive. The QR is framed by its top half only and the address is blurred.
   The Decision brief's "Set an alert on it from the chart" hands off to the
   alert form by meaning.
--------------------------------------------------------------------------- */

const HOME_BG = "rgb(21,32,18)";

export const Move: React.FC = () => {
  const p1 = (f: number): Box => {
    const t = prog(f, 1800, 1816, "land");
    return { x: mix(620, 560, t), y: 130, w: 1264, h: 820, r: 28, border: true, shadow: true };
  };
  return (
    <AbsoluteFill>
      <Backdrop glowX={1240} glowY={540} />
      <Shot from={1800} to={1860} src={{ img: "stills/portfolio.png" }} box={p1} cam={[k(1800, 600, 1366, 1.08), k(1860, 600, 1372, 1.1, "lin")]} name="Wallet actions">
        {({ map }) => (
          <Label from={1806} to={1860} x={96} y={430} eyebrow="Wallet" text="Prepare your move." size={44} plate={false} anchor={map(186, 1240)} leaderFrom={[420, 82]} />
        )}
      </Shot>

      <Shot from={1860} to={1900} src={{ img: "stills/actions.png" }} bg={HOME_BG} cam={[k(1860, 600, 520, 1.52), k(1900, 600, 560, 1.56, "lin")]} name="Your actions" />
      <Shot
        from={1900}
        to={1990}
        src={{ img: "stills/actions-steps.png" }}
        bg={HOME_BG}
        cam={[k(1900, 600, 1650, 1.14), k(1950, 600, 1690, 1.15, "lin"), k(1990, 640, 2030, 1.46, "io")]}
        name="You stay in control"
      />

      <Shot from={1990} to={2050} src={{ img: "stills/receive.png" }} cam={[k(1990, 600, 590, 1.78), k(2050, 600, 584, 1.84, "lin")]} name="Receive" />
      <Label from={1994} to={2050} x={1556} y={560} eyebrow="Wallet" text="Receive on Solana mainnet" size={36} width={270} />

      <Shot
        from={2050}
        to={2100}
        src={{ v: "09-decision-brief.mp4", t: 200 }}
        cam={[k(2050, 600, 2205, 1.8), k(2072, 600, 2215, 1.82, "lin"), k(2100, 760, 2292, 2.5, "in")]}
        name="Decision brief · Watch next"
      />
    </AbsoluteFill>
  );
};
