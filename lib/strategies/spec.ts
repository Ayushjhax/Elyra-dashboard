import { englishTranslator, msg, type Translator } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   A trading strategy as data. Pure.

   Every strategy designed in Elyra — by hand in the designer, from the
   library, or proposed by Elyra's AI — is one of these: entry conditions,
   exit conditions and risk limits, each condition comparing two operands
   (a price, an indicator, a number) by a fixed comparator. Nothing else.

   ── Why a fixed vocabulary ─────────────────────────────────────────────

   A strategy is a rule a backtest can execute and a reader can check. A
   closed vocabulary means every design — the AI's included — is validated
   by code here (`validateDesign`), executed by one interpreter
   (lib/strategies/interpret.ts) and described in words by code
   (`describeDesign`), so no strategy's text can claim more than its rules
   say. The AI cannot invent an indicator, look ahead, or smuggle in a
   parameter: anything outside these bounds is refused, not repaired.

   Long-only, like the backtest engine: shorting needs a borrow or funding
   model the simulation does not have.
--------------------------------------------------------------------------- */

export const DESIGN_TIMEFRAMES = ["15m", "1h", "4h", "1d"] as const;
export type DesignTimeframe = (typeof DESIGN_TIMEFRAMES)[number];

export const PRICE_FIELDS = ["close", "open", "high", "low"] as const;
export const COMPARATORS = ["crosses_above", "crosses_below", "above", "below"] as const;
export type Comparator = (typeof COMPARATORS)[number];

export type Operand =
  | { kind: "price"; field: (typeof PRICE_FIELDS)[number] }
  | { kind: "sma"; period: number }
  | { kind: "ema"; period: number }
  | { kind: "rsi"; period: number }
  | { kind: "macd"; fast: number; slow: number; signal: number; line: "macd" | "signal" | "histogram" }
  | { kind: "bollinger"; period: number; deviations: number; band: "upper" | "middle" | "lower" }
  /** Highest high or lowest low of the previous `period` bars, the current bar excluded. */
  | { kind: "donchian"; period: number; band: "upper" | "lower" }
  /** Average true range as a percentage of the close. */
  | { kind: "atr_pct"; period: number }
  /** Percentage change of the close over `period` bars. */
  | { kind: "change_pct"; period: number }
  | { kind: "volume" }
  | { kind: "volume_sma"; period: number }
  /** Slow stochastic %K. */
  | { kind: "stochastic"; period: number }
  | { kind: "number"; value: number };

export type OperandKind = Operand["kind"];

export const OPERAND_KINDS: readonly OperandKind[] = [
  "price",
  "sma",
  "ema",
  "rsi",
  "macd",
  "bollinger",
  "donchian",
  "atr_pct",
  "change_pct",
  "stochastic",
  "volume",
  "volume_sma",
  "number",
];

export interface Condition {
  left: Operand;
  op: Comparator;
  right: Operand;
}

export interface ConditionGroup {
  match: "all" | "any";
  conditions: Condition[];
}

export interface StrategyDesign {
  version: 1;
  name: string;
  /** The idea in words — the author's, or the AI's, never trusted for figures. */
  summary: string;
  timeframe: DesignTimeframe;
  entry: ConditionGroup;
  /** Null when the strategy leaves by its risk limits alone. */
  exit: ConditionGroup | null;
  risk: { stopLossPct: number | null; takeProfitPct: number | null; maxBarsHeld: number | null };
}

export const DESIGN_LIMITS = {
  maxName: 60,
  maxSummary: 400,
  maxConditions: 6,
  minPeriod: 2,
  maxPeriod: 400,
  minDeviations: 0.5,
  maxDeviations: 4,
  maxAbsNumber: 1_000_000_000,
  minStopPct: 0.3,
  maxStopPct: 50,
  minTakeProfitPct: 0.3,
  maxTakeProfitPct: 200,
  maxBarsHeld: 1_000,
} as const;

const L = DESIGN_LIMITS;

/* ---- validation ---- */

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const isNum = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const isPeriod = (value: unknown): value is number => isInt(value, L.minPeriod, L.maxPeriod);

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function validateOperand(raw: unknown, where: string): { operand: Operand } | { error: string } {
  const input = record(raw);
  if (input === null) return { error: `${where}: expected an operand.` };
  const periodError = { error: `${where}: a period must be a whole number from ${L.minPeriod} to ${L.maxPeriod}.` };
  switch (input.kind) {
    case "price":
      return (PRICE_FIELDS as readonly unknown[]).includes(input.field)
        ? { operand: { kind: "price", field: input.field as (typeof PRICE_FIELDS)[number] } }
        : { error: `${where}: price is close, open, high or low.` };
    case "sma":
    case "ema":
    case "rsi":
    case "atr_pct":
    case "change_pct":
    case "volume_sma":
    case "stochastic":
      return isPeriod(input.period) ? { operand: { kind: input.kind, period: input.period } } : periodError;
    case "macd": {
      if (!isPeriod(input.fast) || !isPeriod(input.slow) || !isPeriod(input.signal)) return periodError;
      if (input.fast >= input.slow) return { error: `${where}: MACD's fast period must be shorter than its slow one.` };
      if (input.line !== "macd" && input.line !== "signal" && input.line !== "histogram") return { error: `${where}: MACD line is macd, signal or histogram.` };
      return { operand: { kind: "macd", fast: input.fast, slow: input.slow, signal: input.signal, line: input.line } };
    }
    case "bollinger": {
      if (!isPeriod(input.period)) return periodError;
      if (!isNum(input.deviations, L.minDeviations, L.maxDeviations)) {
        return { error: `${where}: Bollinger deviations must be ${L.minDeviations} to ${L.maxDeviations}.` };
      }
      if (input.band !== "upper" && input.band !== "middle" && input.band !== "lower") return { error: `${where}: Bollinger band is upper, middle or lower.` };
      return { operand: { kind: "bollinger", period: input.period, deviations: input.deviations, band: input.band } };
    }
    case "donchian":
      if (!isPeriod(input.period)) return periodError;
      if (input.band !== "upper" && input.band !== "lower") return { error: `${where}: Donchian band is upper or lower.` };
      return { operand: { kind: "donchian", period: input.period, band: input.band } };
    case "volume":
      return { operand: { kind: "volume" } };
    case "number":
      return isNum(input.value, -L.maxAbsNumber, L.maxAbsNumber) ? { operand: { kind: "number", value: input.value } } : { error: `${where}: a number must be finite.` };
    default:
      return { error: `${where}: "${String(input.kind).slice(0, 24)}" is not an operand Elyra knows.` };
  }
}

function validateGroup(raw: unknown, where: string): { group: ConditionGroup } | { error: string } {
  const input = record(raw);
  if (input === null) return { error: `${where}: expected conditions.` };
  if (input.match !== "all" && input.match !== "any") return { error: `${where}: match is all or any.` };
  if (!Array.isArray(input.conditions) || input.conditions.length === 0) return { error: `${where}: add at least one condition.` };
  if (input.conditions.length > L.maxConditions) return { error: `${where}: at most ${L.maxConditions} conditions.` };
  const conditions: Condition[] = [];
  for (const [index, entry] of input.conditions.entries()) {
    const at = `${where}, condition ${index + 1}`;
    const condition = record(entry);
    if (condition === null) return { error: `${at}: expected a condition.` };
    if (!(COMPARATORS as readonly unknown[]).includes(condition.op)) return { error: `${at}: the comparison is crosses above, crosses below, above or below.` };
    const left = validateOperand(condition.left, `${at}, left`);
    if ("error" in left) return left;
    const right = validateOperand(condition.right, `${at}, right`);
    if ("error" in right) return right;
    if (left.operand.kind === "number" && right.operand.kind === "number") return { error: `${at}: compare something to a number, not two numbers.` };
    conditions.push({ left: left.operand, op: condition.op as Comparator, right: right.operand });
  }
  return { group: { match: input.match, conditions } };
}

/** A design as given — by the designer, the library or the AI — checked against the limits, or what is wrong with it. */
export function validateDesign(raw: unknown): { design: StrategyDesign } | { error: string } {
  const input = record(raw);
  if (input === null) return { error: "Expected a strategy." };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length === 0) return { error: "Name the strategy." };
  if (name.length > L.maxName) return { error: `A strategy's name is at most ${L.maxName} characters.` };
  const summary = typeof input.summary === "string" ? input.summary.trim().slice(0, L.maxSummary) : "";
  if (!(DESIGN_TIMEFRAMES as readonly unknown[]).includes(input.timeframe)) return { error: `Choose a timeframe: ${DESIGN_TIMEFRAMES.join(", ")}.` };

  const entry = validateGroup(input.entry, "Entry");
  if ("error" in entry) return entry;
  let exit: ConditionGroup | null = null;
  if (input.exit !== null && input.exit !== undefined) {
    const checked = validateGroup(input.exit, "Exit");
    if ("error" in checked) return checked;
    exit = checked.group;
  }

  const risk = record(input.risk) ?? {};
  const optional = (value: unknown) => (value === null || value === undefined || value === "" ? null : value);
  const stop = optional(risk.stopLossPct);
  const target = optional(risk.takeProfitPct);
  const bars = optional(risk.maxBarsHeld);
  if (stop !== null && !isNum(stop, L.minStopPct, L.maxStopPct)) return { error: `A stop-loss must be ${L.minStopPct}% to ${L.maxStopPct}%.` };
  if (target !== null && !isNum(target, L.minTakeProfitPct, L.maxTakeProfitPct)) {
    return { error: `A take-profit must be ${L.minTakeProfitPct}% to ${L.maxTakeProfitPct}%.` };
  }
  if (bars !== null && !isInt(bars, 1, L.maxBarsHeld)) return { error: `A time limit must be 1 to ${L.maxBarsHeld} bars.` };
  if (exit === null && stop === null && target === null && bars === null) {
    return { error: "A strategy needs a way out: exit conditions, a stop-loss, a take-profit or a time limit." };
  }

  return {
    design: {
      version: 1,
      name,
      summary,
      timeframe: input.timeframe as DesignTimeframe,
      entry: entry.group,
      exit,
      risk: { stopLossPct: stop as number | null, takeProfitPct: target as number | null, maxBarsHeld: bars as number | null },
    },
  };
}

/* ---- how much history a design needs ---- */

function warmupOf(operand: Operand): number {
  switch (operand.kind) {
    case "sma":
    case "volume_sma":
    case "bollinger":
    case "change_pct":
      return operand.period + 1;
    case "donchian":
      return operand.period + 1;
    /* Exponential and Wilder averages converge slowly: give them three spans. */
    case "ema":
    case "rsi":
    case "atr_pct":
      return operand.period * 3 + 1;
    case "macd":
      return operand.slow * 3 + operand.signal + 1;
    case "stochastic":
      return operand.period + 6;
    default:
      return 1;
  }
}

export function designWarmup(design: StrategyDesign): number {
  let most = 2;
  for (const group of [design.entry, design.exit]) {
    for (const condition of group?.conditions ?? []) most = Math.max(most, warmupOf(condition.left), warmupOf(condition.right));
  }
  return most + 1;
}

export function designUsesVolume(design: StrategyDesign): boolean {
  return [design.entry, design.exit].some((group) =>
    (group?.conditions ?? []).some((condition) => [condition.left, condition.right].some((operand) => operand.kind === "volume" || operand.kind === "volume_sma")),
  );
}

/* ---- in words, by code ---- */

export const OPERAND_NAME: Record<OperandKind, string> = {
  price: msg("Price"),
  sma: msg("Simple moving average"),
  ema: msg("Exponential moving average"),
  rsi: msg("RSI"),
  macd: msg("MACD"),
  bollinger: msg("Bollinger band"),
  donchian: msg("Donchian channel"),
  atr_pct: msg("ATR % of price"),
  change_pct: msg("% change"),
  stochastic: msg("Stochastic %K"),
  volume: msg("Volume"),
  volume_sma: msg("Average volume"),
  number: msg("Number"),
};

export const COMPARATOR_WORD: Record<Comparator, string> = {
  crosses_above: msg("crosses above"),
  crosses_below: msg("crosses below"),
  above: msg("is above"),
  below: msg("is below"),
};

const FIELD_WORD: Record<(typeof PRICE_FIELDS)[number], string> = {
  close: msg("Close"),
  open: msg("Open"),
  high: msg("High"),
  low: msg("Low"),
};

/** An operand, shortly: "SMA(200)", "MACD signal (12, 26, 9)", "Close". */
export function operandLabel(operand: Operand, t: Translator = englishTranslator): string {
  switch (operand.kind) {
    case "price":
      return t(FIELD_WORD[operand.field]);
    case "sma":
      return `SMA(${operand.period})`;
    case "ema":
      return `EMA(${operand.period})`;
    case "rsi":
      return `RSI(${operand.period})`;
    case "macd":
      return operand.line === "macd"
        ? t("MACD line ({fast}, {slow}, {signal})", operand)
        : operand.line === "signal"
          ? t("MACD signal ({fast}, {slow}, {signal})", operand)
          : t("MACD histogram ({fast}, {slow}, {signal})", operand);
    case "bollinger":
      return operand.band === "upper"
        ? t("Upper Bollinger band ({period}, {deviations})", operand)
        : operand.band === "lower"
          ? t("Lower Bollinger band ({period}, {deviations})", operand)
          : t("Middle Bollinger band ({period}, {deviations})", operand);
    case "donchian":
      return operand.band === "upper" ? t("{period}-bar high", operand) : t("{period}-bar low", operand);
    case "atr_pct":
      return t("ATR({period}) % of price", operand);
    case "change_pct":
      return t("{period}-bar % change", operand);
    case "stochastic":
      return t("Stochastic %K({period})", operand);
    case "volume":
      return t("Volume");
    case "volume_sma":
      return t("{period}-bar average volume", operand);
    case "number":
      return String(operand.value);
  }
}

export function conditionText(condition: Condition, t: Translator = englishTranslator): string {
  return `${operandLabel(condition.left, t)} ${t(COMPARATOR_WORD[condition.op])} ${operandLabel(condition.right, t)}`;
}

export function groupText(group: ConditionGroup, t: Translator = englishTranslator): string {
  const parts = group.conditions.map((condition) => conditionText(condition, t));
  if (parts.length === 1) return parts[0];
  return group.match === "all" ? t("All of: {list}", { list: parts.join("; ") }) : t("Any of: {list}", { list: parts.join("; ") });
}

/** The rules in words, written by code from the design itself. */
export function describeDesign(design: StrategyDesign, t: Translator = englishTranslator): { entry: string; exit: string } {
  const exits: string[] = [];
  if (design.exit !== null) exits.push(groupText(design.exit, t));
  if (design.risk.stopLossPct !== null) exits.push(t("a stop-loss {pct}% below the entry", { pct: design.risk.stopLossPct }));
  if (design.risk.takeProfitPct !== null) exits.push(t("a take-profit {pct}% above the entry", { pct: design.risk.takeProfitPct }));
  if (design.risk.maxBarsHeld !== null) exits.push(t("after {bars} bars at most", { bars: design.risk.maxBarsHeld }));
  return {
    entry: t("Buy at the next bar's open when {rule}.", { rule: groupText(design.entry, t) }),
    exit: t("Sell at the first of: {list}.", { list: exits.join("; ") }),
  };
}

/** Short names, for the designer's pickers: what a reader sees in "EMA(20) crosses above EMA(50)". */
export const OPERAND_SHORT: Record<OperandKind, string> = {
  price: msg("Price"),
  sma: "SMA",
  ema: "EMA",
  rsi: "RSI",
  macd: "MACD",
  bollinger: msg("Bollinger band"),
  donchian: msg("Donchian channel"),
  atr_pct: msg("ATR %"),
  change_pct: msg("% change"),
  stochastic: msg("Stochastic %K"),
  volume: msg("Volume"),
  volume_sma: msg("Average volume"),
  number: msg("Number"),
};

/** A group inside a sentence: one condition as it is, several as "all of" or "any of" them. */
function groupPhrase(group: ConditionGroup, t: Translator): string {
  const parts = group.conditions.map((condition) => conditionText(condition, t));
  if (parts.length === 1) return parts[0];
  return group.match === "all" ? t("all of {list}", { list: parts.join(", ") }) : t("any of {list}", { list: parts.join(", ") });
}

/**
 * The rules in words, as the backtest engine runs them (lib/backtest/engine.ts
 * with run.ts's next-bar-open execution): a signal is read at a bar's close
 * and acted on at the next bar's open; a stop or a target is measured from
 * the fill and taken inside the bar that reaches it, the stop first when one
 * bar reaches both; a time limit leaves at the open once it has passed.
 * Each half is written without its verb, for "Buy" and "Sell" beside it.
 */
export function ruleWords(design: StrategyDesign, t: Translator = englishTranslator): { buy: string; sell: string } {
  const exits: string[] = [];
  if (design.exit !== null) exits.push(t("the next bar's open after {rule}", { rule: groupPhrase(design.exit, t) }));
  if (design.risk.stopLossPct !== null) exits.push(t("a stop {pct}% below the fill, inside the bar that reaches it", { pct: design.risk.stopLossPct }));
  if (design.risk.takeProfitPct !== null) exits.push(t("a target {pct}% above the fill, inside the bar that reaches it", { pct: design.risk.takeProfitPct }));
  if (design.risk.maxBarsHeld !== null) exits.push(t("the open after {bars} bars held", { bars: design.risk.maxBarsHeld }));
  let sell = exits.length === 1 ? t("At {exit}.", { exit: exits[0] }) : t("At the first of: {list}.", { list: exits.join("; ") });
  if (design.risk.stopLossPct !== null && design.risk.takeProfitPct !== null) sell = `${sell} ${t("A bar that reaches both counts as the stop.")}`;
  return { buy: t("At the next bar's open when {rule}.", { rule: groupPhrase(design.entry, t) }), sell };
}

/** Every number a design holds, for holding text about it to its own figures. */
export function designNumbers(design: StrategyDesign): string[] {
  const out: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "number") out.push(String(value));
  };
  for (const group of [design.entry, design.exit]) {
    for (const condition of group?.conditions ?? []) {
      for (const operand of [condition.left, condition.right]) for (const value of Object.values(operand)) push(value);
    }
  }
  push(design.risk.stopLossPct);
  push(design.risk.takeProfitPct);
  push(design.risk.maxBarsHeld);
  return out;
}

/* ---- for the designer ---- */

/** A sensible operand of a kind, for when the person picks it. */
export function defaultOperand(kind: OperandKind): Operand {
  switch (kind) {
    case "price":
      return { kind, field: "close" };
    case "sma":
      return { kind, period: 50 };
    case "ema":
      return { kind, period: 20 };
    case "rsi":
      return { kind, period: 14 };
    case "macd":
      return { kind, fast: 12, slow: 26, signal: 9, line: "macd" };
    case "bollinger":
      return { kind, period: 20, deviations: 2, band: "lower" };
    case "donchian":
      return { kind, period: 20, band: "upper" };
    case "atr_pct":
      return { kind, period: 14 };
    case "change_pct":
      return { kind, period: 10 };
    case "stochastic":
      return { kind, period: 14 };
    case "volume":
      return { kind };
    case "volume_sma":
      return { kind, period: 20 };
    case "number":
      return { kind, value: 50 };
  }
}

/** Where a blank design starts: a plain moving-average crossover with a stop. */
export function starterDesign(name: string): StrategyDesign {
  return {
    version: 1,
    name,
    summary: "",
    timeframe: "4h",
    entry: { match: "all", conditions: [{ left: { kind: "ema", period: 20 }, op: "crosses_above", right: { kind: "ema", period: 50 } }] },
    exit: { match: "all", conditions: [{ left: { kind: "ema", period: 20 }, op: "crosses_below", right: { kind: "ema", period: 50 } }] },
    risk: { stopLossPct: 5, takeProfitPct: null, maxBarsHeld: null },
  };
}

const BARS_PER_DAY: Record<DesignTimeframe, number> = { "15m": 96, "1h": 24, "4h": 6, "1d": 1 };
/** The backtest's ceiling on bars per run (lib/backtest/run.ts MAX_BARS). */
const MAX_TEST_BARS = 20_000;

/** The test periods a timeframe allows, in days, within the backtest's bar ceiling. */
export function testPeriods(timeframe: DesignTimeframe): number[] {
  return [90, 180, 365, 730, 1460].filter((days) => days * BARS_PER_DAY[timeframe] <= MAX_TEST_BARS);
}

/** The period a timeframe is tested over by default: about a year, or as long as allowed. */
export function defaultTestDays(timeframe: DesignTimeframe): number {
  const allowed = testPeriods(timeframe);
  return allowed.includes(365) ? 365 : allowed[allowed.length - 1];
}
