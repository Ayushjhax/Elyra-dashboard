import { describe, expect, it } from "vitest";
import {
  CHARTER_STEP_FIELDS,
  RISK_STEP_FIELDS,
  capitalOf,
  capitalProblem,
  charterBody,
  charterProblem,
  draftOf,
  fieldProblems,
  type CharterDraft,
} from "@/lib/funds/draft";
import { CHARTER_DEFAULTS, validateCharter } from "@/lib/funds/policy";

const ready = (): CharterDraft => ({ ...draftOf(CHARTER_DEFAULTS), name: "Trend", objective: "Follow multi-day trends." });

describe("fieldProblems", () => {
  it("finds nothing wrong with a charter the server accepts", () => {
    const draft = ready();
    expect(fieldProblems(draft, [...CHARTER_STEP_FIELDS, ...RISK_STEP_FIELDS])).toEqual({});
    expect(charterProblem(draft)).toBeNull();
    expect("charter" in validateCharter(charterBody(draft))).toBe(true);
  });

  it("asks only about the step's own fields", () => {
    const draft = { ...ready(), name: "", maxLeverage: "9" };
    expect(Object.keys(fieldProblems(draft, CHARTER_STEP_FIELDS))).toEqual(["name"]);
    expect(Object.keys(fieldProblems(draft, RISK_STEP_FIELDS))).toEqual(["maxLeverage"]);
  });

  it("gives each field the server's own words", () => {
    const draft: CharterDraft = { ...ready(), name: "  ", objective: "", markets: [], maxPositionPct: "0", maxGrossExposure: "9", maxLeverage: "2.5", maxPositions: "", maxDrawdownPct: "80", dailyLossPct: "abc" };
    expect(fieldProblems(draft, [...CHARTER_STEP_FIELDS, ...RISK_STEP_FIELDS])).toEqual({
      name: "Name the fund.",
      objective: "Write the manager's brief: what the fund is for and how it should trade.",
      markets: "Choose at least one market.",
      maxPositionPct: "The largest position must be 1% to 100% of NAV.",
      maxGrossExposure: "Gross exposure must be 0.1× to 5× NAV.",
      maxLeverage: "Leverage must be a whole number from 1 to 5.",
      maxPositions: "Open positions must be a whole number from 1 to 5.",
      maxDrawdownPct: "The drawdown limit must be 2% to 50%.",
      dailyLossPct: "The daily loss limit must be 0.5% to 20%.",
    });
  });

  it("leaves a rule between two fields to the whole charter, not to either field", () => {
    /* Each is in range on its own; together the daily limit exceeds the drawdown limit. */
    const draft = { ...ready(), maxDrawdownPct: "3", dailyLossPct: "10" };
    expect(fieldProblems(draft, RISK_STEP_FIELDS)).toEqual({});
    expect(charterProblem(draft)).toBe("The daily loss limit cannot be larger than the drawdown limit.");

    const oversized = { ...ready(), maxPositionPct: "80", maxGrossExposure: "0.5" };
    expect(fieldProblems(oversized, RISK_STEP_FIELDS)).toEqual({});
    expect(charterProblem(oversized)).toMatch(/^One position cannot be larger/);
  });

  it("words problems through the reader's translator", () => {
    const t = Object.assign((key: string) => `zh:${key}`, { locale: "zh-CN" as const });
    expect(fieldProblems({ ...ready(), name: "" }, ["name"], t)).toEqual({ name: "zh:Name the fund." });
  });
});

describe("capital", () => {
  it("reads an amount as people type it", () => {
    expect(capitalOf("10,000")).toBe(10_000);
    expect(capitalOf("$2,500.50")).toBe(2500.5);
    expect(capitalOf(" 7500 ")).toBe(7500);
    expect(capitalOf("")).toBeNull();
    expect(capitalOf("ten")).toBeNull();
  });

  it("holds it to the paper limits the server holds it to", () => {
    expect(capitalProblem("100")).toBeNull();
    expect(capitalProblem("1,000,000")).toBeNull();
    expect(capitalProblem("99.99")).toBe("Starting capital must be $100 to $1,000,000. Every fund starts on paper.");
    expect(capitalProblem("1000001")).not.toBeNull();
    expect(capitalProblem("")).not.toBeNull();
  });
});
