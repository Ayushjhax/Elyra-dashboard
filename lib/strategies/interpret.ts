import { createHash } from "node:crypto";
import type { Candle } from "@/lib/backtest/intervals";
import { bollinger, closes, ema, highs, lows, macd, rsi, sma, stochastic, volumes, wilder, type Series } from "@/lib/backtest/indicators";
import type { BarSignal, StrategyDefinition } from "@/lib/backtest/strategies";
import { conditionText, describeDesign, designUsesVolume, designWarmup, type Condition, type ConditionGroup, type Operand, type StrategyDesign } from "@/lib/strategies/spec";

/* ---------------------------------------------------------------------------
   A design, made runnable: the one interpreter every designed strategy
   goes through, returning the backtest engine's own strategy contract.

   The contract is the catalogue's (lib/backtest/strategies.ts): a signal at
   bar i reads data up to and including bar i's close, and the engine acts on
   bar i + 1. Every series here is computed from the bars as they were — a
   Donchian channel is the PREVIOUS n bars, a cross compares bar i with bar
   i − 1 — so nothing reads the future.

   Stops, take-profits and time limits are not signals: they are the
   engine's (`risk` in the backtest config), checked against each bar's own
   range, so a stop fires inside the bar that touches it.
--------------------------------------------------------------------------- */

/** A stable key for an operand, so one series is computed once per run. */
export function operandKey(operand: Operand): string {
  return JSON.stringify(Object.entries(operand).sort(([a], [b]) => a.localeCompare(b)));
}

function series(operand: Operand, candles: Candle[], cache: Map<string, Series>): Series {
  const key = operandKey(operand);
  const known = cache.get(key);
  if (known !== undefined) return known;
  const close = closes(candles);
  let out: Series;
  switch (operand.kind) {
    case "price":
      out = candles.map((candle) => candle[operand.field]);
      break;
    case "sma":
      out = sma(close, operand.period);
      break;
    case "ema":
      out = ema(close, operand.period);
      break;
    case "rsi":
      out = rsi(close, operand.period);
      break;
    case "macd": {
      const lines = macd(close, operand.fast, operand.slow, operand.signal);
      out = operand.line === "macd" ? lines.macd : operand.line === "signal" ? lines.signal : lines.histogram;
      break;
    }
    case "bollinger": {
      const bands = bollinger(close, operand.period, operand.deviations);
      out = operand.band === "upper" ? bands.upper : operand.band === "lower" ? bands.lower : bands.middle;
      break;
    }
    case "donchian": {
      const source = operand.band === "upper" ? highs(candles) : lows(candles);
      out = source.map((_, index) => {
        if (index < operand.period) return null;
        const window = source.slice(index - operand.period, index);
        return operand.band === "upper" ? Math.max(...window) : Math.min(...window);
      });
      break;
    }
    case "atr_pct": {
      const ranges = candles.map((candle, index) => {
        const previous = index === 0 ? candle.close : candles[index - 1].close;
        return Math.max(candle.high - candle.low, Math.abs(candle.high - previous), Math.abs(candle.low - previous));
      });
      const average = wilder(ranges, operand.period);
      out = average.map((value, index) => (value === null || close[index] <= 0 ? null : (value / close[index]) * 100));
      break;
    }
    case "change_pct":
      out = close.map((value, index) => (index < operand.period || close[index - operand.period] <= 0 ? null : (value / close[index - operand.period] - 1) * 100));
      break;
    case "stochastic":
      out = stochastic(candles, operand.period).k;
      break;
    case "volume":
      out = volumes(candles);
      break;
    case "volume_sma":
      out = sma(volumes(candles), operand.period);
      break;
    case "number":
      out = candles.map(() => operand.value);
      break;
  }
  cache.set(key, out);
  return out;
}

function holds(condition: Condition, left: Series, right: Series, index: number): boolean {
  const now = [left[index], right[index]];
  if (now[0] === null || now[1] === null) return false;
  if (condition.op === "above") return now[0] > now[1];
  if (condition.op === "below") return now[0] < now[1];
  if (index === 0) return false;
  const before = [left[index - 1], right[index - 1]];
  if (before[0] === null || before[1] === null) return false;
  return condition.op === "crosses_above" ? before[0] <= before[1] && now[0] > now[1] : before[0] >= before[1] && now[0] < now[1];
}

/** For each bar, whether the group holds, and the conditions that made it. */
function evaluateGroup(group: ConditionGroup, candles: Candle[], cache: Map<string, Series>): Array<string | null> {
  const lines = group.conditions.map((condition) => ({
    condition,
    left: series(condition.left, candles, cache),
    right: series(condition.right, candles, cache),
    text: conditionText(condition),
  }));
  return candles.map((_, index) => {
    const met = lines.filter((line) => holds(line.condition, line.left, line.right, index));
    if (group.match === "all" ? met.length === lines.length : met.length > 0) return met.map((line) => line.text).join("; ");
    return null;
  });
}

/** A short, stable id for a design's rules — its name and summary do not change it. */
export function designId(design: StrategyDesign): string {
  const rules = JSON.stringify({ timeframe: design.timeframe, entry: design.entry, exit: design.exit, risk: design.risk });
  return `DESIGN_${createHash("sha256").update(rules).digest("hex").slice(0, 12).toUpperCase()}`;
}

/** The design as a strategy the backtest engine runs. */
export function designStrategy(design: StrategyDesign): StrategyDefinition {
  const warmup = designWarmup(design);
  return {
    id: designId(design),
    version: 1,
    name: design.name,
    category: "trend",
    rules: describeDesign(design),
    parameters: [],
    warmupFor: () => warmup,
    requiresVolume: designUsesVolume(design),
    evaluate(candles: Candle[]): BarSignal[] {
      const cache = new Map<string, Series>();
      const entries = evaluateGroup(design.entry, candles, cache);
      const exits = design.exit === null ? candles.map(() => null) : evaluateGroup(design.exit, candles, cache);
      return candles.map((_, index) => {
        const exit = exits[index];
        const entry = entries[index];
        /* Both true is an exit, as the engine reads it. */
        if (exit !== null) return { enterLong: false, exitLong: true, reason: `Exit: ${exit}` };
        if (entry !== null) return { enterLong: true, exitLong: false, reason: `Entry: ${entry}` };
        return { enterLong: false, exitLong: false, reason: null };
      });
    },
  };
}
