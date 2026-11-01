import React from "react";
import { Building2, ChartLine, Layers, Wallet, type LucideIcon } from "lucide-react";
import { C, F, radius } from "../theme";
import { ACCOUNT, usd } from "../config/data";
import { clamp01 } from "../lib/anim";
import { Abs, AppHeader, Chip, Ico, Serif, StatusBar, T, TabBar } from "./ui";

/* ---------------------------------------------------------------------------
   Portfolio, populated with the illustrative account. Layout follows
   03-portfolio.png (value card, serif section heading, cards); the venue
   rows, allocation and capital-health card are the connected-portfolio
   features the README lists, rebuilt in the same visual language.
--------------------------------------------------------------------------- */

/** Allocation segment fills — neutral greens, never lime (lime is the agent's). */
export const ALLOC_FILL: Record<string, string> = {
  SOL: C.ivory,
  BTC: C.sage,
  USDC: C.moss,
  ETH: C.khaki,
  Other: C.slate,
};

export const BAR = { x: 37, y: 226, w: 338, h: 10 };
/** The 25% cap marker — where the agent rail lands in the match cut. */
export const CAP_MARK = { x: BAR.x + (BAR.w * ACCOUNT.capPct) / 100, y: BAR.y + BAR.h / 2 };
export const VENUE_ROW_Y = [344, 408, 472, 536];
export const VENUE_ROW_H = 58;
export const RISK_CARD = { x: 21, y: 610, w: 370, h: 116 };

const VENUE_ICON: Record<string, LucideIcon> = { wallet: Wallet, hyperliquid: ChartLine, binance: Building2, defi: Layers };

export const VenueRow: React.FC<{ index: number; style?: React.CSSProperties }> = ({ index, style }) => {
  const v = ACCOUNT.venues[index];
  return (
    <div
      style={{
        width: 370,
        height: VENUE_ROW_H,
        boxSizing: "border-box",
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: radius.card,
        display: "flex",
        alignItems: "center",
        padding: "0 14px 0 12px",
        gap: 12,
        ...style,
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 99, background: C.raised, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ico icon={VENUE_ICON[v.key]} size={16} color={C.ivory} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 14.5, color: C.ivory, lineHeight: "19px" }}>{v.name}</div>
        <T v="label" tone="secondary">
          {v.detail}
        </T>
      </div>
      <div style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 14.5, color: C.ivory }}>{usd(v.value)}</div>
    </div>
  );
};

export const PortfolioScreen: React.FC<{
  /** How many venue rows are connected (0–4). */
  venues: number;
  /** Allocation bar fill 0→1. */
  alloc: number;
  /** Risk gauge draw 0→1. */
  risk: number;
  /** Cap marker visible inside the screen (the overlay line hands off to it). */
  capMark: boolean;
  /** Hide a row while its plane is still travelling in. */
  hideRow?: (i: number) => boolean;
}> = ({ venues, alloc, risk, capMark, hideRow }) => {
  const total = ACCOUNT.venues.slice(0, venues).reduce((a, v) => a + v.value, 0);
  let acc = 0;
  return (
    <>
      <StatusBar />
      <AppHeader title="Portfolio" />

      {/* Value card */}
      <Abs x={21} y={100} w={370} h={190} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: radius.sheet, boxSizing: "border-box" }} />
      <Abs x={37} y={116}>
        <T v="body" tone="secondary" size={15}>
          Portfolio value
        </T>
      </Abs>
      <Abs x={37} y={138} style={{ fontFamily: F.display, fontWeight: 600, fontSize: 46, lineHeight: "52px", color: C.ivory, letterSpacing: "-0.02em" }}>
        {venues === 0 ? "—" : usd(total)}
      </Abs>
      <Abs x={0} y={118} w={375} style={{ display: "flex", justifyContent: "flex-end" }}>
        <Chip>{venues} of 4 venues</Chip>
      </Abs>
      <Abs x={37} y={202} w={338} style={{ display: "flex", justifyContent: "space-between" }}>
        <T v="label" tone="muted">
          Allocation
        </T>
        <T v="label" tone="agent">
          Your cap {ACCOUNT.capPct}%
        </T>
      </Abs>
      <Abs x={BAR.x} y={BAR.y} w={BAR.w} h={BAR.h} style={{ borderRadius: 5, background: C.hover, overflow: "hidden", display: "flex", gap: 2 }}>
        {ACCOUNT.allocation.map((a, i) => {
          const start = acc;
          acc += a.pct;
          const t = clamp01((alloc * 100 - start) / a.pct);
          return (
            <div key={a.sym} style={{ width: `calc(${a.pct}% - ${i < 4 ? 2 : 0}px)`, height: "100%", position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${t * 100}%`, background: ALLOC_FILL[a.sym] }} />
            </div>
          );
        })}
      </Abs>
      {capMark && <Abs x={CAP_MARK.x - 1.25} y={BAR.y - 7} w={2.5} h={BAR.h + 14} style={{ background: C.lime, borderRadius: 2 }} />}
      <Abs x={37} y={250} w={338} style={{ display: "flex", gap: 10, opacity: clamp01(alloc * 1.5 - 0.3) }}>
        {ACCOUNT.allocation.map((a) => (
          <div key={a.sym} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: ALLOC_FILL[a.sym] }} />
            <T v="dataSm" tone="secondary">
              {a.sym} {a.pct}
            </T>
          </div>
        ))}
      </Abs>

      {/* Connected venues */}
      <Abs x={21} y={302}>
        <Serif size={25}>Connected</Serif>
      </Abs>
      <Abs x={0} y={312} w={391} style={{ display: "flex", justifyContent: "flex-end" }}>
        <T v="label" tone="muted">
          Exchanges are read-only
        </T>
      </Abs>
      {VENUE_ROW_Y.map((y, i) =>
        i < venues && !(hideRow?.(i) ?? false) ? (
          <Abs key={i} x={21} y={y}>
            <VenueRow index={i} />
          </Abs>
        ) : (
          <Abs key={i} x={21} y={y} w={370} h={VENUE_ROW_H} style={{ border: `1px dashed ${C.border}`, borderRadius: radius.card, boxSizing: "border-box", opacity: 0.6 }} />
        ),
      )}

      {/* Capital health — liquidation headroom */}
      <RiskCard t={risk} />

      <TabBar active={1} />
    </>
  );
};

export const RiskCard: React.FC<{ t: number }> = ({ t }) => {
  const lo = 70;
  const hi = 100;
  const px = (v: number) => ((v - lo) / (hi - lo)) * 338;
  const liqX = px(ACCOUNT.perp.liq);
  const markX = px(ACCOUNT.perp.mark);
  const span = (markX - liqX) * clamp01(t);
  return (
    <Abs x={RISK_CARD.x} y={RISK_CARD.y} w={RISK_CARD.w} h={RISK_CARD.h} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: radius.panel, boxSizing: "border-box" }}>
      <Abs x={16} y={12}>
        <T v="eyebrow" tone="muted">
          Capital health
        </T>
      </Abs>
      <Abs x={16} y={30} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 16, color: C.ivory }}>{ACCOUNT.perp.market}</div>
        <Chip>{ACCOUNT.perp.side}</Chip>
      </Abs>
      <Abs x={0} y={28} w={354} style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 5 }}>
        <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 21, color: C.citron }}>{ACCOUNT.perp.headroomPct}%</div>
        <T v="label" tone="secondary">
          to liquidation
        </T>
      </Abs>
      {/* Gauge: price from $70 to $100; the span between liquidation and mark is the headroom. */}
      <Abs x={16} y={66} w={338} h={6} style={{ background: C.hover, borderRadius: 3 }} />
      <Abs x={16 + markX - span} y={66} w={span} h={6} style={{ background: C.citron, opacity: 0.85, borderRadius: 3 }} />
      <Abs x={16 + liqX - 1} y={60} w={2.5} h={18} style={{ background: C.clay, borderRadius: 2 }} />
      <Abs x={16 + markX - 1} y={60} w={2.5} h={18} style={{ background: C.ivory, borderRadius: 2 }} />
      <Abs x={16 + liqX - 30} y={84}>
        <T v="dataSm" tone="negative">
          Liq. $77.30
        </T>
      </Abs>
      <Abs x={16 + markX - 52} y={84}>
        <T v="dataSm" tone="secondary">
          Mark $94.20
        </T>
      </Abs>
    </Abs>
  );
};
