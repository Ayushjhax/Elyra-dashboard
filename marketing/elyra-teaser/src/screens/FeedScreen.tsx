import React from "react";
import { BellRing, CalendarClock, ChartLine, Coins, FileSearch, Percent } from "lucide-react";
import { C, F, radius } from "../theme";
import { EASE, clamp01, mix, prog } from "../lib/anim";
import { Abs, Chip, Emblem, Ico, Serif, T } from "./ui";

/* ---------------------------------------------------------------------------
   Four detail shots for "See what matters", stacked as one scrolling surface
   so the camera can whip between them on the beat. Section headings are the
   app's own serif headings (06-signals.png: "Market signals",
   "Smart-money consensus"); figures are illustrative.
--------------------------------------------------------------------------- */

export const SECTION_GAP = 470;
/** Screen-space centre (dp, before scroll) of each section's focal card. */
export const SECTION_CENTER = [0, 1, 2, 3].map((i) => 120 + i * SECTION_GAP + 210);

const Section: React.FC<{ i: number; children: React.ReactNode }> = ({ i, children }) => (
  <div style={{ position: "absolute", left: 0, top: 120 + i * SECTION_GAP, width: 412, height: 440 }}>{children}</div>
);

const Row: React.FC<{ sym: string; value: string; tone: "positive" | "negative"; flash?: number; bold?: boolean }> = ({ sym, value, tone, flash = 0, bold }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 40,
      padding: "0 12px",
      borderTop: `1px solid ${C.border}`,
      background: flash > 0 ? `rgba(196, 99, 58, ${(0.14 * flash).toFixed(3)})` : "transparent",
    }}
  >
    <div style={{ fontFamily: F.sans, fontWeight: bold ? 600 : 500, fontSize: 14, color: C.ivory }}>{sym}</div>
    <div
      style={{
        fontFamily: F.sans,
        fontWeight: 500,
        fontSize: 13,
        padding: "2px 7px",
        borderRadius: radius.chip,
        color: tone === "positive" ? C.positive : C.negative,
        background: tone === "positive" ? C.positiveBg : C.negativeBg,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </div>
  </div>
);

/* 1 — Signals: funding flips negative on SOL perps. */
const Signals: React.FC<{ f: number }> = ({ f }) => {
  const flipped = f >= 614;
  const flash = flipped ? 1 - prog(f, 614, 638, EASE.linear) : 0;
  return (
    <Section i={0}>
      <Abs x={21} y={30}>
        <Serif size={30}>Market signals</Serif>
      </Abs>
      <Abs x={21} y={84} w={370} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: radius.panel, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 12px 10px" }}>
          <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 15, color: C.ivory }}>Funding extremes</div>
          <T v="label" tone="muted">
            Funding APR · Hyperliquid
          </T>
        </div>
        <Row sym="SOL-PERP" value={flipped ? "−18.4%" : "+6.2%"} tone={flipped ? "negative" : "positive"} flash={flash} bold />
        <Row sym="HYPE-PERP" value="+42.1%" tone="positive" />
        <Row sym="ETH-PERP" value="+9.8%" tone="positive" />
        <Row sym="BTC-PERP" value="+7.1%" tone="positive" />
      </Abs>
      <Abs x={21} y={330} w={370} style={{ display: "flex", gap: 8 }}>
        <Chip>Open interest</Chip>
        <Chip>Top movers</Chip>
        <Chip>Venue gaps</Chip>
      </Abs>
      <Abs x={21} y={366}>
        <T v="label" tone="muted">
          Observations, not recommendations.
        </T>
      </Abs>
    </Section>
  );
};

/* 2 — Smart money: tracked wallets converge into one consensus. */
const WALLETS = [18, 44, 70, 96, 122, 148, 170];
const SmartMoney: React.FC<{ f: number }> = ({ f }) => {
  const draw = prog(f, 652, 676, EASE.out);
  const land = prog(f, 672, 682, EASE.out);
  return (
    <Section i={1}>
      <Abs x={21} y={30}>
        <Serif size={30}>Smart-money consensus</Serif>
      </Abs>
      <Abs x={21} y={84} w={370} h={292} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: radius.panel, boxSizing: "border-box" }}>
        <svg width={370} height={190} style={{ position: "absolute", left: 0, top: 0 }}>
          {WALLETS.map((y, i) => {
            const len = 300;
            const d = `M 64 ${y + 6} C 160 ${y + 6}, 190 96, 262 96`;
            return (
              <g key={i}>
                <path d={d} stroke={C.sage} strokeOpacity={0.75} strokeWidth={1.3} fill="none" strokeDasharray={len} strokeDashoffset={len * (1 - clamp01(draw * 1.15 - i * 0.025))} />
                <circle cx={56} cy={y + 6} r={4} fill={C.raised} stroke={C.sage} strokeWidth={1.3} />
              </g>
            );
          })}
        </svg>
        {WALLETS.map((y, i) => (
          <Abs key={i} x={10} y={y - 1}>
            <div style={{ fontFamily: "monospace", fontSize: 9.5, color: C.textMuted }}>{["0x7a…3f", "0x1c…9e", "0xd4…02", "0x93…b1", "0x5e…7d", "0xa0…c4", "0x28…6a"][i]}</div>
          </Abs>
        ))}
        <Abs x={262} y={80} style={{ opacity: land, transform: `scale(${mix(0.9, 1, land)})`, transformOrigin: "0 50%" }}>
          <div style={{ padding: "6px 10px", borderRadius: radius.control, background: C.positiveBg, border: `1px solid ${C.sage}`, fontFamily: F.sans, fontWeight: 600, fontSize: 14, color: C.positive }}>
            Long SOL
          </div>
        </Abs>
        <Abs x={0} y={196} w={370} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 10, padding: "0 14px", boxSizing: "border-box" }}>
          {[
            ["Consensus", "7 wallets"],
            ["Value on this side", "$4.2M"],
            ["Average entry", "$91.80"],
            ["Current price", "$94.20"],
          ].map(([k, v]) => (
            <div key={k}>
              <T v="label" tone="muted">
                {k}
              </T>
              <div style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 15, color: C.ivory, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </Abs>
      </Abs>
    </Section>
  );
};

/* 3 — Research: a backtest card; prediction, yield and unlocks around it. */
const Research: React.FC<{ f: number }> = ({ f }) => {
  const draw = prog(f, 702, 732, EASE.out);
  const pts = Array.from({ length: 40 }, (_, i) => {
    const x = i / 39;
    const y = 0.15 + x * 0.55 + Math.sin(i * 0.9) * 0.05 + Math.sin(i * 0.31) * 0.08 - (i > 22 && i < 28 ? 0.07 : 0);
    return [14 + x * 318, 118 - y * 92] as const;
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <Section i={2}>
      <Abs x={0} y={22} w={412} style={{ display: "flex", gap: 18, paddingLeft: 21, borderBottom: `1px solid ${C.border}` }}>
        {["Reports", "Backtests", "Prediction markets", "Yield", "Unlocks"].map((t) => (
          <div
            key={t}
            style={{
              fontFamily: F.sans,
              fontWeight: 500,
              fontSize: 14,
              paddingBottom: 9,
              color: t === "Backtests" ? C.ivory : C.textSecondary,
              borderBottom: t === "Backtests" ? `3px solid ${C.citron}` : "3px solid transparent",
              whiteSpace: "nowrap",
            }}
          >
            {t}
          </div>
        ))}
      </Abs>
      <Abs x={21} y={72} w={370} h={206} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: radius.panel, boxSizing: "border-box" }}>
        <Abs x={14} y={12}>
          <T v="eyebrow" tone="muted">
            Strategy backtest
          </T>
          <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 17, color: C.ivory, marginTop: 4 }}>EMA 20/50 cross · SOL · 1H</div>
        </Abs>
        <svg width={346} height={130} style={{ position: "absolute", left: 10, top: 62 }}>
          {[30, 62, 94].map((y) => (
            <line key={y} x1={14} x2={332} y1={y} y2={y} stroke={C.border} strokeDasharray="2 4" />
          ))}
          <path d={path} stroke={C.sage} strokeWidth={2} fill="none" strokeDasharray={600} strokeDashoffset={600 * (1 - draw)} strokeLinejoin="round" />
        </svg>
        <Abs x={14} y={176} style={{ display: "flex", gap: 6 }}>
          <Chip>Walk-forward</Chip>
          <Chip>Monte Carlo</Chip>
          <Chip>Hypothetical results</Chip>
        </Abs>
      </Abs>
      <Abs x={21} y={290} w={370} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { icon: Percent, k: "Prediction", v: "Rate-cut odds" },
          { icon: Coins, k: "Yield", v: "Kamino USDC" },
          { icon: CalendarClock, k: "Unlocks", v: "JUP · 3 days" },
        ].map(({ icon, k, v }, i) => (
          <div
            key={k}
            style={{
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: radius.card,
              padding: "9px 10px",
              opacity: prog(f, 712 + i * 4, 720 + i * 4, EASE.out),
            }}
          >
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <Ico icon={icon} size={13} color={C.textSecondary} />
              <T v="label" tone="muted">
                {k}
              </T>
            </div>
            <div style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 13, color: C.ivory, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </Abs>
      <Abs x={21} y={364} style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <Ico icon={FileSearch} size={13} color={C.textMuted} />
        <T v="label" tone="muted">
          SEC filings · reports · market recaps
        </T>
      </Abs>
    </Section>
  );
};

/* 4 — Alerts: a price crosses its rule and lands in the inbox. */
const Alerts: React.FC<{ f: number }> = ({ f }) => {
  const draw = prog(f, 750, 764, EASE.linear);
  const note = prog(f, 764, 774, EASE.out);
  const target = 74;
  const pts = Array.from({ length: 30 }, (_, i) => {
    const x = i / 29;
    const y = 40 + x * 46 + Math.sin(i * 1.3) * 5 + (i > 24 ? (i - 24) * 4 : 0);
    return [12 + x * 330, y] as const;
  });
  const n = Math.max(2, Math.ceil(draw * pts.length));
  const path = pts
    .slice(0, n)
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const head = pts[n - 1];
  const crossed = head[1] > target;
  return (
    <Section i={3}>
      <Abs x={21} y={30}>
        <Serif size={30}>Alerts</Serif>
      </Abs>
      <Abs x={21} y={84} w={370} h={150} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: radius.panel, boxSizing: "border-box" }}>
        <Abs x={14} y={12} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Ico icon={ChartLine} size={14} color={C.textSecondary} />
          <T v="label" tone="secondary">
            SOL · falls below $92.00 · push + inbox
          </T>
        </Abs>
        <svg width={360} height={116} style={{ position: "absolute", left: 4, top: 30 }}>
          <line x1={12} x2={344} y1={target} y2={target} stroke={C.textMuted} strokeDasharray="4 4" strokeWidth={1} />
          <path d={path} stroke={C.ivory} strokeWidth={1.8} fill="none" strokeLinejoin="round" />
          <circle cx={head[0]} cy={head[1]} r={4} fill={crossed ? C.clay : C.ivory} />
        </svg>
        <Abs x={300} y={30 + target - 20}>
          <T v="dataSm" tone="muted">
            $92.00
          </T>
        </Abs>
      </Abs>
      {/* The notification, as the inbox shows it */}
      <Abs
        x={21}
        y={252}
        w={370}
        style={{
          opacity: note,
          transform: `translateY(${(1 - note) * -18}px)`,
          background: C.raised,
          border: `1px solid ${C.borderStrong}`,
          borderRadius: radius.sheet,
          padding: "12px 14px",
          boxSizing: "border-box",
          display: "flex",
          gap: 12,
        }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 10, background: C.base, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border}` }}>
          <Emblem size={28} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <T v="label" tone="secondary">
              Elyra · price rule
            </T>
            <T v="label" tone="muted">
              now
            </T>
          </div>
          <div style={{ fontFamily: F.sans, fontWeight: 600, fontSize: 15, color: C.ivory, marginTop: 3 }}>SOL fell below $92.00</div>
          <T v="label" tone="secondary" style={{ marginTop: 2 }}>
            Notified once · saved to your inbox
          </T>
        </div>
      </Abs>
      <Abs x={21} y={350} style={{ display: "flex", gap: 6, alignItems: "center", opacity: note }}>
        <Ico icon={BellRing} size={13} color={C.textMuted} />
        <T v="label" tone="muted">
          A rule tells you. It never trades.
        </T>
      </Abs>
    </Section>
  );
};

export const FeedScreen: React.FC<{ frame: number; scroll: number }> = ({ frame, scroll }) => (
  <div style={{ position: "absolute", left: 0, top: -scroll, width: 412, height: 2400 }}>
    <Signals f={frame} />
    <SmartMoney f={frame} />
    <Research f={frame} />
    <Alerts f={frame} />
  </div>
);
