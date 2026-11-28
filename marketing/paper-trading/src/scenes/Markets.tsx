import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Kicker, Title } from "../components/Type";
import { prog } from "../lib/motion";
import { C, CJK, F, W } from "../theme";

/* ---------------------------------------------------------------------------
   One bar. The markets a paper order can trade: PERP_MARKETS in
   lib/autotrade/rules.ts — Hyperliquid's own perps (crypto, memecoins) and
   trade[XYZ]'s Nasdaq stock perps — 33 in all, listed by their tickers, in
   that file's order. The chips drop in column by column, then the whole
   field drifts so the frame never sits still.
--------------------------------------------------------------------------- */

const GROUPS: { label: string; markets: string[] }[] = [
  { label: "Crypto", markets: ["BTC", "ETH", "SOL", "HYPE", "BNB", "XRP", "AVAX", "LINK", "SUI"] },
  { label: "Memecoins", markets: ["DOGE", "kPEPE", "PUMP", "FARTCOIN", "TRUMP", "MEME", "GOAT", "WIF", "POPCAT", "kBONK", "PENGU", "SPX", "kSHIB"] },
  { label: "Nasdaq stocks", markets: ["XYZ100", "NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "GOOGL", "META", "AMD", "PLTR", "COIN"] },
];

const sans = `${F.sans}, ${CJK}`;

export const Markets: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const push = prog(f, dur - 7, dur, "in");
  const drift = prog(f, 0, dur, "lin");
  let n = 0;
  return (
    <AbsoluteFill style={{ transform: `translateX(${-push * 46}px) scale(${1 + push * 0.025})`, opacity: 1 - push * 0.25 }}>
      <Backdrop glowX={640} glowY={420} />
      <div style={{ position: "absolute", left: 72, top: 64, display: "flex", flexDirection: "column", gap: 12 }}>
        <Kicker f={f}>33 perp markets</Kicker>
        <Title f={f} at={2} text={"Crypto, memecoins *and Nasdaq stocks.*"} size={48} stagger={2} />
      </div>
      <div style={{ position: "absolute", left: 72, right: 72, top: 214, display: "flex", gap: 28, transform: `translateY(${-8 * drift}px)` }}>
        {GROUPS.map((group, gi) => (
          <div key={group.label} style={{ flex: group.markets.length > 10 ? 1.25 : 1, display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                fontFamily: sans,
                fontWeight: 600,
                fontSize: 14,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: C.muted,
                opacity: prog(f, 6 + gi * 8, 18 + gi * 8, "out"),
                display: "flex",
                justifyContent: "space-between",
                borderBottom: `1px solid ${C.border}`,
                paddingBottom: 8,
              }}
            >
              <span>{group.label}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: C.stone }}>{group.markets.length}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {group.markets.map((m) => {
                const at = 10 + n * 1.6;
                n += 1;
                const t = prog(f, at, at + 12, "land");
                return (
                  <div
                    key={m}
                    style={{
                      fontFamily: sans,
                      fontWeight: 600,
                      fontSize: 19,
                      color: C.ivory,
                      padding: "9px 14px",
                      borderRadius: 10,
                      background: C.raised,
                      border: `1px solid ${C.border}`,
                      opacity: t,
                      transform: `translateY(${(1 - t) * 18}px) scale(${0.92 + 0.08 * t})`,
                    }}
                  >
                    {m}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 72,
          width: W - 144,
          bottom: 52,
          fontFamily: sans,
          fontWeight: 500,
          fontSize: 17,
          color: C.muted,
          opacity: prog(f, 62, 76, "out"),
        }}
      >
        Every one at Hyperliquid's live price. Stock perps are trade[XYZ]'s, on Hyperliquid.
      </div>
    </AbsoluteFill>
  );
};
