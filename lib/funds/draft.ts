import { englishTranslator, type Translator } from "@/lib/i18n/translate";
import { CHARTER_DEFAULTS, FUND_LIMITS, validateCharter } from "@/lib/funds/policy";
import type { FundCharter } from "@/lib/funds/types";

/* ---------------------------------------------------------------------------
   A charter as the person is still writing it, and what is wrong with each
   field so far. Pure.

   The numbers are typed as text and sent as numbers. `validateCharter` is
   the only judge of a charter: a field's problem here is that function's own
   answer, asked about that one field with every other field set where no
   rule between two fields can fire. So a range, a whole-number rule or a
   message is never restated — the form and the server cannot disagree.
   The rules between fields (the daily limit inside the drawdown limit, one
   position inside the gross exposure) are the whole charter's, asked last.
--------------------------------------------------------------------------- */

export interface CharterDraft {
  name: string;
  objective: string;
  markets: string[];
  allowShorts: boolean;
  maxPositionPct: string;
  maxGrossExposure: string;
  maxLeverage: string;
  maxPositions: string;
  maxDrawdownPct: string;
  dailyLossPct: string;
}

export type DraftField = keyof CharterDraft;
export type DraftProblems = Partial<Record<DraftField, string>>;

export const CHARTER_STEP_FIELDS = ["name", "objective", "markets"] as const satisfies readonly DraftField[];
export const RISK_STEP_FIELDS = [
  "maxPositionPct",
  "maxGrossExposure",
  "maxLeverage",
  "maxPositions",
  "maxDrawdownPct",
  "dailyLossPct",
] as const satisfies readonly DraftField[];

type NumberField = (typeof RISK_STEP_FIELDS)[number];

export function draftOf(charter: Omit<FundCharter, "name" | "objective"> & { name?: string; objective?: string }): CharterDraft {
  return {
    name: charter.name ?? "",
    objective: charter.objective ?? "",
    markets: [...charter.markets],
    allowShorts: charter.allowShorts,
    maxPositionPct: String(charter.maxPositionPct),
    maxGrossExposure: String(charter.maxGrossExposure),
    maxLeverage: String(charter.maxLeverage),
    maxPositions: String(charter.maxPositions),
    maxDrawdownPct: String(charter.maxDrawdownPct),
    dailyLossPct: String(charter.dailyLossPct),
  };
}

const number = (value: string) => Number(value.trim());

export function charterBody(draft: CharterDraft): Record<string, unknown> {
  return {
    name: draft.name,
    objective: draft.objective,
    markets: draft.markets,
    allowShorts: draft.allowShorts,
    maxPositionPct: number(draft.maxPositionPct),
    maxGrossExposure: number(draft.maxGrossExposure),
    maxLeverage: number(draft.maxLeverage),
    maxPositions: number(draft.maxPositions),
    maxDrawdownPct: number(draft.maxDrawdownPct),
    dailyLossPct: number(draft.dailyLossPct),
  };
}

/** A charter that passes, for asking about one field at a time. */
const PASSING: Record<string, unknown> = { name: "Fund", objective: "Brief", ...CHARTER_DEFAULTS };

/** For each number, the other values set so that no rule between two fields can fire. */
const APART: Record<NumberField, Record<string, number>> = {
  maxPositionPct: { maxGrossExposure: FUND_LIMITS.maxGrossExposure },
  maxGrossExposure: { maxPositionPct: FUND_LIMITS.minPositionPct },
  maxLeverage: {},
  maxPositions: {},
  maxDrawdownPct: { dailyLossPct: FUND_LIMITS.minDailyLossPct },
  dailyLossPct: { maxDrawdownPct: FUND_LIMITS.maxDrawdownPct },
};

function ask(patch: Record<string, unknown>, t: Translator): string | null {
  const result = validateCharter({ ...PASSING, ...patch }, t);
  return "error" in result ? result.error : null;
}

/** What is wrong with each of `fields`, on its own. Absent when nothing is. */
export function fieldProblems(draft: CharterDraft, fields: readonly DraftField[], t: Translator = englishTranslator): DraftProblems {
  const problems: DraftProblems = {};
  for (const field of fields) {
    let problem: string | null = null;
    if (field === "name" || field === "objective" || field === "markets") problem = ask({ [field]: draft[field] }, t);
    else if (field !== "allowShorts") problem = ask({ ...APART[field], [field]: number(draft[field]) }, t);
    if (problem !== null) problems[field] = problem;
  }
  return problems;
}

/** What is wrong with the charter as a whole, once every field passes on its own. */
export function charterProblem(draft: CharterDraft, t: Translator = englishTranslator): string | null {
  const result = validateCharter(charterBody(draft), t);
  return "error" in result ? result.error : null;
}

/** Starting capital as typed — "10,000", "$2500" — or null when it is not an amount. */
export function capitalOf(text: string): number | null {
  const amount = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) && amount > 0 && text.trim().length > 0 ? Number(amount.toFixed(2)) : null;
}

/** Why a starting capital will be refused, in the server's terms; null when it will not. */
export function capitalProblem(text: string, t: Translator = englishTranslator): string | null {
  const amount = capitalOf(text);
  if (amount !== null && amount >= FUND_LIMITS.minCapitalUsd && amount <= FUND_LIMITS.maxPaperCapitalUsd) return null;
  return t("Starting capital must be ${min} to ${max}. Every fund starts on paper.", {
    min: FUND_LIMITS.minCapitalUsd.toLocaleString("en-US"),
    max: FUND_LIMITS.maxPaperCapitalUsd.toLocaleString("en-US"),
  });
}
