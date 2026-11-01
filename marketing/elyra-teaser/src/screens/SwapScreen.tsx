import React from "react";
import { ArrowDown, ArrowLeftRight, Check, ClipboardCheck, Fingerprint, X } from "lucide-react";
import { C, F, radius } from "../theme";
import { SWAP } from "../config/data";
import timeline from "../config/timeline.json";
import { EASE, clamp01, prog } from "../lib/anim";
import { Abs, Ico, StatusBar, T, Touch } from "./ui";
import { PortfolioScreen } from "./PortfolioScreen";

/* ---------------------------------------------------------------------------
   The swap screen (mobile/src/app/swap.tsx) with a swap Elyra prepared for
   review — quote and details already present — and one approval gesture.
   Copy is the app's own ("You pay", "Confirm swap", "Nothing is sent until
   your wallet signs it. Routed by Jupiter."). ILLUSTRATIVE: no transaction
   was built, signed or sent for this film.
--------------------------------------------------------------------------- */

const cue = timeline.cues;
export const CONFIRM_BTN = { x: 206, y: 660, w: 178, h: 48 };
const SHEET_TOP = 170;

const Coin: React.FC<{ letter: string }> = ({ letter }) => (
  <div
    style={{
      width: 22,
      height: 22,
      borderRadius: 99,
      background: C.hover,
      border: `1px solid ${C.borderStrong}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: F.sans,
      fontWeight: 600,
      fontSize: 11,
      color: C.ivory,
    }}
  >
    {letter}
  </div>
);

const Amount: React.FC<{ label: string; amount: string; sym: string; sub: string; y: number }> = ({ label, amount, sym, sub, y }) => (
  <Abs x={21} y={y} w={370} h={92} style={{ background: C.raised, border: `1px solid ${C.borderStrong}`, borderRadius: radius.panel, boxSizing: "border-box" }}>
    <Abs x={14} y={11}>
      <T v="label" tone="secondary">
        {label}
      </T>
    </Abs>
    <Abs x={14} y={32} style={{ fontFamily: F.display, fontWeight: 600, fontSize: 30, lineHeight: "36px", color: C.ivory, letterSpacing: "-0.015em" }}>
      {amount}
    </Abs>
    <Abs x={14} y={68}>
      <T v="label" tone="muted">
        {sub}
      </T>
    </Abs>
    <Abs
      x={262}
      y={34}
      w={94}
      h={34}
      style={{ borderRadius: 99, border: `1px solid ${C.border}`, background: C.panel, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", boxSizing: "border-box" }}
    >
      <Coin letter={sym[0]} />
      <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 14, color: C.ivory }}>{sym}</div>
    </Abs>
  </Abs>
);

const Field: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", height: 28, alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
    <T v="bodySm" tone="secondary">
      {k}
    </T>
    <T v="data">{v}</T>
  </div>
);

export const SwapScreen: React.FC<{ frame: number }> = ({ frame }) => {
  const sheetT = prog(frame, 796, 810, EASE.out);
  const pressed = frame >= cue.approveTap - 2 && frame < cue.approveTap + 6;
  const walletT = prog(frame, cue.approveTap + 2, cue.approveTap + 12, EASE.out);
  const ring = prog(frame, cue.approveTap + 10, cue.approved - 1, EASE.inOut);
  const ok = frame >= cue.approved;
  const okT = prog(frame, cue.approved, cue.approved + 6, EASE.out);
  const sheetY = SHEET_TOP + (1 - sheetT) * 300;
  return (
    <>
      {/* The portfolio underneath, dimmed by the sheet's scrim. */}
      <PortfolioScreen venues={4} alloc={1} risk={1} capMark />
      <Abs x={0} y={0} w={412} h={917} style={{ background: "rgba(10,13,9,0.72)" }} />
      <StatusBar />

      <div style={{ position: "absolute", left: 0, top: sheetY, width: 412, height: 917 - SHEET_TOP }}>
        <Abs x={0} y={0} w={412} h={800} style={{ background: C.panel, borderTop: `1px solid ${C.borderStrong}`, borderRadius: "16px 16px 0 0" }} />
        <Abs x={186} y={8} w={40} h={4} style={{ background: C.borderStrong, borderRadius: 3 }} />
        <Abs x={21} y={26} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Ico icon={ArrowLeftRight} size={18} />
          <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 20, color: C.ivory }}>Swap</div>
        </Abs>
        <Abs x={366} y={28}>
          <Ico icon={X} size={18} color={C.textSecondary} />
        </Abs>

        {/* Prepared by Elyra — agent output, so it carries the rail. */}
        <Abs x={17} y={66} w={378} h={50} style={{ background: C.raised, borderLeft: `3px solid ${C.rail}`, borderRadius: "0 10px 10px 0", boxSizing: "border-box", padding: "8px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Ico icon={ClipboardCheck} size={13} color={C.lime} />
            <T v="eyebrow" tone="muted">
              Prepared by Elyra
            </T>
          </div>
          <T v="bodySm" style={{ marginTop: 3 }}>
            Trim SOL toward your 25% cap
          </T>
        </Abs>

        <Amount label="You pay" amount={SWAP.payAmount} sym={SWAP.paySym} sub={`≈ ${SWAP.payUsd}`} y={128} />
        <Abs x={190} y={210} w={32} h={32} style={{ borderRadius: 99, background: C.hover, border: `1px solid ${C.borderStrong}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Ico icon={ArrowDown} size={16} />
        </Abs>
        <Amount label="You receive" amount={SWAP.receiveAmount} sym={SWAP.receiveSym} sub={`Minimum ${SWAP.minReceived}`} y={232} />

        <Abs x={21} y={338} w={370}>
          <Field k="Route" v={SWAP.route} />
          <Field k="Price impact" v={SWAP.impact} />
          <Field k="Slippage" v={SWAP.slippage} />
        </Abs>
        <Abs x={21} y={434}>
          <T v="label" tone="muted">
            Nothing is sent until your wallet signs it. Routed by Jupiter.
          </T>
        </Abs>
      </div>

      {/* Buttons */}
      <div style={{ position: "absolute", left: 0, top: (1 - sheetT) * 300, width: 412, height: 917 }}>
        <Abs x={28} y={CONFIRM_BTN.y} w={166} h={48} style={{ borderRadius: radius.control, border: `1px solid ${C.borderStrong}`, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
          <T v="body" size={15} style={{ fontWeight: 500 }}>
            Cancel
          </T>
        </Abs>
        <Abs
          x={CONFIRM_BTN.x}
          y={CONFIRM_BTN.y}
          w={CONFIRM_BTN.w}
          h={CONFIRM_BTN.h}
          style={{
            borderRadius: radius.control,
            background: pressed ? C.olive : C.citron,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${pressed ? 0.97 : 1})`,
          }}
        >
          <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 15, color: C.onAccent }}>{frame >= cue.approveTap ? "Waiting for wallet" : "Confirm swap"}</div>
        </Abs>
        <Abs x={150} y={903} w={112} h={3} style={{ borderRadius: 3, background: C.ivory, opacity: 0.92 }} />
      </div>
      <Touch x={CONFIRM_BTN.x + CONFIRM_BTN.w / 2} y={CONFIRM_BTN.y + CONFIRM_BTN.h / 2} t={(frame - (cue.approveTap - 6)) / 16} />

      {/* The wallet's approval prompt — the person's signature, nothing else, moves money. */}
      {walletT > 0 && (
        <Abs
          x={12}
          y={452 + (1 - walletT) * 480}
          w={388}
          h={270}
          style={{ background: C.raised, border: `1px solid ${C.borderStrong}`, borderRadius: radius.sheet, boxShadow: "0 8px 24px rgba(0,0,0,0.45)", boxSizing: "border-box" }}
        >
          <Abs x={20} y={20}>
            <T v="eyebrow" tone="muted">
              Your wallet
            </T>
            <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 20, color: C.ivory, marginTop: 6 }}>{ok ? "Approved by you" : "Approve this swap"}</div>
            <T v="bodySm" tone="secondary" style={{ marginTop: 4 }}>
              80 SOL → 7,536.8 USDC · signed on this phone
            </T>
          </Abs>
          <Abs x={154} y={112} w={80} h={80}>
            <svg width={80} height={80} style={{ position: "absolute", inset: 0 }}>
              <circle cx={40} cy={40} r={36} stroke={C.borderStrong} strokeWidth={3} fill="none" />
              <circle
                cx={40}
                cy={40}
                r={36}
                stroke={ok ? C.positive : C.citron}
                strokeWidth={3}
                fill="none"
                strokeDasharray={226.2}
                strokeDashoffset={226.2 * (1 - (ok ? 1 : ring))}
                transform="rotate(-90 40 40)"
                strokeLinecap="round"
              />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {ok ? (
                <div style={{ transform: `scale(${0.7 + 0.3 * okT})` }}>
                  <Ico icon={Check} size={34} color={C.positive} stroke={2.4} />
                </div>
              ) : (
                <Ico icon={Fingerprint} size={34} color={C.ivory} />
              )}
            </div>
          </Abs>
          <Abs x={0} y={204} w={388} style={{ display: "flex", justifyContent: "center", opacity: clamp01(1 - okT) }}>
            <T v="bodySm" tone="secondary">
              Touch the sensor to sign
            </T>
          </Abs>
        </Abs>
      )}
    </>
  );
};
