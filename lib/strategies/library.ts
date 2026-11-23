import { msg } from "@/lib/i18n/translate";
import type { StrategyDesign } from "@/lib/strategies/spec";

/* ---------------------------------------------------------------------------
   Elyra's strategy library: well-known, rule-based approaches written out
   as designs, each with the idea behind it and the way it tends to fail.
   Pure, and held to `validateDesign` by its tests.

   Nothing here claims a return. Each is a starting point the person tests
   on real data in the designer — on their market, timeframe and period —
   and changes. The same rules on another market or period can lose; the
   "watch out" line says how.

   Every one is long-only, like the backtest it runs in, and every one has
   a stop, so no design here can hold a loser without limit.
--------------------------------------------------------------------------- */

export interface LibraryStrategy {
  id: string;
  /** Translated where shown. */
  style: string;
  idea: string;
  watchOut: string;
  design: StrategyDesign;
}

const close = { kind: "price", field: "close" } as const;

export const LIBRARY: readonly LibraryStrategy[] = [
  {
    id: "golden-cross",
    style: msg("Trend"),
    idea: msg("Own the market only while its 50-day average is above its 200-day average: the slow, classic definition of an uptrend."),
    watchOut: msg("Late in and late out. In a sideways market the averages cross back and forth and every crossing costs fees."),
    design: {
      version: 1,
      name: msg("Golden cross trend"),
      summary: "Own the market only while its 50-day average is above its 200-day average.",
      timeframe: "1d",
      entry: { match: "all", conditions: [{ left: { kind: "sma", period: 50 }, op: "crosses_above", right: { kind: "sma", period: 200 } }] },
      exit: { match: "all", conditions: [{ left: { kind: "sma", period: 50 }, op: "crosses_below", right: { kind: "sma", period: 200 } }] },
      risk: { stopLossPct: 15, takeProfitPct: null, maxBarsHeld: null },
    },
  },
  {
    id: "rsi2-pullback",
    style: msg("Mean reversion in a trend"),
    idea: msg("Buy a sharp two-day pullback while the market is above its 200-day average, and sell on the first bounce above the 5-day average."),
    watchOut: msg("Many small wins and an occasional large loss when a pullback keeps falling — the stop and the 10-bar limit are what cap it."),
    design: {
      version: 1,
      name: msg("RSI(2) pullback in an uptrend"),
      summary: "Buy a sharp pullback while above the 200-day average; sell on the first bounce above the 5-day average.",
      timeframe: "1d",
      entry: {
        match: "all",
        conditions: [
          { left: close, op: "above", right: { kind: "sma", period: 200 } },
          { left: { kind: "rsi", period: 2 }, op: "below", right: { kind: "number", value: 10 } },
        ],
      },
      exit: { match: "all", conditions: [{ left: close, op: "crosses_above", right: { kind: "sma", period: 5 } }] },
      risk: { stopLossPct: 10, takeProfitPct: null, maxBarsHeld: 10 },
    },
  },
  {
    id: "donchian-breakout",
    style: msg("Breakout"),
    idea: msg("Buy when the close breaks the highest high of the last 20 bars; sell when it breaks the lowest low of the last 10."),
    watchOut: msg("Most breakouts fail and are stopped out; the strategy lives on the few that become long trends."),
    design: {
      version: 1,
      name: msg("Donchian channel breakout"),
      summary: "Buy a close above the 20-bar high; sell a close below the 10-bar low.",
      timeframe: "1d",
      entry: { match: "all", conditions: [{ left: close, op: "crosses_above", right: { kind: "donchian", period: 20, band: "upper" } }] },
      exit: { match: "all", conditions: [{ left: close, op: "crosses_below", right: { kind: "donchian", period: 10, band: "lower" } }] },
      risk: { stopLossPct: 12, takeProfitPct: null, maxBarsHeld: null },
    },
  },
  {
    id: "macd-trend-filter",
    style: msg("Momentum"),
    idea: msg("Take MACD's bullish crossings only above the 200-bar EMA, so momentum is bought in the direction of the larger trend."),
    watchOut: msg("Crossings are frequent on 4-hour bars; in a choppy trend the fees add up."),
    design: {
      version: 1,
      name: msg("MACD momentum with a trend filter"),
      summary: "MACD's bullish crossings, taken only above the 200-bar EMA.",
      timeframe: "4h",
      entry: {
        match: "all",
        conditions: [
          { left: { kind: "macd", fast: 12, slow: 26, signal: 9, line: "macd" }, op: "crosses_above", right: { kind: "macd", fast: 12, slow: 26, signal: 9, line: "signal" } },
          { left: close, op: "above", right: { kind: "ema", period: 200 } },
        ],
      },
      exit: {
        match: "all",
        conditions: [{ left: { kind: "macd", fast: 12, slow: 26, signal: 9, line: "macd" }, op: "crosses_below", right: { kind: "macd", fast: 12, slow: 26, signal: 9, line: "signal" } }],
      },
      risk: { stopLossPct: 6, takeProfitPct: null, maxBarsHeld: null },
    },
  },
  {
    id: "bollinger-range",
    style: msg("Mean reversion"),
    idea: msg("In a range, buy a close below the lower Bollinger band while RSI is weak, and sell back at the middle band."),
    watchOut: msg("Built for ranges. When a real downtrend starts, every lower band is broken again; the stop and time limit decide the damage."),
    design: {
      version: 1,
      name: msg("Bollinger reversion in a range"),
      summary: "Buy a close below the lower band while RSI is weak; sell at the middle band.",
      timeframe: "1h",
      entry: {
        match: "all",
        conditions: [
          { left: close, op: "crosses_below", right: { kind: "bollinger", period: 20, deviations: 2, band: "lower" } },
          { left: { kind: "rsi", period: 14 }, op: "below", right: { kind: "number", value: 35 } },
        ],
      },
      exit: { match: "all", conditions: [{ left: close, op: "crosses_above", right: { kind: "bollinger", period: 20, deviations: 2, band: "middle" } }] },
      risk: { stopLossPct: 4, takeProfitPct: 6, maxBarsHeld: 48 },
    },
  },
  {
    id: "time-series-momentum",
    style: msg("Momentum"),
    idea: msg("Hold while the price is higher than 30 bars ago and above its 100-bar average; step aside when the 30-bar change turns negative."),
    watchOut: msg("Slow to react at turning points, and whipsawed when the price hovers around where it was 30 bars ago."),
    design: {
      version: 1,
      name: msg("Time-series momentum"),
      summary: "Hold while up over 30 bars and above the 100-bar average.",
      timeframe: "1d",
      entry: {
        match: "all",
        conditions: [
          { left: { kind: "change_pct", period: 30 }, op: "crosses_above", right: { kind: "number", value: 0 } },
          { left: close, op: "above", right: { kind: "sma", period: 100 } },
        ],
      },
      exit: { match: "all", conditions: [{ left: { kind: "change_pct", period: 30 }, op: "crosses_below", right: { kind: "number", value: 0 } }] },
      risk: { stopLossPct: 15, takeProfitPct: null, maxBarsHeld: null },
    },
  },
  {
    id: "volume-breakout",
    style: msg("Breakout"),
    idea: msg("Buy a break of the 20-bar high only when volume is above its 20-bar average — a breakout with participation — and trail it with the 20-bar EMA."),
    watchOut: msg("Volume is Binance's spot volume only; on a thin market, one large trade can fake it."),
    design: {
      version: 1,
      name: msg("Volume-confirmed breakout"),
      summary: "A break of the 20-bar high on above-average volume, trailed by the 20-bar EMA.",
      timeframe: "4h",
      entry: {
        match: "all",
        conditions: [
          { left: close, op: "crosses_above", right: { kind: "donchian", period: 20, band: "upper" } },
          { left: { kind: "volume" }, op: "above", right: { kind: "volume_sma", period: 20 } },
        ],
      },
      exit: { match: "all", conditions: [{ left: close, op: "crosses_below", right: { kind: "ema", period: 20 } }] },
      risk: { stopLossPct: 7, takeProfitPct: null, maxBarsHeld: null },
    },
  },
  {
    id: "calm-trend",
    style: msg("Trend"),
    idea: msg("Join a new uptrend — the 20-bar EMA crossing above the 50-bar — only while volatility is calm, with a fixed target and stop."),
    watchOut: msg("Calm markets can stay calm and go nowhere; the target caps the big trends this would otherwise ride."),
    design: {
      version: 1,
      name: msg("Calm-market trend entry"),
      summary: "EMA 20 over EMA 50 while the daily range is calm, with a fixed target.",
      timeframe: "1d",
      entry: {
        match: "all",
        conditions: [
          { left: { kind: "ema", period: 20 }, op: "crosses_above", right: { kind: "ema", period: 50 } },
          { left: { kind: "atr_pct", period: 14 }, op: "below", right: { kind: "number", value: 5 } },
        ],
      },
      exit: { match: "all", conditions: [{ left: { kind: "ema", period: 20 }, op: "crosses_below", right: { kind: "ema", period: 50 } }] },
      risk: { stopLossPct: 10, takeProfitPct: 30, maxBarsHeld: null },
    },
  },
  {
    id: "deep-dip",
    style: msg("Mean reversion"),
    idea: msg("Buy only a deep, fast drop — 12% in 10 bars with RSI oversold — and sell the relief bounce or cut it quickly."),
    watchOut: msg("Catching a falling market: the rare crash that keeps going takes the full stop, so size it small."),
    design: {
      version: 1,
      name: msg("Deep dip buyer"),
      summary: "A 12% drop in 10 bars with RSI oversold; sell the bounce.",
      timeframe: "4h",
      entry: {
        match: "all",
        conditions: [
          { left: { kind: "change_pct", period: 10 }, op: "below", right: { kind: "number", value: -12 } },
          { left: { kind: "rsi", period: 14 }, op: "below", right: { kind: "number", value: 30 } },
        ],
      },
      exit: { match: "all", conditions: [{ left: { kind: "rsi", period: 14 }, op: "crosses_above", right: { kind: "number", value: 55 } }] },
      risk: { stopLossPct: 8, takeProfitPct: 12, maxBarsHeld: 30 },
    },
  },
];

export function libraryStrategy(id: string): LibraryStrategy | null {
  return LIBRARY.find((entry) => entry.id === id) ?? null;
}
