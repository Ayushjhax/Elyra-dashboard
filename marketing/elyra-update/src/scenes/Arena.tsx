import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Fine, Kicker, Sub, Title } from "../components/Type";
import { prog } from "../lib/motion";
import { C, F, H } from "../theme";

/* ---------------------------------------------------------------------------
   Bars 8–9 (frames 700–900). Arena leagues, as a diagram of the game — the
   League tab needs a signed-in account.

   The rules shown are lib/arena/league.ts: managers snake-draft markets
   from the perp pool (crypto and trade[XYZ]'s Nasdaq stock perps), nobody
   else in the league can hold a market once it is picked, and a round is
   won by the lineup's average move. The handles, picks and scores are
   illustrative; the share line is the format docs/ARENA.md specifies.
--------------------------------------------------------------------------- */

const MANAGERS = ["@you", "@ana", "@ben"];
/* Snake order: round 1 left to right, round 2 back, round 3 forward again. */
const PICKS: { round: number; manager: number; market: string }[] = [
  { round: 0, manager: 0, market: "BTC" },
  { round: 0, manager: 1, market: "ETH" },
  { round: 0, manager: 2, market: "HYPE" },
  { round: 1, manager: 2, market: "SOL" },
  { round: 1, manager: 1, market: "NVDA" },
  { round: 1, manager: 0, market: "XRP" },
  { round: 2, manager: 0, market: "LINK" },
  { round: 2, manager: 1, market: "DOGE" },
  { round: 2, manager: 2, market: "SUI" },
];
const PICK_EVERY = 8;
const FIRST_PICK = 16;

const BOARD_X = 612;
const BOARD_Y = 150;
const COL_W = 176;
const ROW_H = 74;

export const Arena: React.FC = () => {
  const f = useCurrentFrame();
  const push = prog(f, 193, 200, "in");
  const made = Math.max(0, Math.min(PICKS.length, Math.floor((f - FIRST_PICK) / PICK_EVERY) + 1));
  const onClock = made < PICKS.length ? PICKS[made] : null;
  const result = prog(f, 112, 132, "land");
  const boardIn = prog(f, 4, 24, "land");
  return (
    <AbsoluteFill style={{ transform: `translateX(${-push * 46}px)`, opacity: 1 - push * 0.25 }}>
      <Backdrop glowX={900} glowY={330} />
      <div style={{ position: "absolute", left: 72, top: 0, height: H, width: 480, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
        <Kicker f={f}>New · Arena leagues</Kicker>
        <Title f={f} at={2} text={"Fantasy leagues,\n*drafted with markets.*"} size={54} />
        <Sub f={f} at={12} maxWidth={460}>
          Invite friends, snake-draft markets, then play a season of head-to-head rounds.
        </Sub>
        <Fine f={f} at={28}>
          Points and paper only. Nothing is staked.
        </Fine>
      </div>

      <div style={{ position: "absolute", left: BOARD_X, top: BOARD_Y, opacity: boardIn, transform: `translateY(${(1 - boardIn) * 30}px) scale(${1 - result * 0.06})`, transformOrigin: "top center" }}>
        {/* managers */}
        <div style={{ display: "flex", marginLeft: 70 }}>
          {MANAGERS.map((manager, i) => (
            <div
              key={manager}
              style={{
                width: COL_W,
                textAlign: "center",
                fontFamily: F.sans,
                fontWeight: 600,
                fontSize: 17,
                color: onClock?.manager === i ? C.citron : C.stone,
              }}
            >
              {manager}
              {onClock?.manager === i && <span style={{ fontWeight: 500, fontSize: 12, color: C.citron }}> · on the clock</span>}
            </div>
          ))}
        </div>
        {[0, 1, 2].map((round) => (
          <div key={round} style={{ display: "flex", alignItems: "center", marginTop: 12 }}>
            <div style={{ width: 70, fontFamily: F.sans, fontWeight: 600, fontSize: 13, letterSpacing: "0.12em", color: C.muted }}>R{round + 1}</div>
            {[0, 1, 2].map((manager) => {
              const index = PICKS.findIndex((pick) => pick.round === round && pick.manager === manager);
              const pick = PICKS[index];
              const t = prog(f, FIRST_PICK + index * PICK_EVERY, FIRST_PICK + index * PICK_EVERY + 10, "land");
              return (
                <div key={manager} style={{ width: COL_W, padding: "0 7px" }}>
                  <div
                    style={{
                      height: ROW_H - 12,
                      borderRadius: 12,
                      border: `1px solid ${t > 0 ? C.borderStrong : C.border}`,
                      background: t > 0 ? C.raised : "rgba(24,33,23,0.5)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: F.display,
                      fontWeight: 700,
                      fontSize: 26,
                      letterSpacing: "-0.01em",
                      color: C.ivory,
                    }}
                  >
                    <span style={{ opacity: t, transform: `scale(${1.35 - 0.35 * t})`, display: "inline-block" }}>{pick.market}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* a round settles */}
      <div
        style={{
          position: "absolute",
          left: BOARD_X + 70,
          top: 470,
          width: COL_W * 3,
          borderRadius: 16,
          border: `1px solid ${C.borderStrong}`,
          background: C.panel,
          padding: "16px 20px",
          opacity: result,
          transform: `translateY(${(1 - result) * 40}px)`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted }}>Round 1 · settled on Hyperliquid's daily opens</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 8, fontFamily: F.display, fontWeight: 700, fontSize: 30, color: C.ivory }}>
          <span>@you</span>
          <span style={{ color: C.positive }}>+3.21%</span>
          <span style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 18, color: C.stone }}>beat</span>
          <span>@ana</span>
          <span style={{ color: C.negative }}>−0.40%</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
