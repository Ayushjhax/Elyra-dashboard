import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Kicker, Sub, Title } from "../components/Type";
import { prog } from "../lib/motion";

/* ---------------------------------------------------------------------------
   Bar 15 (frames 1400–1500). A typographic breath between screens: agent
   rails and AI funds, in the words docs/AGENT_RAILS.md and docs/AI_FUNDS.md
   use. Outside agents only ask; the person signs swaps and payments in
   their own wallet, and an AI fund acts only inside the charter its owner
   wrote.
--------------------------------------------------------------------------- */

export const Rails: React.FC = () => {
  const f = useCurrentFrame();
  const push = prog(f, 93, 100, "in");
  return (
    <AbsoluteFill style={{ transform: `scale(${1 + push * 0.04})`, opacity: 1 - push * 0.3 }}>
      <Backdrop glowX={640} glowY={330} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
        <Kicker f={f}>New · Agent rails and AI funds</Kicker>
        <Title f={f} at={2} text={"Agents ask.\n*You sign.*"} size={104} align="center" stagger={5} lineHeight={1.0} />
        <Sub f={f} at={18} align="center" maxWidth={760}>
          Outside agents act only under a mandate you grant. AI funds stay inside the charter you write.
        </Sub>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
