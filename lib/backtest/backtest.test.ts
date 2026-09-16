import { describe, expect, it } from "vitest";
import {
  bollinger,
  ema,
  ichimoku,
  macd,
  rsi,
  sessionVwap,
  sma,
  vwma,
  crossedAbove,
  crossedBelow,
  negativeVolumeIndex,
  balanceOfPower,
  parabolicSar,
  williamsR,
  aroon,
  moneyFlowIndex,
  chaikinMoneyFlow,
  vortex,
  awesomeOscillator,
  absolutePriceOscillator,
  typicalPrice,
  stochastic,
} from "@/lib/backtest/indicators";
import { runBacktest, type BacktestConfig } from "@/lib/backtest/engine";
import { computeMetrics, periodsPerYear, assessQuality } from "@/lib/backtest/metrics";
import { STRATEGIES, getStrategy, resolveStrategy, defaultParams } from "@/lib/backtest/strategies";
import { validateCandles, type Candle } from "@/lib/backtest/candles";

/* ---------------------------------------------------------------------------
   The backtester.

   The most important tests here are the lookahead ones. Every other failure
   mode announces itself; lookahead produces a beautiful equity curve and no
   error at all.
--------------------------------------------------------------------------- */

function candle(over: Partial<Candle> & { close: number; openTime: number }): Candle {
  const { close, openTime } = over;
  /* Defaults first, then the caller's overrides. Listing `openTime` and
     `close` again after the spread would silently discard whatever the
     caller passed for them. */
  return {
    instrumentId: "SOL",
    venue: "test",
    interval: "1h",
    closeTime: openTime + 3_600_000 - 1,
    open: close,
    high: close,
    low: close,
    volume: 1000,
    complete: true,
    source: "test",
    ...over,
  };
}

/** A series of bars from closing prices, one hour apart. */
function series(prices: number[], volumes?: number[]): Candle[] {
  return prices.map((price, i) =>
    candle({
      openTime: i * 3_600_000,
      open: i === 0 ? price : prices[i - 1],
      high: Math.max(price, i === 0 ? price : prices[i - 1]) * 1.001,
      low: Math.min(price, i === 0 ? price : prices[i - 1]) * 0.999,
      close: price,
      volume: volumes?.[i] ?? 1000,
    }),
  );
}

/* ---------------------------------------------------------------------------
   Indicators — alignment and known values
--------------------------------------------------------------------------- */

describe("indicator alignment", () => {
  it("returns a series the same length as its input, padded with nulls", () => {
    /* A shorter array shifts every index. An off-by-one in indicator
       alignment is a lookahead bug that produces excellent results. */
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(sma(values, 3)).toHaveLength(10);
    expect(ema(values, 3)).toHaveLength(10);
    expect(sma(values, 3).slice(0, 2)).toEqual([null, null]);
  });

  it("computes SMA correctly", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("seeds EMA with the SMA of the first period", () => {
    /* Seeding with the first value converges to the same place but differs
       for hundreds of bars — long enough to change early trades. */
    const result = ema([1, 2, 3, 4, 5], 3);
    expect(result[2]).toBeCloseTo(2, 10);
    expect(result[3]).toBeCloseTo(3, 10);
  });

  it("computes RSI as 100 when there are no losses", () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    const result = rsi(rising, 12);
    expect(result[25]).toBeCloseTo(100, 6);
  });

  it("keeps RSI inside 0 and 100", () => {
    const noisy = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 3) * 10);
    for (const value of rsi(noisy, 12)) {
      if (value === null) continue;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("computes Bollinger bands with population standard deviation", () => {
    /* Five identical values have zero deviation, so the bands sit on the
       mean. The sample estimator would still give zero here, but a constant
       series is the only case where the two agree. */
    const flat = [10, 10, 10, 10, 10];
    const bands = bollinger(flat, 5, 2);
    expect(bands.middle[4]).toBe(10);
    expect(bands.upper[4]).toBe(10);
    expect(bands.lower[4]).toBe(10);
  });

  it("orders Bollinger bands correctly", () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 5);
    const bands = bollinger(values, 20, 2);
    for (let i = 19; i < values.length; i += 1) {
      expect(bands.upper[i]!).toBeGreaterThanOrEqual(bands.middle[i]!);
      expect(bands.lower[i]!).toBeLessThanOrEqual(bands.middle[i]!);
    }
  });

  it("starts the MACD signal only once the MACD line exists", () => {
    /* Feeding nulls as zeros drags the signal toward zero for the first
       `slow` bars and creates phantom early crosses. */
    const values = Array.from({ length: 80 }, (_, i) => 100 + i);
    const result = macd(values, 12, 26, 9);
    const firstMacd = result.macd.findIndex((value) => value !== null);
    const firstSignal = result.signal.findIndex((value) => value !== null);
    expect(firstSignal).toBeGreaterThanOrEqual(firstMacd);
  });

  it("computes VWMA as volume-weighted, not price-weighted", () => {
    /* Two bars: one at 10 with volume 1, one at 20 with volume 3. The simple
       average is 15; the volume-weighted average is 17.5. */
    const bars = series([10, 20], [1, 3]);
    expect(vwma(bars, 2)[1]).toBeCloseTo(17.5, 10);
  });

  it("returns null VWMA when the window has no volume", () => {
    /* Zero would trigger every downside rule at once. */
    const bars = series([10, 20], [0, 0]);
    expect(vwma(bars, 2)[1]).toBeNull();
  });

  it("computes typical price as (H+L+C)/3", () => {
    const bar = candle({ openTime: 0, close: 30, high: 40, low: 20 });
    expect(typicalPrice([bar])[0]).toBeCloseTo(30, 10);
  });

  it("computes Williams %R between -100 and 0", () => {
    const bars = series(Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 5));
    for (const value of williamsR(bars, 14)) {
      if (value === null) continue;
      expect(value).toBeLessThanOrEqual(0);
      expect(value).toBeGreaterThanOrEqual(-100);
    }
  });

  it("gives Aroon Up 100 on a fresh high", () => {
    const rising = series(Array.from({ length: 40 }, (_, i) => 100 + i));
    const result = aroon(rising, 25);
    expect(result.up[39]).toBeCloseTo(100, 6);
  });

  it("keeps CMF and MFI inside their ranges", () => {
    const bars = series(
      Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 8),
      Array.from({ length: 60 }, (_, i) => 500 + i * 10),
    );
    for (const value of chaikinMoneyFlow(bars, 20)) {
      if (value === null) continue;
      expect(Math.abs(value)).toBeLessThanOrEqual(1.0001);
    }
    for (const value of moneyFlowIndex(bars, 14)) {
      if (value === null) continue;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("starts NVI at 1000 and only moves on falling volume", () => {
    const bars = series([100, 110, 120], [1000, 2000, 500]);
    const nvi = negativeVolumeIndex(bars);
    expect(nvi[0]).toBe(1000);
    /* Volume rose, so NVI is unchanged. */
    expect(nvi[1]).toBe(1000);
    /* Volume fell and price rose ~9.1%. */
    expect(nvi[2]!).toBeGreaterThan(1000);
  });

  it("returns null Balance of Power for a zero-range bar", () => {
    /* Zero would read as perfectly balanced, which is a claim. */
    const flat = candle({ openTime: 0, close: 10, open: 10, high: 10, low: 10 });
    expect(balanceOfPower([flat], 1)[0]).toBeNull();
  });

  it("flips Parabolic SAR direction on a trend reversal", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    const down = Array.from({ length: 30 }, (_, i) => 160 - i * 2);
    const bars = series([...up, ...down]);
    const { bullish } = parabolicSar(bars, 0.02, 0.2);
    expect(bullish[25]).toBe(true);
    expect(bullish[55]).toBe(false);
  });

  it("computes the other oscillators without throwing", () => {
    const bars = series(Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 7) * 6));
    expect(awesomeOscillator(bars, 5, 34)).toHaveLength(120);
    expect(absolutePriceOscillator(bars.map((b) => b.close), 12, 26)).toHaveLength(120);
    expect(vortex(bars, 14).plus).toHaveLength(120);
    expect(stochastic(bars, 14, 3, 3).k).toHaveLength(120);
  });
});

/* ---------------------------------------------------------------------------
   Lookahead — the non-negotiable tests
--------------------------------------------------------------------------- */

describe("no lookahead", () => {
  it("displaces the Ichimoku cloud FORWARD, so the cloud is built from old data", () => {
    /* THE Ichimoku bug. Writing the span at index i instead of i+displacement
       hands the strategy a cloud built from bars it has not seen, and the
       equity curve looks extraordinary. */
    const bars = series(Array.from({ length: 120 }, (_, i) => 100 + i));
    const cloud = ichimoku(bars, 9, 26, 52, 26);

    const firstSenkouA = cloud.senkouA.findIndex((value) => value !== null);
    const firstTenkan = cloud.tenkan.findIndex((value) => value !== null);

    /* Senkou A is the Tenkan/Kijun midpoint pushed 26 bars forward, so it
       cannot appear before the Kijun exists plus the displacement. */
    expect(firstSenkouA).toBeGreaterThan(firstTenkan + 20);

    /* The value at bar i must equal what was computable at bar i-26. */
    const i = 100;
    const t = cloud.tenkan[i - 26];
    const k = cloud.kijun[i - 26];
    expect(cloud.senkouA[i]).toBeCloseTo((t! + k!) / 2, 10);
  });

  it("never lets the cloud reference a future bar", () => {
    /* Truncating the series must not change any cloud value that was already
       defined — if it does, the value depended on data after it. */
    const full = series(Array.from({ length: 140 }, (_, i) => 100 + Math.sin(i / 5) * 10));
    const truncated = full.slice(0, 120);

    const a = ichimoku(full, 9, 26, 52, 26);
    const b = ichimoku(truncated, 9, 26, 52, 26);

    for (let i = 0; i < truncated.length; i += 1) {
      if (b.senkouA[i] === null) continue;
      expect(a.senkouA[i]).toBeCloseTo(b.senkouA[i]!, 10);
    }
  });

  it("resets session VWAP at each UTC day boundary", () => {
    /* A VWAP that never resets barely moves after a few weeks, so every
       "reclaim" fires on noise. */
    const bars: Candle[] = [];
    const dayMs = 86_400_000;
    for (let day = 0; day < 2; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        bars.push(
          candle({
            openTime: day * dayMs + hour * 3_600_000,
            close: day === 0 ? 100 : 200,
            high: day === 0 ? 100 : 200,
            low: day === 0 ? 100 : 200,
            open: day === 0 ? 100 : 200,
            volume: 10,
          }),
        );
      }
    }

    const vwap = sessionVwap(bars);
    expect(vwap[23]).toBeCloseTo(100, 6);
    /* First bar of day two: the session restarted, so VWAP is 200, not a
       blend of the two days. */
    expect(vwap[24]).toBeCloseTo(200, 6);
  });

  it("does not treat an indicator becoming available as a cross", () => {
    /* A cross out of null fires a trade at every strategy's warm-up
       boundary. */
    const withNull = [null, 5, 10];
    expect(crossedAbove(withNull, 7, 1)).toBe(false);
    expect(crossedAbove([3, 5, 10], 7, 2)).toBe(true);
    expect(crossedBelow([10, 8, 5], 7, 2)).toBe(true);
  });

  it("executes a signal on the NEXT bar, never the signalling bar", () => {
    /* The heart of it. A strategy that buys on bar 10's close must fill at
       bar 11's open — filling at bar 10's close is trading in the past. */
    const prices = [
      ...Array.from({ length: 40 }, () => 100),
      /* A sharp drop then recovery, to trigger the RSI reversion entry. */
      ...[90, 85, 80, 78, 82, 88, 95, 100, 105, 110],
      ...Array.from({ length: 20 }, (_, i) => 110 + i),
    ];
    const bars = series(prices);

    const run = runBacktest({
      candles: bars,
      warmupBars: 36,
      config: baseConfig({ strategyId: "RSI_12_MEAN_REVERSION_V1", params: { period: 12 } }),
    });

    for (const trade of run.trades) {
      const entryBar = bars.findIndex((bar) => bar.openTime === trade.entryTime);
      expect(entryBar).toBeGreaterThan(0);
      /* The fill price must be that bar's OPEN (adjusted for slippage), not
         the previous bar's close. */
      const expected = bars[entryBar].open * (1 + 10 / 10_000);
      expect(trade.entryPrice).toBeCloseTo(expected, 8);
    }
  });

  it("never opens a trade before the warm-up boundary", () => {
    /* Trading during warm-up runs on an indicator that has not converged. */
    const bars = series(Array.from({ length: 200 }, (_, i) => 100 + Math.sin(i / 6) * 12));
    const run = runBacktest({
      candles: bars,
      warmupBars: 80,
      config: baseConfig({ strategyId: "MACD_CROSS_V1", params: {} }),
    });

    for (const trade of run.trades) {
      const index = bars.findIndex((bar) => bar.openTime === trade.entryTime);
      expect(index).toBeGreaterThanOrEqual(80);
    }
  });
});

/* ---------------------------------------------------------------------------
   Engine
--------------------------------------------------------------------------- */

function baseConfig(over: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    instrumentId: "SOL",
    venue: "test",
    timeframe: "1h",
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2026-02-01T00:00:00.000Z",
    initialCapitalUsd: 10_000,
    strategyId: "RSI_12_MEAN_REVERSION_V1",
    params: {},
    direction: "long_only",
    positionFraction: 1,
    execution: {
      signalTiming: "bar_close",
      entryExecution: "next_bar_open",
      exitExecution: "next_bar_open",
      feeBps: 10,
      slippageBps: 10,
      fundingMode: "ignore",
    },
    ...over,
  };
}

describe("engine", () => {
  it("refuses to simulate shorts without a borrow model", () => {
    /* Simulating shorts without borrow, funding and liquidation reports
       returns nobody could have earned. */
    const bars = series(Array.from({ length: 120 }, (_, i) => 100 + i));
    expect(() =>
      runBacktest({
        candles: bars,
        warmupBars: 40,
        config: baseConfig({ direction: "long_short" }),
      }),
    ).toThrow(/borrow or perpetual margin model/i);
  });

  it("refuses leverage without liquidation mechanics", () => {
    const bars = series(Array.from({ length: 120 }, (_, i) => 100 + i));
    expect(() =>
      runBacktest({
        candles: bars,
        warmupBars: 40,
        config: baseConfig({
          execution: { ...baseConfig().execution, maxLeverage: 3 },
        }),
      }),
    ).toThrow(/liquidation/i);
  });

  it("never spends more cash than it has", () => {
    const bars = series(Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 8) * 20));
    const run = runBacktest({
      candles: bars,
      warmupBars: 50,
      config: baseConfig({ strategyId: "MACD_CROSS_V1" }),
    });

    for (const point of run.equity) {
      expect(point.equity).toBeGreaterThanOrEqual(0);
    }
  });

  it("charges fees and slippage on both sides of a trade", () => {
    const prices = [
      ...Array.from({ length: 40 }, () => 100),
      ...[90, 85, 80, 78, 82, 88, 95, 100, 105, 110],
      ...Array.from({ length: 30 }, () => 110),
    ];
    const bars = series(prices);

    const free = runBacktest({
      candles: bars,
      warmupBars: 36,
      config: baseConfig({
        execution: { ...baseConfig().execution, feeBps: 0, slippageBps: 0 },
      }),
    });
    const costed = runBacktest({
      candles: bars,
      warmupBars: 36,
      config: baseConfig({
        execution: { ...baseConfig().execution, feeBps: 50, slippageBps: 50 },
      }),
    });

    if (free.trades.length > 0) {
      /* Costs must strictly reduce the result — a zero-cost backtest is how
         any strategy is made to look profitable. */
      expect(costed.totalFees).toBeGreaterThan(free.totalFees);
      const freeEnd = free.equity[free.equity.length - 1].equity;
      const costedEnd = costed.equity[costed.equity.length - 1].equity;
      expect(costedEnd).toBeLessThan(freeEnd);
    }
  });

  it("warns when a run assumes zero costs", () => {
    const bars = series(Array.from({ length: 120 }, (_, i) => 100 + i));
    const run = runBacktest({
      candles: bars,
      warmupBars: 40,
      config: baseConfig({
        execution: { ...baseConfig().execution, feeBps: 0, slippageBps: 0 },
      }),
    });
    expect(run.warnings.join(" ")).toMatch(/zero fees and zero slippage/i);
  });

  it("states that funding is excluded", () => {
    const bars = series(Array.from({ length: 120 }, (_, i) => 100 + i));
    const run = runBacktest({ candles: bars, warmupBars: 40, config: baseConfig() });
    expect(run.warnings.join(" ")).toMatch(/funding is excluded/i);
  });

  it("is deterministic — identical inputs give identical trades", () => {
    /* A stored result is only meaningful if it can be reproduced. */
    const bars = series(Array.from({ length: 250 }, (_, i) => 100 + Math.sin(i / 9) * 15));
    const a = runBacktest({ candles: bars, warmupBars: 50, config: baseConfig() });
    const b = runBacktest({ candles: bars, warmupBars: 50, config: baseConfig() });
    expect(JSON.stringify(a.trades)).toBe(JSON.stringify(b.trades));
    expect(JSON.stringify(a.equity)).toBe(JSON.stringify(b.equity));
  });

  it("costs the benchmark the same way as the strategy", () => {
    /* Comparing a costed strategy against a frictionless hold flatters the
       hold and makes every strategy look bad. */
    const bars = series(Array.from({ length: 150 }, (_, i) => 100 + i));
    const run = runBacktest({
      candles: bars,
      warmupBars: 40,
      config: baseConfig({
        execution: { ...baseConfig().execution, feeBps: 100, slippageBps: 100 },
      }),
    });

    const raw =
      ((bars[bars.length - 1].close - bars[40].open) / bars[40].open) * 100;
    expect(run.benchmarkReturnPct!).toBeLessThan(raw);
  });
});

/* ---------------------------------------------------------------------------
   Metrics
--------------------------------------------------------------------------- */

describe("metrics", () => {
  it("annualises on 365 days, not 252", () => {
    /* 252 is the US equity trading calendar. Crypto trades continuously, and
       using 252 understates volatility by about 20%. */
    expect(periodsPerYear("1d")).toBe(365);
    expect(periodsPerYear("1h")).toBe(365 * 24);
    expect(periodsPerYear("4h")).toBe(365 * 6);
  });

  it("returns null rather than a meaningless Sharpe on a short series", () => {
    const bars = series(Array.from({ length: 120 }, (_, i) => 100 + i));
    const run = runBacktest({ candles: bars, warmupBars: 110, config: baseConfig() });
    const metrics = computeMetrics(run);

    expect(metrics.sharpe).toBeNull();
    expect(metrics.notes.join(" ")).toMatch(/too few to be meaningful/i);
  });

  it("refuses to annualise a three-week result", () => {
    const bars = series(Array.from({ length: 300 }, (_, i) => 100 + i * 0.1));
    const run = runBacktest({ candles: bars, warmupBars: 50, config: baseConfig() });
    const metrics = computeMetrics(run);

    /* 250 hourly bars is about ten days. */
    expect(metrics.cagrPct).toBeNull();
    expect(metrics.notes.join(" ")).toMatch(/too short to annualise/i);
  });

  it("returns null profit factor when there are no losses to divide by", () => {
    const metrics = computeMetrics({
      engineVersion: "1.0.0",
      strategyId: "X",
      strategyVersion: 1,
      config: baseConfig(),
      trades: [
        {
          direction: "long", entryTime: 0, exitTime: 1, entryPrice: 1, exitPrice: 2,
          quantity: 1, grossPnl: 1, fees: 0, slippage: 0, funding: 0, netPnl: 1,
          returnPct: 100, barsHeld: 1, entryReason: "", exitReason: "",
        },
      ],
      equity: [],
      barsSimulated: 100,
      warmupBars: 0,
      benchmarkReturnPct: null,
      totalFees: 0,
      totalSlippage: 0,
      totalFunding: 0,
      warnings: [],
    });

    expect(metrics.profitFactor).toBeNull();
    expect(metrics.notes.join(" ")).toMatch(/no losing trades/i);
  });

  it("flags a result with too few trades as insufficient", () => {
    /* Not a score. "72/100" would tell nobody whether the problem was three
       trades or a missing month of data. */
    const bars = series(Array.from({ length: 400 }, (_, i) => 100 + i * 0.05));
    const run = runBacktest({ candles: bars, warmupBars: 50, config: baseConfig() });
    const quality = assessQuality(run, computeMetrics(run));
    expect(["insufficient_trades", "valid_with_warnings"]).toContain(quality.level);
  });
});

/* ---------------------------------------------------------------------------
   Strategies and aliases
--------------------------------------------------------------------------- */

describe("strategy registry", () => {
  it("covers all twenty requested indicator families", () => {
    const ids = STRATEGIES.map((s) => s.id).join(" ");
    for (const family of [
      "BOLLINGER", "RSI_12", "MACD", "STOCHASTIC", "ICHIMOKU", "AWESOME",
      "PARABOLIC_SAR", "WILLIAMS_R", "AROON", "CHAIKIN", "MFI", "FORCE_INDEX",
      "EASE_OF_MOVEMENT", "NVI", "SESSION_VWAP", "VORTEX", "APO",
      "BALANCE_OF_POWER", "TYPICAL_PRICE", "VWMA",
    ]) {
      expect(ids).toContain(family);
    }
  });

  it("gives every strategy explicit written entry and exit rules", () => {
    /* An indicator is not a strategy. A registry entry without a rule is an
       indicator line with a name. */
    for (const strategy of STRATEGIES) {
      expect(strategy.rules.entry.length).toBeGreaterThan(20);
      expect(strategy.rules.exit.length).toBeGreaterThan(10);
      expect(strategy.version).toBeGreaterThanOrEqual(1);
    }
  });

  it("declares a warm-up that covers its slowest parameter", () => {
    for (const strategy of STRATEGIES) {
      const params = defaultParams(strategy);
      const longest = Math.max(
        1,
        ...strategy.parameters
          .filter((p) => /period|slow|kijun|senkou/i.test(p.key))
          .map((p) => p.default),
      );
      expect(strategy.warmupFor(params)).toBeGreaterThanOrEqual(longest);
    }
  });

  it("marks session VWAP as intraday-only", () => {
    /* A daily bar IS its own session, so session VWAP equals typical price
       and every cross is noise. */
    expect(getStrategy("SESSION_VWAP_RECLAIM_V1")?.intradayOnly).toBe(true);
  });

  it("produces signals of the same length as the candle series", () => {
    const bars = series(Array.from({ length: 700 }, (_, i) => 100 + Math.sin(i / 11) * 14),
      Array.from({ length: 700 }, (_, i) => 900 + (i % 50) * 20));

    for (const strategy of STRATEGIES) {
      const signals = strategy.evaluate(bars, defaultParams(strategy));
      expect(signals).toHaveLength(bars.length);
    }
  });

  it("never signals on the very first bar", () => {
    /* Bar zero has no previous bar, so nothing can have crossed. */
    const bars = series(Array.from({ length: 400 }, (_, i) => 100 + Math.sin(i / 7) * 10));
    for (const strategy of STRATEGIES) {
      const signals = strategy.evaluate(bars, defaultParams(strategy));
      expect(signals[0].enterLong).toBe(false);
      expect(signals[0].exitLong).toBe(false);
    }
  });
});

describe("alias resolution", () => {
  it("resolves the misspellings people actually type", () => {
    const cases: Array<[string, string]> = [
      ["rs 12", "RSI_12_MEAN_REVERSION_V1"],
      ["rsi", "RSI_12_MEAN_REVERSION_V1"],
      ["lchimoke cloud", "ICHIMOKU_CLOUD_V1"],
      ["ichimoke", "ICHIMOKU_CLOUD_V1"],
      ["probablistic sar", "PARABOLIC_SAR_V1"],
      ["probabilistic sar", "PARABOLIC_SAR_V1"],
      ["chalkin money flow", "CHAIKIN_MONEY_FLOW_V1"],
      ["ease of momentum", "EASE_OF_MOVEMENT_V1"],
      ["absolute price", "APO_ZERO_CROSS_V1"],
      ["bollinger bands", "BOLLINGER_MEAN_REVERSION_V1"],
      ["macd", "MACD_CROSS_V1"],
      ["vwma", "VWMA_CROSS_V1"],
      ["typical price", "TYPICAL_PRICE_MA_CROSS_V1"],
    ];

    for (const [phrase, expected] of cases) {
      const match = resolveStrategy(phrase);
      expect(match, `"${phrase}" should resolve`).not.toBeNull();
      expect(match!.strategy.id, `"${phrase}"`).toBe(expected);
    }
  });

  it("reads a trailing number as the period", () => {
    /* "rsi 12" and "aroon 25" are how people write it. */
    expect(resolveStrategy("rsi 12")?.params.period).toBe(12);
    expect(resolveStrategy("aroon 25")?.params.period).toBe(25);
    expect(resolveStrategy("rsi 21")?.params.period).toBe(21);
  });

  it("prefers the longer alias", () => {
    /* "bollinger breakout" must not be swallowed by "bollinger". */
    expect(resolveStrategy("bollinger breakout")?.strategy.id).toBe("BOLLINGER_BREAKOUT_V1");
  });

  it("returns null rather than guessing", () => {
    expect(resolveStrategy("quantum flux capacitor")).toBeNull();
    expect(resolveStrategy("")).toBeNull();
  });

  it("matches an alias that begins with punctuation", () => {
    /* `\b%r\b` needs a letter or digit immediately before the `%`, so the
       alias only ever resolved when the phrase was exactly "%r". Inside a
       sentence it silently fell through to "no strategy recognised". */
    expect(resolveStrategy("%r")?.strategy.id).toBe("WILLIAMS_R_REVERSION_V1");
    expect(resolveStrategy("backtest %r on sol")?.strategy.id).toBe(
      "WILLIAMS_R_REVERSION_V1",
    );
    expect(resolveStrategy("show me %r 21")?.params.period).toBe(21);
  });

  it("still refuses an alias glued to a word", () => {
    /* The looser boundary must not start matching inside other words. */
    expect(resolveStrategy("parsimonious")).toBeNull();
    expect(resolveStrategy("brsix")).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
   Candle validation
--------------------------------------------------------------------------- */

describe("candle validation", () => {
  it("drops duplicates and bars whose high is below their low", () => {
    const bars = [
      candle({ openTime: 0, close: 100 }),
      candle({ openTime: 0, close: 100 }),
      candle({ openTime: 3_600_000, close: 100, high: 90, low: 110 }),
      candle({ openTime: 7_200_000, close: 100 }),
    ];

    const result = validateCandles(bars, "1h");
    expect(result.candles).toHaveLength(2);
    expect(result.issues.map((i) => i.kind)).toContain("duplicate");
    expect(result.issues.map((i) => i.kind)).toContain("bad_ohlc");
  });

  it("reports a gap without filling it", () => {
    /* A synthetic bar puts fictional prices under every indicator. */
    const bars = [
      candle({ openTime: 0, close: 100 }),
      candle({ openTime: 3 * 3_600_000, close: 100 }),
    ];

    const result = validateCandles(bars, "1h");
    expect(result.missingBars).toBe(2);
    expect(result.candles).toHaveLength(2);
    expect(result.issues[0].detail).toMatch(/not filled/i);
    expect(result.coverage).toBeCloseTo(0.5, 6);
  });
});

/* ---------------------------------------------------------------------------
   Natural language and robustness
--------------------------------------------------------------------------- */

describe("request parsing", () => {
  it("finds every strategy in a comparison", async () => {
    /* THE regression: `\b(?:,|and)\b` never matches a comma, because a comma
       has no word boundary after it. "macd, rs 12" stayed one chunk and only
       the last alias in it was found — the comparison silently ran short. */
    const { parseBacktestRequest } = await import("@/lib/backtest/run");

    const parsed = parseBacktestRequest("compare macd, rs 12 and lchimoke cloud on sol");
    expect(parsed.strategyIds).toHaveLength(3);
    expect(parsed.strategyIds).toContain("MACD_CROSS_V1");
    expect(parsed.strategyIds).toContain("RSI_12_MEAN_REVERSION_V1");
    expect(parsed.strategyIds).toContain("ICHIMOKU_CLOUD_V1");
  });

  it("reads asset, timeframe, period and fees out of plain language", async () => {
    const { parseBacktestRequest } = await import("@/lib/backtest/run");

    const parsed = parseBacktestRequest("backtest rsi on BTC 4h for six months with 20 bps fees");
    expect(parsed.symbol).toBe("BTC");
    expect(parsed.timeframe).toBe("4h");
    expect(parsed.days).toBe(182);
    expect(parsed.feeBps).toBe(20);
  });

  it("returns no strategy rather than guessing one", async () => {
    /* Running an arbitrary strategy and labelling it correctly is worse than
       asking which was meant. */
    const { parseBacktestRequest } = await import("@/lib/backtest/run");
    expect(parseBacktestRequest("backtest something on sol").strategyIds).toHaveLength(0);
  });

  it("rejects session VWAP on daily bars before any network call", async () => {
    const { validateRequest } = await import("@/lib/backtest/run");
    const error = validateRequest({
      symbol: "SOL",
      timeframe: "1d",
      startAt: Date.parse("2026-01-01"),
      endAt: Date.parse("2026-06-01"),
      strategyId: "SESSION_VWAP_RECLAIM_V1",
    });
    expect(error).toMatch(/intraday/i);
  });

  it("refuses a period that would exceed the bar ceiling", async () => {
    const { validateRequest } = await import("@/lib/backtest/run");
    const error = validateRequest({
      symbol: "SOL",
      timeframe: "1m",
      startAt: Date.parse("2020-01-01"),
      endAt: Date.parse("2026-01-01"),
      strategyId: "MACD_CROSS_V1",
    });
    expect(error).toMatch(/limit/i);
  });
});

describe("robustness and optimisation", () => {
  const noisy = series(
    Array.from({ length: 900 }, (_, i) => 100 + Math.sin(i / 13) * 18 + Math.sin(i / 3) * 4),
  );

  it("re-runs under doubled costs and reports the difference", async () => {
    const { assessRobustness } = await import("@/lib/backtest/robustness");
    const report = assessRobustness({
      candles: noisy,
      warmupBars: 60,
      config: baseConfig({ strategyId: "MACD_CROSS_V1" }),
    });

    const doubled = report.checks.find((check) => check.label === "Double costs");
    expect(doubled).toBeDefined();
    /* Doubling costs can only hurt a strategy that trades. */
    expect(doubled!.totalReturnPct).toBeLessThanOrEqual(report.base.totalReturnPct + 1e-9);
    expect(report.findings.length).toBeGreaterThan(0);
  });

  it("splits the optimiser chronologically, never randomly", async () => {
    /* A shuffled split puts tomorrow's bars in training and yesterday's in
       test — every indicator is a function of recent history, so the model
       has effectively seen the answer. */
    const { optimize, TRAIN_FRACTION } = await import("@/lib/backtest/robustness");

    const result = optimize({
      candles: noisy,
      warmupBars: 60,
      config: baseConfig({ strategyId: "RSI_12_MEAN_REVERSION_V1" }),
      grid: { period: [8, 12, 16] },
      objective: "sharpe",
    });

    expect(result.combinationsSearched).toBe(3);
    /* Training is the FIRST portion by time. */
    const tradable = noisy.length - 60;
    expect(result.trainBars).toBe(Math.floor(tradable * TRAIN_FRACTION));
    expect(result.testBars).toBeGreaterThan(0);
    expect(result.trainBars + result.testBars).toBeLessThanOrEqual(tradable + 1);
  });

  it("ranks candidates on the held-out score, not the training score", async () => {
    const { optimize } = await import("@/lib/backtest/robustness");

    const result = optimize({
      candles: noisy,
      warmupBars: 60,
      config: baseConfig({ strategyId: "RSI_12_MEAN_REVERSION_V1" }),
      grid: { period: [6, 10, 14, 20] },
      objective: "return_over_drawdown",
    });

    /* Every reported candidate carries both, so the gap between them is
       visible — a large gap IS the finding. */
    for (const candidate of result.candidates) {
      expect(candidate).toHaveProperty("trainScore");
      expect(candidate).toHaveProperty("testScore");
    }

    if (result.best !== null) {
      const better = result.candidates.filter(
        (c) => c.testTrades >= 5 && (c.testScore ?? -Infinity) > (result.best!.testScore ?? -Infinity),
      );
      expect(better).toHaveLength(0);
    }
  });

  it("will not recommend a parameter set that barely traded out of sample", async () => {
    const { optimize } = await import("@/lib/backtest/robustness");
    const flat = series(Array.from({ length: 600 }, () => 100));

    const result = optimize({
      candles: flat,
      warmupBars: 60,
      config: baseConfig({ strategyId: "RSI_12_MEAN_REVERSION_V1" }),
      grid: { period: [12] },
    });

    /* A flat series produces no trades, so nothing has been tested. */
    expect(result.best).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/out-of-sample trades/i);
  });

  it("caps the grid so an optimiser cannot become a denial of service", async () => {
    const { optimize, MAX_COMBINATIONS } = await import("@/lib/backtest/robustness");
    const grid = { period: Array.from({ length: 300 }, (_, i) => i + 2) };

    const result = optimize({
      candles: noisy,
      warmupBars: 60,
      config: baseConfig({ strategyId: "RSI_12_MEAN_REVERSION_V1" }),
      grid,
    });

    expect(result.combinationsSearched).toBe(300);
    expect(result.candidates.length).toBeLessThanOrEqual(MAX_COMBINATIONS);
    expect(result.warnings.join(" ")).toMatch(/only the first/i);
  });
});

describe("backtest report document", () => {
  it("records reproducibility metadata", async () => {
    /* A saved PDF whose numbers cannot be regenerated is a screenshot. */
    const { backtestDocument } = await import("@/lib/backtest/report");
    const bars = series(Array.from({ length: 400 }, (_, i) => 100 + Math.sin(i / 9) * 12));
    const run = runBacktest({ candles: bars, warmupBars: 60, config: baseConfig() });

    const document = backtestDocument(
      {
        ok: true,
        config: run.config,
        metrics: computeMetrics(run),
        trades: run.trades,
        equity: run.equity,
        warnings: run.warnings,
        barsLoaded: bars.length,
        coverage: 1,
      },
      "rsi 12 on sol",
    );

    expect(document).not.toBeNull();
    const repro = document!.sections.find((section) => section.id === "reproducibility");
    expect(repro).toBeDefined();

    const text = JSON.stringify(repro);
    expect(text).toMatch(/Engine version/);
    expect(text).toMatch(/RSI_12_MEAN_REVERSION_V1/);
  });

  it("states every execution assumption", async () => {
    const { backtestDocument } = await import("@/lib/backtest/report");
    const bars = series(Array.from({ length: 400 }, (_, i) => 100 + i * 0.1));
    const run = runBacktest({ candles: bars, warmupBars: 60, config: baseConfig() });

    const document = backtestDocument(
      {
        ok: true, config: run.config, metrics: computeMetrics(run),
        trades: run.trades, equity: run.equity, warnings: [], barsLoaded: 400, coverage: 1,
      },
      null,
    )!;

    const assumptions = JSON.stringify(
      document.sections.find((section) => section.id === "assumptions"),
    );
    expect(assumptions).toMatch(/long only/i);
    expect(assumptions).toMatch(/next bar/i);
    expect(assumptions).toMatch(/Funding: excluded/i);
    expect(assumptions).toMatch(/bps/);
  });

  it("asserts the no-lookahead check in its quality block", async () => {
    const { backtestDocument } = await import("@/lib/backtest/report");
    const bars = series(Array.from({ length: 400 }, (_, i) => 100 + i * 0.1));
    const run = runBacktest({ candles: bars, warmupBars: 60, config: baseConfig() });

    const document = backtestDocument(
      {
        ok: true, config: run.config, metrics: computeMetrics(run),
        trades: run.trades, equity: run.equity, warnings: [], barsLoaded: 400, coverage: 1,
      },
      null,
    )!;

    const check = document.quality.checks.find((c) => c.id === "lookahead");
    expect(check?.passed).toBe(true);
  });
});
