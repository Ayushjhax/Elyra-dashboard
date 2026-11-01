import React from "react";
import { Check, Mic, Plus, SendHorizontal, Sparkles } from "lucide-react";
import { C, F, radius } from "../theme";
import { ACCOUNT } from "../config/data";
import timeline from "../config/timeline.json";
import { EASE, clamp01, prog } from "../lib/anim";
import { Abs, AgentBlock, AppHeader, Chip, Ico, SegTabs, Serif, StatusBar, T, TabBar, Touch, UserBubble } from "./ui";

/* ---------------------------------------------------------------------------
   Ask Elyra → Capital: the question, the four account sources being read,
   and a short grounded brief with the lime agent rail. Reconstructed from
   01-ask-elyra.png and 05-capital-intelligence.png; the figures are the
   illustrative account in config/data.ts.
--------------------------------------------------------------------------- */

const Q = "Where am I exposed?";
const cue = timeline.cues;

export const ANSWER_TOP = 268;
export const RAIL_X = 17;
const BLOCK_FINAL_H = 309;

const SOURCES = ["Portfolio", "Positions", "Activity", "Memory"];

const Insight: React.FC<{ eyebrow: string; value: string; detail: string; tone?: "primary" | "accent"; t: number }> = ({
  eyebrow,
  value,
  detail,
  tone = "primary",
  t,
}) => (
  <div
    style={{
      opacity: clamp01(t * 1.4),
      transform: `translateY(${(1 - t) * 8}px)`,
      background: C.panel,
      border: `1px solid ${C.border}`,
      borderRadius: radius.card,
      padding: "8px 11px 9px",
      height: 58,
      boxSizing: "border-box",
    }}
  >
    <T v="eyebrow" tone="muted">
      {eyebrow}
    </T>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 5 }}>
      <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 17, lineHeight: "22px", color: tone === "accent" ? C.citron : C.ivory, letterSpacing: "-0.01em" }}>
        {value}
      </div>
      <T v="label" tone="secondary">
        {detail}
      </T>
    </div>
  </div>
);

/** Streams words in, as the agent does — never a block fade. */
const Stream: React.FC<{ text: string; t: number; style?: React.CSSProperties }> = ({ text, t, style }) => {
  const words = text.split(" ");
  const shown = Math.ceil(clamp01(t) * words.length);
  return (
    <div style={style}>
      {words.map((w, i) => (
        <span key={i} style={{ opacity: i < shown ? 1 : 0 }}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </div>
  );
};

export const AskScreen: React.FC<{ frame: number }> = ({ frame }) => {
  const typed = Math.floor(prog(frame, cue.typingStart, cue.typingEnd, EASE.linear) * Q.length);
  const sent = frame >= cue.sendTap + 1;
  const bubbleT = prog(frame, cue.sendTap + 1, cue.sendTap + 7, EASE.out);
  const working = frame >= 222 && frame < 262;
  const blockT = prog(frame, 222, 229, EASE.out);
  const growT = prog(frame, 260, cue.insightResolve, EASE.out);
  const blockH = frame < 260 ? 44 : 44 + (BLOCK_FINAL_H - 44) * growT;
  const headT = prog(frame, 262, 278, EASE.linear);
  const cardT = [0, 1, 2].map((i) => prog(frame, 274 + i * 8, 282 + i * 8, EASE.out));
  const srcT = prog(frame, 294, 300, EASE.out);
  const caretOn = frame < cue.sendTap && Math.floor(frame / 8) % 2 === 0;
  const readIndex = cue.contextChecks.filter((c) => frame >= c).length;

  return (
    <>
      <StatusBar />
      <AppHeader />
      <SegTabs active={1} />

      {/* Account context — the four sources the brief is grounded in. */}
      <Abs x={21} y={162}>
        <T v="label" tone="muted">
          Account context · 4 sources selected
        </T>
      </Abs>
      <Abs x={21} y={184} w={370} style={{ display: "flex", gap: 6 }}>
        {SOURCES.map((s, i) => {
          const read = i < readIndex;
          return (
            <Chip key={s} active={read} style={{ flex: 1, justifyContent: "center", height: 30, padding: "0 6px", fontSize: 12.5, color: read ? C.ivory : C.textSecondary }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: C.citron, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Ico icon={Check} size={11} color={C.onAccent} stroke={2.6} />
              </div>
              {s}
            </Chip>
          );
        })}
      </Abs>

      {/* The Capital tab's own empty state (05-capital-intelligence.png), until the question is sent. */}
      {frame < 226 && (
        <Abs
          x={0}
          y={462}
          w={412}
          style={{ opacity: 1 - prog(frame, cue.sendTap, cue.sendTap + 7, EASE.brand), display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <Serif size={32}>What&apos;s your next move?</Serif>
          <T v="body" tone="secondary" size={15} style={{ marginTop: 10 }}>
            Your capital, positions and preferences.
          </T>
        </Abs>
      )}

      {/* The question */}
      {sent && (
        <Abs
          x={0}
          y={226}
          w={391}
          style={{ display: "flex", justifyContent: "flex-end", opacity: bubbleT, transform: `translateY(${(1 - bubbleT) * 14}px)` }}
        >
          <UserBubble text={Q} />
        </Abs>
      )}

      {/* The brief */}
      {frame >= 222 && (
        <Abs x={RAIL_X} y={ANSWER_TOP} w={378} h={blockH} style={{ opacity: blockT, overflow: "hidden", borderRadius: `0 ${radius.card}px ${radius.card}px 0` }}>
          <AgentBlock rail={frame < 260 ? blockT : 1} style={{ height: "100%" }}>
            {working && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 22 }}>
                <Ico icon={Sparkles} size={14} color={C.lime} />
                <div style={{ fontFamily: F.sans, fontSize: 13, color: C.textSecondary, whiteSpace: "nowrap" }}>
                  Reading{" "}
                  {SOURCES.map((s, i) => (
                    <span key={s} style={{ color: i < readIndex ? C.ivory : C.textMuted }}>
                      {s.toLowerCase()}
                      {i < 3 ? " · " : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {frame >= 260 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Stream
                  t={headT}
                  text={`SOL is ${ACCOUNT.allocation[0].pct}% of your capital — above your ${ACCOUNT.capPct}% cap.`}
                  style={{ fontFamily: F.display, fontWeight: 600, fontSize: 17, lineHeight: "23px", color: C.ivory, width: 330, marginBottom: 4, letterSpacing: "-0.01em" }}
                />
                <Insight t={cardT[0]} eyebrow="Exposure" value={`SOL ${ACCOUNT.allocation[0].pct}%`} detail="92.4 SOL + perp 3×" />
                <Insight t={cardT[1]} eyebrow="Risk" value={`${ACCOUNT.perp.headroomPct}% to liquidation`} detail="SOL-PERP · liq. $77.30" tone="accent" />
                <Insight t={cardT[2]} eyebrow="Catalyst" value={ACCOUNT.catalyst.title} detail="You hold 1,240 JUP" />
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, opacity: srcT }}>
                  <T v="label" tone="secondary" style={{ marginRight: 2 }}>
                    Sources
                  </T>
                  {["Wallet", "Hyperliquid", "Binance", "Memory"].map((s) => (
                    <Chip key={s}>{s}</Chip>
                  ))}
                </div>
              </div>
            )}
          </AgentBlock>
        </Abs>
      )}

      {/* Composer, as in 01-ask-elyra.png */}
      <Abs x={21} y={752}>
        <T v="bodySm" tone="secondary">
          Ask about your capital
        </T>
      </Abs>
      <Abs
        x={17}
        y={776}
        w={378}
        h={56}
        style={{
          background: C.raised,
          border: `1px solid ${frame >= cue.typingStart && !sent ? C.khaki : C.borderStrong}`,
          borderRadius: 12,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 14,
        }}
      >
        <Ico icon={Plus} size={20} color={C.textSecondary} />
        <div style={{ flex: 1, fontFamily: F.sans, fontSize: 16, color: !sent && typed > 0 ? C.ivory : C.textMuted, whiteSpace: "nowrap" }}>
          {!sent && typed > 0 ? Q.slice(0, typed) : "Ask Elyra..."}
          {caretOn && frame >= cue.typingStart - 2 && (
            <span style={{ display: "inline-block", width: 1.5, height: 18, background: C.citron, marginLeft: 1, verticalAlign: "-3px" }} />
          )}
        </div>
        <Ico icon={Mic} size={19} color={C.textSecondary} />
        <Ico icon={SendHorizontal} size={19} color={!sent && typed === Q.length ? C.citron : C.textMuted} />
      </Abs>
      <Touch x={367} y={804} t={(frame - (cue.sendTap - 4)) / 14} />

      <TabBar active={2} />
    </>
  );
};
