import type { Candle } from "@/lib/backtest/candles";

/* ---------------------------------------------------------------------------
   Indicators.

   Implemented here rather than pulled from a dependency, because the whole
   value of a backtest rests on these being right and on knowing exactly which
   variant of each formula was used. "RSI" alone is ambiguous — Wilder's
   smoothing and a simple moving average of gains give visibly different
   values, and a library that picks one without saying so makes every result
   unreproducible.

   Each function documents its variant.

   ── The output contract ────────────────────────────────────────────────

   Every series returns an array the SAME LENGTH as its input, with `null` for
   every bar where the indicator is not yet defined. That is deliberate:
   returning a shorter array shifts every index, and an off-by-one in an
   indicator alignment is a lookahead bug that produces beautiful results.

   Pure — no I/O, no clock, no `server-only` — so all of it is testable.
--------------------------------------------------------------------------- */

export type Series = Array<number | null>;

/* ---------------------------------------------------------------------------
   Price transforms
--------------------------------------------------------------------------- */

export const closes = (candles: Candle[]): number[] => candles.map((c) => c.close);
export const highs = (candles: Candle[]): number[] => candles.map((c) => c.high);
export const lows = (candles: Candle[]): number[] => candles.map((c) => c.low);
export const volumes = (candles: Candle[]): number[] => candles.map((c) => c.volume);

/** (H + L + C) / 3. */
export const typicalPrice = (candles: Candle[]): number[] =>
  candles.map((c) => (c.high + c.low + c.close) / 3);

/** (H + L) / 2. Used by Awesome Oscillator and Ease of Movement. */
export const medianPrice = (candles: Candle[]): number[] =>
  candles.map((c) => (c.high + c.low) / 2);

/* ---------------------------------------------------------------------------
   Moving averages
--------------------------------------------------------------------------- */

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average.
 *
 * Seeded with the SMA of the first `period` values, which is the convention
 * charting platforms use. Seeding with the first value instead converges to
 * the same place but differs materially for the first few hundred bars — long
 * enough to change early trades in a backtest.
 */
export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i += 1) seed += values[i];

  let previous = seed / period;
  out[period - 1] = previous;

  for (let i = period; i < values.length; i += 1) {
    previous = values[i] * k + previous * (1 - k);
    out[i] = previous;
  }
  return out;
}

/**
 * Wilder's smoothing — the averaging RSI, ATR and DMI are defined with.
 *
 * Equivalent to an EMA of period `2n − 1`. Substituting a standard EMA gives
 * an RSI that is close but not equal, and "close" in a threshold-crossing
 * strategy means different trades.
 */
export function wilder(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += values[i];

  let previous = sum / period;
  out[period - 1] = previous;

  for (let i = period; i < values.length; i += 1) {
    previous = (previous * (period - 1) + values[i]) / period;
    out[i] = previous;
  }
  return out;
}

/** Volume-weighted moving average. */
export function vwma(candles: Candle[], period: number): Series {
  const out: Series = new Array(candles.length).fill(null);
  if (period <= 0) return out;

  for (let i = period - 1; i < candles.length; i += 1) {
    let pv = 0;
    let v = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      pv += candles[j].close * candles[j].volume;
      v += candles[j].volume;
    }
    /* Zero volume over the whole window makes the average undefined, not
       zero — a price of zero would trigger every downside rule at once. */
    out[i] = v === 0 ? null : pv / v;
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Bollinger Bands
--------------------------------------------------------------------------- */

export interface Bollinger {
  middle: Series;
  upper: Series;
  lower: Series;
}

/**
 * Bollinger Bands.
 *
 * POPULATION standard deviation over the window, which is what Bollinger
 * specified and what charting platforms draw. The sample estimator (n − 1)
 * gives slightly wider bands and therefore different touches.
 */
export function bollinger(values: number[], period = 20, multiplier = 2): Bollinger {
  const middle = sma(values, period);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i += 1) {
    const mean = middle[i];
    if (mean === null) continue;

    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      variance += (values[j] - mean) ** 2;
    }
    const sd = Math.sqrt(variance / period);

    upper[i] = mean + multiplier * sd;
    lower[i] = mean - multiplier * sd;
  }

  return { middle, upper, lower };
}

/* ---------------------------------------------------------------------------
   RSI
--------------------------------------------------------------------------- */

/** Wilder's RSI. Period 12 is this product's default, not the usual 14. */
export function rsi(values: number[], period = 12): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  const gains: number[] = [0];
  const losses: number[] = [0];

  for (let i = 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    gains.push(Math.max(0, change));
    losses.push(Math.max(0, -change));
  }

  /* The first change is at index 1, so smoothing starts there. */
  const avgGain = wilder(gains.slice(1), period);
  const avgLoss = wilder(losses.slice(1), period);

  for (let i = 0; i < avgGain.length; i += 1) {
    const gain = avgGain[i];
    const loss = avgLoss[i];
    if (gain === null || loss === null) continue;

    /* No losses in the window: RSI is 100 by definition, not a division by
       zero. */
    out[i + 1] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }

  return out;
}

/* ---------------------------------------------------------------------------
   MACD
--------------------------------------------------------------------------- */

export interface Macd {
  macd: Series;
  signal: Series;
  histogram: Series;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): Macd {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);

  const line: Series = values.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    return f === null || s === null ? null : f - s;
  });

  /* The signal line is an EMA OF THE MACD LINE, so it can only start once the
     MACD line exists. Feeding nulls as zeros would drag it toward zero for
     the first `slow` bars and produce phantom early crosses. */
  const firstDefined = line.findIndex((value) => value !== null);
  const signal: Series = new Array(values.length).fill(null);

  if (firstDefined !== -1) {
    const dense = line.slice(firstDefined).map((value) => value ?? 0);
    const signalDense = ema(dense, signalPeriod);
    for (let i = 0; i < signalDense.length; i += 1) {
      signal[firstDefined + i] = signalDense[i];
    }
  }

  const histogram: Series = values.map((_, i) => {
    const m = line[i];
    const s = signal[i];
    return m === null || s === null ? null : m - s;
  });

  return { macd: line, signal, histogram };
}

/* ---------------------------------------------------------------------------
   Stochastic
--------------------------------------------------------------------------- */

export interface Stochastic {
  k: Series;
  d: Series;
}

/** Slow stochastic: raw %K smoothed by `smoothK`, then %D as an SMA of %K. */
export function stochastic(
  candles: Candle[],
  period = 14,
  smoothK = 3,
  smoothD = 3,
): Stochastic {
  const raw: Series = new Array(candles.length).fill(null);

  for (let i = period - 1; i < candles.length; i += 1) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      highest = Math.max(highest, candles[j].high);
      lowest = Math.min(lowest, candles[j].low);
    }
    const range = highest - lowest;
    /* A flat window has no position within a range. 50 would assert the
       midpoint; null says it is undefined. */
    raw[i] = range === 0 ? null : ((candles[i].close - lowest) / range) * 100;
  }

  const k = smoothSeries(raw, smoothK);
  const d = smoothSeries(k, smoothD);
  return { k, d };
}

/** SMA over a series that may contain nulls, preserving alignment. */
function smoothSeries(series: Series, period: number): Series {
  const out: Series = new Array(series.length).fill(null);
  if (period <= 1) return [...series];

  for (let i = period - 1; i < series.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      const value = series[j];
      if (value === null) {
        count = -1;
        break;
      }
      sum += value;
      count += 1;
    }
    /* Any null in the window makes the average undefined rather than an
       average of fewer bars, which would silently change the period. */
    if (count === period) out[i] = sum / period;
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Ichimoku
--------------------------------------------------------------------------- */

export interface Ichimoku {
  tenkan: Series;
  kijun: Series;
  /** Displaced FORWARD by `displacement`. */
  senkouA: Series;
  senkouB: Series;
}

/** The midpoint of the highest high and lowest low over `period`. */
function donchianMid(candles: Candle[], period: number): Series {
  const out: Series = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i += 1) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      highest = Math.max(highest, candles[j].high);
      lowest = Math.min(lowest, candles[j].low);
    }
    out[i] = (highest + lowest) / 2;
  }
  return out;
}

/**
 * Ichimoku Cloud.
 *
 * ── The displacement, which is where every implementation goes wrong ────
 *
 * Senkou A and B are plotted `displacement` bars INTO THE FUTURE. On a chart
 * that means the cloud ahead of price is computed from data up to today.
 *
 * The consequence for a backtest is the opposite of what it looks like: the
 * cloud VALUE AT BAR i was computed from data at bar `i − displacement`. So
 * reading `senkouA[i]` is reading old data, which is correct and safe.
 *
 * The bug is writing the value at index `i` instead of `i + displacement` —
 * that hands the strategy a cloud built from bars it has not seen yet, and
 * the resulting equity curve looks extraordinary.
 *
 * Chikou (the lagging span) is deliberately NOT returned. It is today's close
 * plotted 26 bars back, and every "price above Chikou" rule reduces to
 * comparing a past bar with a future one.
 */
export function ichimoku(
  candles: Candle[],
  tenkanPeriod = 9,
  kijunPeriod = 26,
  senkouBPeriod = 52,
  displacement = 26,
): Ichimoku {
  const tenkan = donchianMid(candles, tenkanPeriod);
  const kijun = donchianMid(candles, kijunPeriod);
  const senkouBRaw = donchianMid(candles, senkouBPeriod);

  const senkouA: Series = new Array(candles.length).fill(null);
  const senkouB: Series = new Array(candles.length).fill(null);

  for (let i = 0; i < candles.length; i += 1) {
    const target = i + displacement;
    if (target >= candles.length) continue;

    const t = tenkan[i];
    const k = kijun[i];
    if (t !== null && k !== null) senkouA[target] = (t + k) / 2;

    const b = senkouBRaw[i];
    if (b !== null) senkouB[target] = b;
  }

  return { tenkan, kijun, senkouA, senkouB };
}

/* ---------------------------------------------------------------------------
   Awesome Oscillator
--------------------------------------------------------------------------- */

export function awesomeOscillator(candles: Candle[], fast = 5, slow = 34): Series {
  const median = medianPrice(candles);
  const fastMa = sma(median, fast);
  const slowMa = sma(median, slow);

  return candles.map((_, i) => {
    const f = fastMa[i];
    const s = slowMa[i];
    return f === null || s === null ? null : f - s;
  });
}

/* ---------------------------------------------------------------------------
   Parabolic SAR
--------------------------------------------------------------------------- */

export interface ParabolicSar {
  sar: Series;
  /** True while the trend is long. */
  bullish: Array<boolean | null>;
}

/**
 * Parabolic SAR.
 *
 * Wilder's algorithm, including the rule that the SAR may not penetrate the
 * previous two bars' extremes. Each bar's SAR is computed from bars strictly
 * before it, so the value at bar i is knowable at bar i's open — which is what
 * makes it usable without intrabar clairvoyance.
 */
export function parabolicSar(candles: Candle[], step = 0.02, max = 0.2): ParabolicSar {
  const sar: Series = new Array(candles.length).fill(null);
  const bullish: Array<boolean | null> = new Array(candles.length).fill(null);

  if (candles.length < 2) return { sar, bullish };

  /* Direction is seeded from the first two bars. Any seed converges within a
     few bars; this one is deterministic. */
  let isLong = candles[1].close >= candles[0].close;
  let acceleration = step;
  let extreme = isLong ? candles[0].high : candles[0].low;
  let current = isLong ? candles[0].low : candles[0].high;

  sar[1] = current;
  bullish[1] = isLong;

  for (let i = 2; i < candles.length; i += 1) {
    let next = current + acceleration * (extreme - current);

    if (isLong) {
      /* The SAR may not rise above either of the last two lows. */
      next = Math.min(next, candles[i - 1].low, candles[i - 2].low);

      if (candles[i].low < next) {
        isLong = false;
        next = extreme;
        extreme = candles[i].low;
        acceleration = step;
      } else if (candles[i].high > extreme) {
        extreme = candles[i].high;
        acceleration = Math.min(max, acceleration + step);
      }
    } else {
      next = Math.max(next, candles[i - 1].high, candles[i - 2].high);

      if (candles[i].high > next) {
        isLong = true;
        next = extreme;
        extreme = candles[i].high;
        acceleration = step;
      } else if (candles[i].low < extreme) {
        extreme = candles[i].low;
        acceleration = Math.min(max, acceleration + step);
      }
    }

    current = next;
    sar[i] = next;
    bullish[i] = isLong;
  }

  return { sar, bullish };
}

/* ---------------------------------------------------------------------------
   Williams %R
--------------------------------------------------------------------------- */

/** Ranges from −100 (at the low) to 0 (at the high). */
export function williamsR(candles: Candle[], period = 14): Series {
  const out: Series = new Array(candles.length).fill(null);

  for (let i = period - 1; i < candles.length; i += 1) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      highest = Math.max(highest, candles[j].high);
      lowest = Math.min(lowest, candles[j].low);
    }
    const range = highest - lowest;
    out[i] = range === 0 ? null : ((highest - candles[i].close) / range) * -100;
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Aroon
--------------------------------------------------------------------------- */

export interface Aroon {
  up: Series;
  down: Series;
}

/**
 * Aroon.
 *
 * Measured over `period + 1` bars, which is the standard definition: "bars
 * since the highest high" needs `period` bars of history plus the current one,
 * so a fresh high gives exactly 100.
 */
export function aroon(candles: Candle[], period = 25): Aroon {
  const up: Series = new Array(candles.length).fill(null);
  const down: Series = new Array(candles.length).fill(null);

  for (let i = period; i < candles.length; i += 1) {
    let highIndex = i - period;
    let lowIndex = i - period;

    for (let j = i - period; j <= i; j += 1) {
      if (candles[j].high >= candles[highIndex].high) highIndex = j;
      if (candles[j].low <= candles[lowIndex].low) lowIndex = j;
    }

    up[i] = ((period - (i - highIndex)) / period) * 100;
    down[i] = ((period - (i - lowIndex)) / period) * 100;
  }

  return { up, down };
}

/* ---------------------------------------------------------------------------
   Volume and money flow
--------------------------------------------------------------------------- */

/** Chaikin Money Flow. Ranges −1 to +1. */
export function chaikinMoneyFlow(candles: Candle[], period = 20): Series {
  const out: Series = new Array(candles.length).fill(null);

  const mfv = candles.map((c) => {
    const range = c.high - c.low;
    /* A bar with no range has no money-flow position within it. Treating it
       as zero flow is the conventional handling and is stated here. */
    if (range === 0) return 0;
    return (((c.close - c.low) - (c.high - c.close)) / range) * c.volume;
  });

  for (let i = period - 1; i < candles.length; i += 1) {
    let flow = 0;
    let volume = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      flow += mfv[j];
      volume += candles[j].volume;
    }
    out[i] = volume === 0 ? null : flow / volume;
  }
  return out;
}

/** Money Flow Index — RSI computed on typical price × volume. */
export function moneyFlowIndex(candles: Candle[], period = 14): Series {
  const out: Series = new Array(candles.length).fill(null);
  const typical = typicalPrice(candles);

  for (let i = period; i < candles.length; i += 1) {
    let positive = 0;
    let negative = 0;

    for (let j = i - period + 1; j <= i; j += 1) {
      const flow = typical[j] * candles[j].volume;
      if (typical[j] > typical[j - 1]) positive += flow;
      else if (typical[j] < typical[j - 1]) negative += flow;
      /* An unchanged typical price counts to neither side. */
    }

    out[i] = negative === 0 ? 100 : 100 - 100 / (1 + positive / negative);
  }
  return out;
}

/** Elder's Force Index, EMA-smoothed. */
export function forceIndex(candles: Candle[], period = 13): Series {
  const raw: number[] = candles.map((c, i) =>
    i === 0 ? 0 : (c.close - candles[i - 1].close) * c.volume,
  );

  const smoothed = ema(raw.slice(1), period);
  const out: Series = new Array(candles.length).fill(null);
  for (let i = 0; i < smoothed.length; i += 1) out[i + 1] = smoothed[i];
  return out;
}

/**
 * Ease of Movement, SMA-smoothed.
 *
 * The box ratio divides volume by the bar's range, so a bar with zero range
 * or zero volume makes the value undefined rather than infinite.
 */
export function easeOfMovement(candles: Candle[], period = 14): Series {
  const raw: Series = new Array(candles.length).fill(null);

  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];

    const distance =
      (current.high + current.low) / 2 - (previous.high + previous.low) / 2;
    const range = current.high - current.low;

    if (range === 0 || current.volume === 0) {
      raw[i] = null;
      continue;
    }

    /* Volume is scaled so the result is a readable magnitude rather than a
       number in the billionths. The scale is conventional and constant, so it
       does not affect a zero-cross rule. */
    const boxRatio = current.volume / 100_000_000 / range;
    raw[i] = boxRatio === 0 ? null : distance / boxRatio;
  }

  return smoothSeries(raw, period);
}

/**
 * Negative Volume Index.
 *
 * Changes only on bars where volume FELL, on the theory that quiet days are
 * the informed ones. Starts at 1000 by convention.
 */
export function negativeVolumeIndex(candles: Candle[]): Series {
  const out: Series = new Array(candles.length).fill(null);
  if (candles.length === 0) return out;

  let nvi = 1000;
  out[0] = nvi;

  for (let i = 1; i < candles.length; i += 1) {
    const previous = candles[i - 1];
    if (candles[i].volume < previous.volume && previous.close !== 0) {
      nvi *= 1 + (candles[i].close - previous.close) / previous.close;
    }
    out[i] = nvi;
  }
  return out;
}

/* ---------------------------------------------------------------------------
   VWAP
--------------------------------------------------------------------------- */

/**
 * Session VWAP, reset at each UTC day boundary.
 *
 * Cumulative WITHIN a session and reset between them. A running VWAP that
 * never resets is a different indicator with different crossings, and after a
 * few weeks it barely moves — every "reclaim VWAP" rule then fires on noise.
 *
 * Crypto has no exchange session, so UTC midnight is the convention. It is
 * stated rather than assumed because a venue with a real session would need a
 * different boundary.
 */
export function sessionVwap(candles: Candle[]): Series {
  const out: Series = new Array(candles.length).fill(null);
  const typical = typicalPrice(candles);

  let day = "";
  let cumulativePv = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < candles.length; i += 1) {
    const current = new Date(candles[i].openTime).toISOString().slice(0, 10);
    if (current !== day) {
      day = current;
      cumulativePv = 0;
      cumulativeVolume = 0;
    }

    cumulativePv += typical[i] * candles[i].volume;
    cumulativeVolume += candles[i].volume;

    out[i] = cumulativeVolume === 0 ? null : cumulativePv / cumulativeVolume;
  }

  return out;
}

/* ---------------------------------------------------------------------------
   Vortex
--------------------------------------------------------------------------- */

export interface Vortex {
  plus: Series;
  minus: Series;
}

export function vortex(candles: Candle[], period = 14): Vortex {
  const plus: Series = new Array(candles.length).fill(null);
  const minus: Series = new Array(candles.length).fill(null);

  const vmPlus: number[] = [0];
  const vmMinus: number[] = [0];
  const trueRange: number[] = [0];

  for (let i = 1; i < candles.length; i += 1) {
    const c = candles[i];
    const p = candles[i - 1];

    vmPlus.push(Math.abs(c.high - p.low));
    vmMinus.push(Math.abs(c.low - p.high));
    trueRange.push(
      Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)),
    );
  }

  for (let i = period; i < candles.length; i += 1) {
    let sumPlus = 0;
    let sumMinus = 0;
    let sumTr = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      sumPlus += vmPlus[j];
      sumMinus += vmMinus[j];
      sumTr += trueRange[j];
    }
    if (sumTr === 0) continue;
    plus[i] = sumPlus / sumTr;
    minus[i] = sumMinus / sumTr;
  }

  return { plus, minus };
}

/* ---------------------------------------------------------------------------
   APO and Balance of Power
--------------------------------------------------------------------------- */

/** Absolute Price Oscillator: fast EMA minus slow EMA, in price units. */
export function absolutePriceOscillator(values: number[], fast = 12, slow = 26): Series {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  return values.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    return f === null || s === null ? null : f - s;
  });
}

/** Balance of Power: (close − open) / (high − low), optionally smoothed. */
export function balanceOfPower(candles: Candle[], period = 14): Series {
  const raw: Series = candles.map((c) => {
    const range = c.high - c.low;
    /* A bar with no range has no balance — null, not zero, which would read
       as perfectly balanced. */
    return range === 0 ? null : (c.close - c.open) / range;
  });

  return period <= 1 ? raw : smoothSeries(raw, period);
}

/* ---------------------------------------------------------------------------
   Crossings
--------------------------------------------------------------------------- */

/**
 * Whether `series` crossed above `reference` AT bar `i`.
 *
 * Requires both bars to be defined. A cross out of a null is not a cross — it
 * is the indicator becoming available, and treating it as a signal fires a
 * trade on every strategy at its warm-up boundary.
 */
export function crossedAbove(
  series: Series,
  reference: Series | number,
  i: number,
): boolean {
  if (i < 1) return false;

  const now = series[i];
  const before = series[i - 1];
  if (now === null || before === null) return false;

  const refNow = typeof reference === "number" ? reference : reference[i];
  const refBefore = typeof reference === "number" ? reference : reference[i - 1];
  if (refNow === null || refBefore === null) return false;

  return before <= refBefore && now > refNow;
}

export function crossedBelow(
  series: Series,
  reference: Series | number,
  i: number,
): boolean {
  if (i < 1) return false;

  const now = series[i];
  const before = series[i - 1];
  if (now === null || before === null) return false;

  const refNow = typeof reference === "number" ? reference : reference[i];
  const refBefore = typeof reference === "number" ? reference : reference[i - 1];
  if (refNow === null || refBefore === null) return false;

  return before >= refBefore && now < refNow;
}
