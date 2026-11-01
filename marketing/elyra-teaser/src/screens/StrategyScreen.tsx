import React from "react";
import { ClipboardCheck, ShieldAlert } from "lucide-react";
import { C, F, radius } from "../theme";
import { STRATEGY } from "../config/data";
import timeline from "../config/timeline.json";
import { EASE, clamp01, mix, prog } from "../lib/anim";
import { Abs, AgentBlock, AppHeader, Ico, Serif, StatusBar, T, TabBar, UserBubble } from "./ui";
import { ALLOC_FILL } from "./PortfolioScreen";

/* ---------------------------------------------------------------------------
   PRODUCT VISION — a concept interface, not a shipped feature. A
   conversational strategy builder: a goal in plain words, a risk condition,
   a what-if allocation and a rebalance ready for the person's review. Only
   two things change on screen: the condition lights, then the simulated
   allocation and the ready state resolve.
--------------------------------------------------------------------------- */

const cue = timeline.cues;
const MAX_PCT = 45;
const BAR_W = 210;

export const StrategyScreen: React.FC<{ frame: number; emblemOpacity?: number; titleOpacity?: number }> = ({ frame, emblemOpacity = 1, titleOpacity = 1 }) => {
  const hl = prog(frame, cue.conditionHighlight, cue.conditionHighlight + 8, EASE.out);
  const sim = prog(frame, cue.allocationResolve, cue.allocationResolve + 14, EASE.out);
  const ready = prog(frame, cue.allocationResolve + 6, cue.allocationResolve + 14, EASE.out);
  const thresholdX = (30 / MAX_PCT) * BAR_W;
  return (
    <>
      <StatusBar />
      <AppHeader emblemOpacity={emblemOpacity} titleOpacity={titleOpacity} />
      <Abs x={21} y={104}>
        <Serif size={30}>Strategy</Serif>
      </Abs>

      <Abs x={0} y={152} w={391} style={{ display: "flex", justifyContent: "flex-end" }}>
        <UserBubble text={STRATEGY.goal} />
      </Abs>

      <Abs x={17} y={204} w={378}>
        <AgentBlock>
          {/* Risk condition */}
          <T v="eyebrow" tone="muted">
            Risk condition
          </T>
          <div
            style={{
              marginTop: 7,
              borderRadius: radius.card,
              border: `1px solid ${hl > 0 ? C.citron : C.border}`,
              borderColor: hl > 0.01 ? `rgba(210,220,118,${(0.35 + 0.65 * hl).toFixed(3)})` : C.border,
              background: C.panel,
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Ico icon={ShieldAlert} size={16} color={hl > 0.5 ? C.citron : C.textSecondary} />
              <div style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 14, color: C.ivory }}>{STRATEGY.condition}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, height: 22 }}>
            <div
              style={{
                padding: "2px 8px",
                borderRadius: radius.chip,
                background: hl > 0 ? `rgba(196,99,58,${(0.14 * hl).toFixed(3)})` : "transparent",
                border: `1px solid ${hl > 0 ? "transparent" : C.border}`,
                fontFamily: F.sans,
                fontWeight: 500,
                fontSize: 12.5,
                color: hl > 0.3 ? C.negative : C.textSecondary,
              }}
            >
              {STRATEGY.trigger}
            </div>
            <T v="label" tone="muted">
              Checked every 5 minutes
            </T>
          </div>

          {/* What-if allocation */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            <T v="eyebrow" tone="muted">
              What-if allocation
            </T>
            <T v="label" tone="secondary">
              {sim > 0.5 ? "After rebalance" : "Now"}
            </T>
          </div>
          <div style={{ position: "relative", marginTop: 8 }}>
            {STRATEGY.rows.map((r) => {
              const v = mix(r.now, r.after, sim);
              return (
                <div key={r.sym} style={{ display: "flex", alignItems: "center", height: 24 }}>
                  <div style={{ width: 52, fontFamily: F.sans, fontWeight: 500, fontSize: 13, color: C.ivory }}>{r.sym}</div>
                  <div style={{ position: "relative", width: BAR_W, height: 9 }}>
                    <div style={{ position: "absolute", left: 0, top: 0, height: 9, width: (r.now / MAX_PCT) * BAR_W, borderRadius: 3, border: `1px solid ${C.borderStrong}`, boxSizing: "border-box", opacity: sim }} />
                    <div style={{ position: "absolute", left: 0, top: 0, height: 9, width: (v / MAX_PCT) * BAR_W, borderRadius: 3, background: ALLOC_FILL[r.sym] }} />
                  </div>
                  <div style={{ width: 70, textAlign: "right", fontFamily: F.sans, fontWeight: 500, fontSize: 13, color: r.sym === "SOL" && sim < 0.5 ? C.negative : C.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(v)}%
                  </div>
                </div>
              );
            })}
            {/* The 30% threshold */}
            <div style={{ position: "absolute", left: 52 + thresholdX, top: -2, width: 0, height: 24 * 5 + 2, borderLeft: `1.5px dashed ${C.lime}`, opacity: 0.7 }} />
          </div>

          {/* Ready for review */}
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: `1px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: mix(0.35, 1, ready),
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Ico icon={ClipboardCheck} size={15} color={ready > 0.5 ? C.lime : C.textMuted} />
                <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 15, color: C.ivory }}>{ready > 0.5 ? "Ready for your review" : "Simulating…"}</div>
              </div>
              <T v="label" tone="secondary" style={{ marginTop: 3 }}>
                {STRATEGY.summary}
              </T>
            </div>
            <div
              style={{
                padding: "9px 14px",
                borderRadius: radius.control,
                background: ready > 0.5 ? C.citron : C.hover,
                fontFamily: F.sans,
                fontWeight: 600,
                fontSize: 14,
                color: ready > 0.5 ? C.onAccent : C.textMuted,
                transform: `scale(${mix(0.96, 1, clamp01(ready))})`,
              }}
            >
              Review
            </div>
          </div>
        </AgentBlock>
      </Abs>

      <Abs x={21} y={556}>
        <T v="label" tone="muted">
          Nothing runs without your approval.
        </T>
      </Abs>

      <TabBar active={2} />
    </>
  );
};
