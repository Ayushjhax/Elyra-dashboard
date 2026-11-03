import React from "react";
import { AbsoluteFill } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Shot, FULL, type Box } from "../components/Shot";
import { Label } from "../components/Type";
import { k, prog, mix } from "../lib/motion";
import { useAbsFrame } from "../lib/frame";

/* ---------------------------------------------------------------------------
   2100–2340 · Set the condition; stay connected.

   The SOL price-alert form (08-alert-controls). No rule was saved for the
   film, and for this account price pushes are off — the form says "Inbox
   only · price pushes are off", and that stays on screen. Then the real
   delivery surfaces: the inbox and the notification preferences (toggles as
   they are). Then brief glimpses of the account: wallet sign-in, connections
   (read-only) and referrals.
--------------------------------------------------------------------------- */

const SLAB: Box = { x: 360, y: 190, w: 1200, h: 850, r: 28, border: true, shadow: true };

export const Condition: React.FC = () => {
  const now = useAbsFrame();
  const alertBox = (f: number): Box => {
    const t = prog(f, 2108, 2128, "land");
    return {
      x: mix(FULL.x, SLAB.x, t),
      y: mix(FULL.y, SLAB.y, t),
      w: mix(FULL.w, SLAB.w, t),
      h: mix(FULL.h, SLAB.h, t),
      r: mix(0, 28, t),
      border: t > 0.5,
      shadow: t > 0.5,
    };
  };
  const acct = (f: number): Box => {
    const out = prog(f, 2300, 2314, "land");
    return { x: 560 - 1700 * out, y: 40, w: 1160, h: 1000, r: 28, border: true, shadow: true };
  };
  const refs = (f: number): Box => {
    const inn = prog(f, 2300, 2314, "land");
    const out = prog(f, 2338, 2352, "in");
    return { x: 560 + 1400 * (1 - inn) - 1800 * out, y: 40, w: 1160, h: 1000, r: 28, border: true, shadow: true };
  };
  return (
    <AbsoluteFill>
      {now < 2340 && <Backdrop />}
      <Shot
        from={2100}
        to={2200}
        src={{ v: "08-alert-controls.mp4", t: 100 }}
        box={alertBox}
        cam={[k(2100, 760, 1960, 2.1), k(2128, 600, 1600, 0.98, "land"), k(2168, 600, 1610, 1.0, "lin"), k(2196, 600, 1960, 1.0, "io"), k(2200, 600, 1966, 1.0, "lin")]}
        name="Price alert"
      />
      <Label from={2120} to={2200} x={360} y={56} eyebrow="Alerts" text="Set the condition." size={44} plate={false} />

      <Shot from={2200} to={2226} src={{ img: "stills/inbox.png" }} cam={[k(2200, 600, 560, 1.46), k(2226, 600, 572, 1.48, "lin")]} name="Inbox" />
      <Shot from={2226} to={2266} src={{ img: "stills/notification-settings.png" }} cam={[k(2226, 600, 1640, 1.3), k(2266, 600, 1690, 1.32, "lin")]} name="Notification preferences" />
      <Label from={2204} to={2264} x={1824} y={64} align="right" eyebrow="Delivery" text="Inbox and push preferences" size={36} />

      <Shot from={2266} to={2314} src={{ img: "stills/account.png" }} box={acct} cam={[k(2266, 600, 1260, 0.95), k(2300, 600, 1560, 0.95, "io"), k(2314, 600, 1580, 0.95, "lin")]} name="Account" />
      <Shot from={2300} to={2352} src={{ img: "stills/referrals.png" }} box={refs} cam={[k(2300, 600, 1640, 1.18), k(2352, 600, 1650, 1.2, "lin")]} name="Referrals" />
      <Label from={2270} to={2340} x={96} y={64} eyebrow="Account" text="Wallet sign-in, connections, referrals" size={34} width={330} plate={false} />
    </AbsoluteFill>
  );
};
