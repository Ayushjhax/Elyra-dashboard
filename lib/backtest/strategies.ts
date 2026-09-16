import type { Candle } from "@/lib/backtest/candles";
import {
  absolutePriceOscillator,
  aroon,
  awesomeOscillator,
  balanceOfPower,
  bollinger,
  chaikinMoneyFlow,
  closes,
  crossedAbove,
  crossedBelow,
  easeOfMovement,
  ema,
  forceIndex,
  ichimoku,
  macd,
  moneyFlowIndex,
  negativeVolumeIndex,
  parabolicSar,
  rsi,
  sessionVwap,
  stochastic,
  typicalPrice,
  vortex,
  vwma,
  williamsR,
  type Series,
} from "@/lib/backtest/indicators";

/* ---------------------------------------------------------------------------
   Strategies.

   ── An indicator is not a strategy ─────────────────────────────────────

   "Backtest RSI" is not a testable statement: RSI is a number between 0 and
   100, and turning it into trades requires deciding what counts as an entry,
   what counts as an exit, and on which bar each is acted upon. Twenty
   indicator lines plotted on a chart is not twenty strategies.

   So each entry below carries an EXPLICIT rule, written out, plus the
   parameters it exposes and the warm-up it needs before its first valid
   signal. A result is only reproducible if the rule that produced it is
   written down, which is why every strategy is versioned.

   ── The signal contract ────────────────────────────────────────────────

   `evaluate` returns, for each bar, whether a long entry or exit is signalled
   USING DATA UP TO AND INCLUDING THAT BAR'S CLOSE. The engine then acts on
   the NEXT bar. Nothing in this file may read an index greater than `i`.
--------------------------------------------------------------------------- */

export type StrategyCategory =
  | "trend"
  | "momentum"
  | "mean_reversion"
  | "volume"
  | "volatility"
  | "price_volume";

export interface StrategyParameter {
  key: string;
  label: string;
  type: "number";
  default: number;
  min?: number;
  max?: number;
  step?: number;
  description: string;
}

/** What a strategy says at one bar. Both may be false; both true is an exit. */
export interface BarSignal {
  enterLong: boolean;
  exitLong: boolean;
  /** Written for the trade log, so a fill can be explained later. */
  reason: string | null;
}

export interface StrategyDefinition {
  id: string;
  version: number;
  name: string;
  category: StrategyCategory;
  /** The rule in words. Shown in the UI and the PDF; never paraphrased. */
  rules: { entry: string; exit: string };
  parameters: StrategyParameter[];
  /** Bars of history needed before the first valid signal. */
  warmupFor(params: Record<string, number>): number;
  /** True when the strategy needs volume. Rejected on venues without it. */
  requiresVolume: boolean;
  /** True when the strategy is meaningless on daily bars (session VWAP). */
  intradayOnly?: boolean;
  evaluate(candles: Candle[], params: Record<string, number>): BarSignal[];
}

const NONE: BarSignal = { enterLong: false, exitLong: false, reason: null };

function blank(length: number): BarSignal[] {
  return Array.from({ length }, () => ({ ...NONE }));
}

const p = (
  key: string,
  label: string,
  value: number,
  description: string,
  extra: Partial<StrategyParameter> = {},
): StrategyParameter => ({
  key,
  label,
  type: "number",
  default: value,
  description,
  ...extra,
});

/** Reads a parameter, falling back to the registered default. */
function arg(params: Record<string, number>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/* ---------------------------------------------------------------------------
   A helper for the many "cross a level, exit on the reverse" strategies
--------------------------------------------------------------------------- */

function crossRule(
  series: Series,
  entryLevel: Series | number,
  exitLevel: Series | number,
  entryReason: string,
  exitReason: string,
): BarSignal[] {
  const out = blank(series.length);
  for (let i = 1; i < series.length; i += 1) {
    if (crossedAbove(series, entryLevel, i)) {
      out[i] = { enterLong: true, exitLong: false, reason: entryReason };
    } else if (crossedBelow(series, exitLevel, i)) {
      out[i] = { enterLong: false, exitLong: true, reason: exitReason };
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
   The registry
--------------------------------------------------------------------------- */

export const STRATEGIES: StrategyDefinition[] = [
  /* --- Mean reversion --------------------------------------------------- */
  {
    id: "BOLLINGER_MEAN_REVERSION_V1",
    version: 1,
    name: "Bollinger Bands — mean reversion",
    category: "mean_reversion",
    rules: {
      entry:
        "Price closes below the lower band, then closes back above it. The " +
        "re-entry is the signal, not the initial breach — a price outside the " +
        "band can stay outside for a long time.",
      exit: "Close crosses above the middle band (the 20-period SMA).",
    },
    parameters: [
      p("period", "Period", 20, "SMA length for the middle band.", { min: 2, max: 200 }),
      p("multiplier", "Std deviations", 2, "Band width.", { min: 0.5, max: 5, step: 0.1 }),
    ],
    warmupFor: (params) => arg(params, "period", 20) + 2,
    requiresVolume: false,
    evaluate(candles, params) {
      const price = closes(candles);
      const bands = bollinger(price, arg(params, "period", 20), arg(params, "multiplier", 2));
      const out = blank(candles.length);

      /* Tracks whether price has been below the band, so the entry fires on
         the RETURN rather than on the breach. */
      let breached = false;

      for (let i = 1; i < candles.length; i += 1) {
        const lower = bands.lower[i];
        const middle = bands.middle[i];
        if (lower === null || middle === null) continue;

        if (price[i] < lower) {
          breached = true;
          continue;
        }

        if (breached && price[i] > lower) {
          breached = false;
          out[i] = {
            enterLong: true,
            exitLong: false,
            reason: `Close ${price[i].toFixed(4)} reclaimed the lower band ${lower.toFixed(4)}`,
          };
          continue;
        }

        if (crossedAbove(price.map((v) => v) as Series, bands.middle, i)) {
          out[i] = {
            enterLong: false,
            exitLong: true,
            reason: `Close crossed above the middle band ${middle.toFixed(4)}`,
          };
        }
      }
      return out;
    },
  },

  {
    id: "BOLLINGER_BREAKOUT_V1",
    version: 1,
    name: "Bollinger Bands — breakout",
    category: "volatility",
    rules: {
      entry: "Close crosses above the upper band.",
      exit: "Close crosses below the middle band.",
    },
    parameters: [
      p("period", "Period", 20, "SMA length.", { min: 2, max: 200 }),
      p("multiplier", "Std deviations", 2, "Band width.", { min: 0.5, max: 5, step: 0.1 }),
    ],
    warmupFor: (params) => arg(params, "period", 20) + 2,
    requiresVolume: false,
    evaluate(candles, params) {
      const price = closes(candles) as Series;
      const bands = bollinger(closes(candles), arg(params, "period", 20), arg(params, "multiplier", 2));
      return crossRule(
        price,
        bands.upper,
        bands.middle,
        "Close crossed above the upper band",
        "Close crossed below the middle band",
      );
    },
  },

  {
    id: "RSI_12_MEAN_REVERSION_V1",
    version: 1,
    name: "RSI (12) — mean reversion",
    category: "mean_reversion",
    rules: {
      entry:
        "RSI crosses back ABOVE the oversold level. Entering while RSI is " +
        "still falling through oversold catches a knife; the cross back up is " +
        "the earliest confirmation the condition is resolving.",
      exit: "RSI crosses above the exit level (default 50, the midpoint).",
    },
    parameters: [
      p("period", "RSI period", 12, "Wilder smoothing length.", { min: 2, max: 100 }),
      p("oversold", "Oversold", 30, "Entry trigger level.", { min: 1, max: 49 }),
      p("exitLevel", "Exit level", 50, "Exit when RSI crosses above this.", { min: 2, max: 99 }),
    ],
    warmupFor: (params) => arg(params, "period", 12) * 3,
    requiresVolume: false,
    evaluate(candles, params) {
      const values = rsi(closes(candles), arg(params, "period", 12));
      const oversold = arg(params, "oversold", 30);
      const exitLevel = arg(params, "exitLevel", 50);
      const out = blank(candles.length);

      for (let i = 1; i < candles.length; i += 1) {
        if (crossedAbove(values, oversold, i)) {
          out[i] = {
            enterLong: true,
            exitLong: false,
            reason: `RSI crossed above ${oversold} (${values[i]?.toFixed(1)})`,
          };
        } else if (crossedAbove(values, exitLevel, i)) {
          out[i] = {
            enterLong: false,
            exitLong: true,
            reason: `RSI crossed above ${exitLevel} (${values[i]?.toFixed(1)})`,
          };
        }
      }
      return out;
    },
  },

  {
    id: "STOCHASTIC_CROSS_V1",
    version: 1,
    name: "Stochastic — oversold cross",
    category: "mean_reversion",
    rules: {
      entry: "%K crosses above %D while %K is at or below the oversold level.",
      exit: "%K crosses below %D while %K is at or above the overbought level.",
    },
    parameters: [
      p("period", "%K period", 14, "Lookback.", { min: 2, max: 100 }),
      p("smoothK", "%K smoothing", 3, "Slow %K smoothing.", { min: 1, max: 20 }),
      p("smoothD", "%D smoothing", 3, "Signal smoothing.", { min: 1, max: 20 }),
      p("oversold", "Oversold", 20, "Entry zone ceiling.", { min: 1, max: 49 }),
      p("overbought", "Overbought", 80, "Exit zone floor.", { min: 51, max: 99 }),
    ],
    warmupFor: (params) =>
      arg(params, "period", 14) + arg(params, "smoothK", 3) + arg(params, "smoothD", 3) + 2,
    requiresVolume: false,
    evaluate(candles, params) {
      const { k, d } = stochastic(
        candles,
        arg(params, "period", 14),
        arg(params, "smoothK", 3),
        arg(params, "smoothD", 3),
      );
      const oversold = arg(params, "oversold", 20);
      const overbought = arg(params, "overbought", 80);
      const out = blank(candles.length);

      for (let i = 1; i < candles.length; i += 1) {
        const kv = k[i];
        if (kv === null) continue;

        if (kv <= oversold && crossedAbove(k, d, i)) {
          out[i] = {
            enterLong: true,
            exitLong: false,
            reason: `%K crossed above %D in the oversold zone (${kv.toFixed(1)})`,
          };
        } else if (kv >= overbought && crossedBelow(k, d, i)) {
          out[i] = {
            enterLong: false,
            exitLong: true,
            reason: `%K crossed below %D in the overbought zone (${kv.toFixed(1)})`,
          };
        }
      }
      return out;
    },
  },

  {
    id: "WILLIAMS_R_REVERSION_V1",
    version: 1,
    name: "Williams %R — reversion",
    category: "mean_reversion",
    rules: {
      entry: "%R crosses back above the oversold level (default −80).",
      exit: "%R crosses above the exit level (default −50).",
    },
    parameters: [
      p("period", "Period", 14, "Lookback.", { min: 2, max: 100 }),
      p("oversold", "Oversold", -80, "Entry trigger.", { min: -99, max: -51 }),
      p("exitLevel", "Exit level", -50, "Exit trigger.", { min: -99, max: -1 }),
    ],
    warmupFor: (params) => arg(params, "period", 14) + 2,
    requiresVolume: false,
    evaluate(candles, params) {
      const values = williamsR(candles, arg(params, "period", 14));
      return crossRule(
        values,
        arg(params, "oversold", -80),
        arg(params, "exitLevel", -50),
        "%R crossed back above oversold",
        "%R crossed above the exit level",
      ).map((signal, i) => {
        /* The generic helper treats an upward cross of the exit level as an
           exit-by-crossing-below, which is wrong for a rising %R. Corrected
           here: both events are upward crosses, so the exit is detected
           separately. */
        if (crossedAbove(values, arg(params, "exitLevel", -50), i)) {
          return { enterLong: false, exitLong: true, reason: "%R crossed above the exit level" };
        }
        return signal;
      });
    },
  },

  /* --- Momentum --------------------------------------------------------- */
  {
    id: "MACD_CROSS_V1",
    version: 1,
    name: "MACD — signal cross",
    category: "momentum",
    rules: {
      entry: "MACD line crosses above the signal line.",
      exit: "MACD line crosses below the signal line.",
    },
    parameters: [
      p("fast", "Fast EMA", 12, "Fast length.", { min: 2, max: 100 }),
      p("slow", "Slow EMA", 26, "Slow length.", { min: 3, max: 200 }),
      p("signal", "Signal EMA", 9, "Signal length.", { min: 2, max: 50 }),
      p("requireAboveZero", "Require MACD > 0", 0, "1 to only enter above zero.", { min: 0, max: 1, step: 1 }),
    ],
    warmupFor: (params) => arg(params, "slow", 26) + arg(params, "signal", 9) + 5,
    requiresVolume: false,
    evaluate(candles, params) {
      const result = macd(
        closes(candles),
        arg(params, "fast", 12),
        arg(params, "slow", 26),
        arg(params, "signal", 9),
      );
      const requireAboveZero = arg(params, "requireAboveZero", 0) >= 1;
      const out = blank(candles.length);

      for (let i = 1; i < candles.length; i += 1) {
        if (crossedAbove(result.macd, result.signal, i)) {
          const value = result.macd[i];
          if (requireAboveZero && (value === null || value <= 0)) continue;
          out[i] = { enterLong: true, exitLong: false, reason: "MACD crossed above signal" };
        } else if (crossedBelow(result.macd, result.signal, i)) {
          out[i] = { enterLong: false, exitLong: true, reason: "MACD crossed below signal" };
        }
      }
      return out;
    },
  },

  {
    id: "AWESOME_OSCILLATOR_V1",
    version: 1,
    name: "Awesome Oscillator — zero cross",
    category: "momentum",
    rules: { entry: "AO crosses above zero.", exit: "AO crosses below zero." },
    parameters: [
      p("fast", "Fast SMA", 5, "Median-price fast length.", { min: 2, max: 50 }),
      p("slow", "Slow SMA", 34, "Median-price slow length.", { min: 3, max: 200 }),
    ],
    warmupFor: (params) => arg(params, "slow", 34) + 2,
    requiresVolume: false,
    evaluate(candles, params) {
      const values = awesomeOscillator(candles, arg(params, "fast", 5), arg(params, "slow", 34));
      return crossRule(values, 0, 0, "AO crossed above zero", "AO crossed below zero");
    },
  },

  {
    id: "APO_ZERO_CROSS_V1",
    version: 1,
    name: "Absolute Price Oscillator — zero cross",
    category: "momentum",
    rules: { entry: "APO crosses above zero.", exit: "APO crosses below zero." },
    parameters: [
      p("fast", "Fast EMA", 12, "Fast length.", { min: 2, max: 100 }),
      p("slow", "Slow EMA", 26, "Slow length.", { min: 3, max: 200 }),
    ],
    warmupFor: (params) => arg(params, "slow", 26) + 5,
    requiresVolume: false,
    evaluate(candles, params) {
      const values = absolutePriceOscillator(
        closes(candles),
        arg(params, "fast", 12),
        arg(params, "slow", 26),
      );
      return crossRule(values, 0, 0, "APO crossed above zero", "APO crossed below zero");
    },
  },

  {
    id: "BALANCE_OF_POWER_V1",
    version: 1,
    name: "Balance of Power — zero cross",
    category: "momentum",
    rules: {
      entry: "Smoothed BOP crosses above zero.",
      exit: "Smoothed BOP crosses below zero.",
    },
    parameters: [p("period", "Smoothing", 14, "SMA length.", { min: 1, max: 100 })],
    warmupFor: (params) => arg(params, "period", 14) + 2,
    requiresVolume: false,
    evaluate(candles, params) {
      const values = balanceOfPower(candles, arg(params, "period", 14));
      return crossRule(values, 0, 0, "BOP crossed above zero", "BOP crossed below zero");
    },
  },

  /* --- Trend ------------------------------------------------------------ */
  {
    id: "ICHIMOKU_CLOUD_V1",
    version: 1,
    name: "Ichimoku Cloud — Tenkan/Kijun above cloud",
    category: "trend",
    rules: {
      entry:
        "Tenkan crosses above Kijun while the close is above both cloud " +
        "spans. The cloud value at each bar was computed 26 bars earlier, so " +
        "no future data is read.",
      exit: "Tenkan crosses below Kijun, or the close falls below the cloud.",
    },
    parameters: [
      p("tenkan", "Tenkan", 9, "Conversion line.", { min: 2, max: 100 }),
      p("kijun", "Kijun", 26, "Base line.", { min: 2, max: 200 }),
      p("senkouB", "Senkou B", 52, "Leading span B.", { min: 2, max: 400 }),
      p("displacement", "Displacement", 26, "Cloud forward shift.", { min: 1, max: 100 }),
    ],
    warmupFor: (params) => arg(params, "senkouB", 52) + arg(params, "displacement", 26) + 5,
    requiresVolume: false,
    evaluate(candles, params) {
      const cloud = ichimoku(
        candles,
        arg(params, "tenkan", 9),
        arg(params, "kijun", 26),
        arg(params, "senkouB", 52),
        arg(params, "displacement", 26),
      );
      const price = closes(candles);
      const out = blank(candles.length);

      for (let i = 1; i < candles.length; i += 1) {
        const a = cloud.senkouA[i];
        const b = cloud.senkouB[i];
        if (a === null || b === null) continue;

        const aboveCloud = price[i] > Math.max(a, b);
        const belowCloud = price[i] < Math.min(a, b);

        if (aboveCloud && crossedAbove(cloud.tenkan, cloud.kijun, i)) {
          out[i] = {
            enterLong: true,
            exitLong: false,
            reason: "Tenkan crossed above Kijun with price above the cloud",
          };
        } else if (belowCloud || crossedBelow(cloud.tenkan, cloud.kijun, i)) {
          out[i] = {
            enterLong: false,
            exitLong: true,
            reason: belowCloud ? "Close fell below the cloud" : "Tenkan crossed below Kijun",
          };
        }
      }
      return out;
    },
  },

  {
    id: "PARABOLIC_SAR_V1",
    version: 1,
    name: "Parabolic SAR — trend flip",
    category: "trend",
    rules: {
      entry: "SAR flips bullish (price closes above the SAR after being below).",
      exit: "SAR flips bearish.",
    },
    parameters: [
      p("step", "Step", 0.02, "Acceleration increment.", { min: 0.001, max: 0.2, step: 0.001 }),
      p("max", "Max step", 0.2, "Acceleration ceiling.", { min: 0.01, max: 1, step: 0.01 }),
    ],
    warmupFor: () => 10,
    requiresVolume: false,
    evaluate(candles, params) {
      const { bullish } = parabolicSar(candles, arg(params, "step", 0.02), arg(params, "max", 0.2));
      const out = blank(candles.length);

      for (let i = 1; i < candles.length; i += 1) {
        const now = bullish[i];
        const before = bullish[i - 1];
        if (now === null || before === null) continue;

        if (now && !before) {
          out[i] = { enterLong: true, exitLong: false, reason: "SAR flipped bullish" };
        } else if (!now && before) {
          out[i] = { enterLong: false, exitLong: true, reason: "SAR flipped bearish" };
        }
      }
      return out;
    },
  },

  {
    id: "AROON_CROSS_V1",
    version: 1,
    name: "Aroon — trend cross",
    category: "trend",
    rules: {
      entry: "Aroon Up crosses above Aroon Down, with Up above the confirmation level and Down below it.",
      exit: "Aroon Down crosses above Aroon Up.",
    },
    parameters: [
      p("period", "Period", 25, "Lookback.", { min: 2, max: 200 }),
      p("upThreshold", "Up confirmation", 70, "Up must exceed this.", { min: 0, max: 100 }),
      p("downThreshold", "Down confirmation", 30, "Down must be below this.", { min: 0, max: 100 }),
    ],
    warmupFor: (params) => arg(params, "period", 25) + 2,
    requiresVolume: false,
    evaluate(candles, params) {
      const { up, down } = aroon(candles, arg(params, "period", 25));
      const upThreshold = arg(params, "upThreshold", 70);
      const downThreshold = arg(params, "downThreshold", 30);
      const out = blank(candles.length);

      for (let i = 1; i < candles.length; i += 1) {
        const u = up[i];
        const d = down[i];
        if (u === null || d === null) continue;

        if (crossedAbove(up, down, i) && u > upThreshold && d < downThreshold) {
          out[i] = {
            enterLong: true,
            exitLong: false,
            reason: `Aroon Up ${u.toFixed(0)} crossed above Down ${d.toFixed(0)}`,
          };
        } else if (crossedAbove(down, up, i)) {
          out[i] = { enterLong: false, exitLong: true, reason: "Aroon Down crossed above Up" };
        }
      }
      return out;
    },
  },

  {
    id: "VORTEX_CROSS_V1",
    version: 1,
    name: "Vortex — VI+ / VI− cross",
    category: "trend",
    rules: { entry: "VI+ crosses above VI−.", exit: "VI+ crosses below VI−." },
    parameters: [p("period", "Period", 14, "Lookback.", { min: 2, max: 100 })],
    warmupFor: (params) => arg(params, "period", 14) + 3,
    requiresVolume: false,
    evaluate(candles, params) {
      const { plus, minus } = vortex(candles, arg(params, "period", 14));
      return crossRule(plus, minus, minus, "VI+ crossed above VI−", "VI+ crossed below VI−");
    },
  },

  {
    id: "TYPICAL_PRICE_MA_CROSS_V1",
    version: 1,
    name: "Typical Price — EMA cross",
    category: "trend",
    rules: {
      entry: "Typical price (H+L+C)/3 crosses above its EMA.",
      exit: "Typical price crosses below its EMA.",
    },
    parameters: [p("period", "EMA period", 20, "EMA length.", { min: 2, max: 200 })],
    warmupFor: (params) => arg(params, "period", 20) * 2,
    requiresVolume: false,
    evaluate(candles, params) {
      const typical = typicalPrice(candles);
      const average = ema(typical, arg(params, "period", 20));
      return crossRule(
        typical as Series,
        average,
        average,
        "Typical price crossed above its EMA",
        "Typical price crossed below its EMA",
      );
    },
  },

  /* --- Volume and money flow -------------------------------------------- */
  {
    id: "CHAIKIN_MONEY_FLOW_V1",
    version: 1,
    name: "Chaikin Money Flow — zero cross",
    category: "volume",
    rules: {
      entry: "CMF crosses above the threshold (default 0).",
      exit: "CMF crosses below the negative threshold.",
    },
    parameters: [
      p("period", "Period", 20, "Lookback.", { min: 2, max: 100 }),
      p("threshold", "Threshold", 0, "Use 0.05 for a stricter filter.", { min: 0, max: 0.5, step: 0.01 }),
    ],
    warmupFor: (params) => arg(params, "period", 20) + 2,
    requiresVolume: true,
    evaluate(candles, params) {
      const values = chaikinMoneyFlow(candles, arg(params, "period", 20));
      const threshold = arg(params, "threshold", 0);
      return crossRule(
        values,
        threshold,
        -threshold,
        `CMF crossed above ${threshold}`,
        `CMF crossed below ${-threshold}`,
      );
    },
  },

  {
    id: "MFI_REVERSION_V1",
    version: 1,
    name: "Money Flow Index — reversion",
    category: "volume",
    rules: {
      entry: "MFI crosses back above the oversold level.",
      exit: "MFI crosses above the exit level.",
    },
    parameters: [
      p("period", "Period", 14, "Lookback.", { min: 2, max: 100 }),
      p("oversold", "Oversold", 20, "Entry trigger.", { min: 1, max: 49 }),
      p("exitLevel", "Exit level", 80, "Exit trigger.", { min: 51, max: 99 }),
    ],
    warmupFor: (params) => arg(params, "period", 14) + 3,
    requiresVolume: true,
    evaluate(candles, params) {
      const values = moneyFlowIndex(candles, arg(params, "period", 14));
      const oversold = arg(params, "oversold", 20);
      const exitLevel = arg(params, "exitLevel", 80);
      const out = blank(candles.length);

      for (let i = 1; i < candles.length; i += 1) {
        if (crossedAbove(values, oversold, i)) {
          out[i] = { enterLong: true, exitLong: false, reason: `MFI crossed above ${oversold}` };
        } else if (crossedAbove(values, exitLevel, i)) {
          out[i] = { enterLong: false, exitLong: true, reason: `MFI crossed above ${exitLevel}` };
        }
      }
      return out;
    },
  },

  {
    id: "FORCE_INDEX_V1",
    version: 1,
    name: "Force Index — zero cross",
    category: "volume",
    rules: {
      entry: "EMA-smoothed Force Index crosses above zero.",
      exit: "Smoothed Force Index crosses below zero.",
    },
    parameters: [p("period", "EMA smoothing", 13, "Smoothing length.", { min: 2, max: 100 })],
    warmupFor: (params) => arg(params, "period", 13) * 3,
    requiresVolume: true,
    evaluate(candles, params) {
      const values = forceIndex(candles, arg(params, "period", 13));
      return crossRule(values, 0, 0, "Force Index crossed above zero", "Force Index crossed below zero");
    },
  },

  {
    id: "EASE_OF_MOVEMENT_V1",
    version: 1,
    name: "Ease of Movement — zero cross",
    category: "volume",
    rules: {
      entry: "Smoothed EOM crosses above zero.",
      exit: "Smoothed EOM crosses below zero.",
    },
    parameters: [p("period", "Smoothing", 14, "SMA length.", { min: 2, max: 100 })],
    warmupFor: (params) => arg(params, "period", 14) + 3,
    requiresVolume: true,
    evaluate(candles, params) {
      const values = easeOfMovement(candles, arg(params, "period", 14));
      return crossRule(values, 0, 0, "EOM crossed above zero", "EOM crossed below zero");
    },
  },

  {
    id: "NVI_TREND_V1",
    version: 1,
    name: "Negative Volume Index — EMA trend",
    category: "volume",
    rules: {
      entry: "NVI crosses above its long EMA (default 255).",
      exit: "NVI crosses below its EMA.",
    },
    parameters: [p("period", "EMA period", 255, "Signal EMA length.", { min: 10, max: 500 })],
    /* NVI only moves on falling-volume bars, so a 255 EMA needs far more than
       255 bars of history before it means anything. */
    warmupFor: (params) => arg(params, "period", 255) * 2,
    requiresVolume: true,
    evaluate(candles, params) {
      const values = negativeVolumeIndex(candles);
      const dense = values.map((value) => value ?? 0);
      const signal = ema(dense, arg(params, "period", 255));
      return crossRule(values, signal, signal, "NVI crossed above its EMA", "NVI crossed below its EMA");
    },
  },

  /* --- Price/volume weighted -------------------------------------------- */
  {
    id: "SESSION_VWAP_RECLAIM_V1",
    version: 1,
    name: "Session VWAP — reclaim",
    category: "price_volume",
    rules: {
      entry: "Close crosses above the session VWAP, which resets each UTC day.",
      exit: "Close crosses below the session VWAP.",
    },
    parameters: [],
    warmupFor: () => 2,
    requiresVolume: true,
    /* A daily bar IS its own session, so session VWAP would equal the typical
       price and every cross would be noise. Rejected rather than computed. */
    intradayOnly: true,
    evaluate(candles) {
      const vwap = sessionVwap(candles);
      return crossRule(
        closes(candles) as Series,
        vwap,
        vwap,
        "Close reclaimed session VWAP",
        "Close lost session VWAP",
      );
    },
  },

  {
    id: "VWMA_CROSS_V1",
    version: 1,
    name: "VWMA — price cross",
    category: "price_volume",
    rules: {
      entry: "Close crosses above the volume-weighted moving average.",
      exit: "Close crosses below the VWMA.",
    },
    parameters: [p("period", "Period", 20, "VWMA length.", { min: 2, max: 200 })],
    warmupFor: (params) => arg(params, "period", 20) + 2,
    requiresVolume: true,
    evaluate(candles, params) {
      const average = vwma(candles, arg(params, "period", 20));
      return crossRule(
        closes(candles) as Series,
        average,
        average,
        "Close crossed above VWMA",
        "Close crossed below VWMA",
      );
    },
  },
];

const BY_ID = new Map(STRATEGIES.map((strategy) => [strategy.id, strategy]));

export function getStrategy(id: string): StrategyDefinition | null {
  return BY_ID.get(id) ?? null;
}

export function defaultParams(strategy: StrategyDefinition): Record<string, number> {
  return Object.fromEntries(
    strategy.parameters.map((parameter) => [parameter.key, parameter.default]),
  );
}

/* ---------------------------------------------------------------------------
   Aliases

   Kept separate from the registry so adding a nickname never touches a
   strategy's rules. People type indicator names from memory and phonetically,
   and a backtester that answers "unknown strategy" to "probablistic sar" is
   answering a spelling test rather than a question.
--------------------------------------------------------------------------- */

const ALIASES: Record<string, string> = {
  /* Bollinger */
  bollinger: "BOLLINGER_MEAN_REVERSION_V1",
  "bollinger bands": "BOLLINGER_MEAN_REVERSION_V1",
  bb: "BOLLINGER_MEAN_REVERSION_V1",
  bbands: "BOLLINGER_MEAN_REVERSION_V1",
  "bollinger breakout": "BOLLINGER_BREAKOUT_V1",

  /* RSI, including the spaced-digit form people type. */
  rsi: "RSI_12_MEAN_REVERSION_V1",
  "rsi 12": "RSI_12_MEAN_REVERSION_V1",
  "rs 12": "RSI_12_MEAN_REVERSION_V1",
  rs: "RSI_12_MEAN_REVERSION_V1",
  "relative strength index": "RSI_12_MEAN_REVERSION_V1",

  macd: "MACD_CROSS_V1",
  "moving average convergence divergence": "MACD_CROSS_V1",

  stochastic: "STOCHASTIC_CROSS_V1",
  "stochastic oscillator": "STOCHASTIC_CROSS_V1",
  stoch: "STOCHASTIC_CROSS_V1",

  /* Ichimoku — the most misspelled name in technical analysis. */
  ichimoku: "ICHIMOKU_CLOUD_V1",
  "ichimoku cloud": "ICHIMOKU_CLOUD_V1",
  ichimoke: "ICHIMOKU_CLOUD_V1",
  "ichimoke cloud": "ICHIMOKU_CLOUD_V1",
  lchimoke: "ICHIMOKU_CLOUD_V1",
  "lchimoke cloud": "ICHIMOKU_CLOUD_V1",
  "ichimoku kinko hyo": "ICHIMOKU_CLOUD_V1",

  "awesome oscillator": "AWESOME_OSCILLATOR_V1",
  ao: "AWESOME_OSCILLATOR_V1",
  awesome: "AWESOME_OSCILLATOR_V1",

  /* Parabolic SAR — "probabilistic" is the common mishearing. */
  "parabolic sar": "PARABOLIC_SAR_V1",
  psar: "PARABOLIC_SAR_V1",
  sar: "PARABOLIC_SAR_V1",
  "probablistic sar": "PARABOLIC_SAR_V1",
  "probabilistic sar": "PARABOLIC_SAR_V1",
  "parabolic stop and reverse": "PARABOLIC_SAR_V1",

  "williams %r": "WILLIAMS_R_REVERSION_V1",
  "williams r": "WILLIAMS_R_REVERSION_V1",
  williams: "WILLIAMS_R_REVERSION_V1",
  "%r": "WILLIAMS_R_REVERSION_V1",
  willr: "WILLIAMS_R_REVERSION_V1",

  aroon: "AROON_CROSS_V1",

  /* Chaikin — "chalkin" is the common misspelling. */
  "chaikin money flow": "CHAIKIN_MONEY_FLOW_V1",
  "chalkin money flow": "CHAIKIN_MONEY_FLOW_V1",
  cmf: "CHAIKIN_MONEY_FLOW_V1",
  chaikin: "CHAIKIN_MONEY_FLOW_V1",
  chalkin: "CHAIKIN_MONEY_FLOW_V1",

  mfi: "MFI_REVERSION_V1",
  "money flow index": "MFI_REVERSION_V1",
  "money flow": "MFI_REVERSION_V1",

  "force index": "FORCE_INDEX_V1",
  force: "FORCE_INDEX_V1",

  /* Ease of Movement — "momentum" for "movement" is the common slip. */
  "ease of movement": "EASE_OF_MOVEMENT_V1",
  "ease of momentum": "EASE_OF_MOVEMENT_V1",
  eom: "EASE_OF_MOVEMENT_V1",
  emv: "EASE_OF_MOVEMENT_V1",

  nvi: "NVI_TREND_V1",
  "negative volume index": "NVI_TREND_V1",

  vwap: "SESSION_VWAP_RECLAIM_V1",
  "session vwap": "SESSION_VWAP_RECLAIM_V1",
  "volume weighted average price": "SESSION_VWAP_RECLAIM_V1",

  vortex: "VORTEX_CROSS_V1",
  vi: "VORTEX_CROSS_V1",

  /* APO — "absolute price" alone is what people usually say. */
  apo: "APO_ZERO_CROSS_V1",
  "absolute price": "APO_ZERO_CROSS_V1",
  "absolute price oscillator": "APO_ZERO_CROSS_V1",

  bop: "BALANCE_OF_POWER_V1",
  "balance of power": "BALANCE_OF_POWER_V1",

  "typical price": "TYPICAL_PRICE_MA_CROSS_V1",
  tp: "TYPICAL_PRICE_MA_CROSS_V1",

  vwma: "VWMA_CROSS_V1",
  "volume weighted moving average": "VWMA_CROSS_V1",
};

/**
 * Alias matchers, longest key first so "bollinger breakout" is not swallowed
 * by "bollinger".
 *
 * The boundaries are lookarounds rather than `\b`. `\b` asserts a transition
 * between a word and a non-word character, so it can never match beside
 * punctuation: `\b%r\b` needs a letter or digit immediately before the `%`,
 * and in "backtest %r on sol" that position holds a space. The alias silently
 * never matched. Asserting the absence of an adjacent word character is what
 * "surrounded by whitespace or punctuation" actually means, and it is
 * identical to `\b` for every key that does begin and end with a word
 * character — which is all of them but one.
 */
const ALIAS_PATTERNS: ReadonlyArray<readonly [key: string, pattern: RegExp]> =
  Object.keys(ALIASES)
    .sort((a, b) => b.length - a.length)
    .map(
      (key) =>
        [
          key,
          new RegExp(
            `(?<![A-Za-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`,
          ),
        ] as const,
    );

export interface AliasMatch {
  strategy: StrategyDefinition;
  /** Parameters implied by the phrase, e.g. "rsi 12" → { period: 12 }. */
  params: Record<string, number>;
  /** Exactly what matched, for the run log. */
  matchedOn: string;
}

/**
 * Resolves a phrase to a strategy.
 *
 * Longest alias first, so "bollinger breakout" is not swallowed by
 * "bollinger". A trailing number is read as the primary period, which is how
 * people write it — "rsi 12", "aroon 25".
 */
export function resolveStrategy(phrase: string): AliasMatch | null {
  const cleaned = phrase
    .toLowerCase()
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) return null;

  /* An exact id, for machine callers. */
  const direct = BY_ID.get(phrase.trim().toUpperCase());
  if (direct !== undefined) {
    return { strategy: direct, params: {}, matchedOn: direct.id };
  }

  const numberMatch = /(\d+)\s*$/.exec(cleaned);
  const trailingNumber = numberMatch === null ? null : Number.parseInt(numberMatch[1], 10);
  const withoutNumber = numberMatch === null ? cleaned : cleaned.slice(0, numberMatch.index).trim();

  for (const [key, pattern] of ALIAS_PATTERNS) {
    const matches = cleaned === key || withoutNumber === key || pattern.test(cleaned);

    if (!matches) continue;

    const strategy = BY_ID.get(ALIASES[key]);
    if (strategy === undefined) continue;

    const params: Record<string, number> = {};
    if (trailingNumber !== null && trailingNumber > 1) {
      /* Applied to the first parameter, which is the period for every
         strategy that has one. */
      const primary = strategy.parameters[0];
      if (primary !== undefined && primary.key === "period") {
        params[primary.key] = trailingNumber;
      }
    }

    return { strategy, params, matchedOn: key };
  }

  return null;
}

export const STRATEGY_CATEGORIES: Array<{ id: StrategyCategory; label: string }> = [
  { id: "trend", label: "Trend" },
  { id: "momentum", label: "Momentum" },
  { id: "mean_reversion", label: "Mean Reversion" },
  { id: "volume", label: "Volume / Money Flow" },
  { id: "volatility", label: "Volatility" },
  { id: "price_volume", label: "Price / Volume Weighted" },
];
