import "server-only";

import { fail, ok, type ToolResult } from "@/lib/providers/types";
import { padCik, SEC_TTL, secJson } from "@/lib/research/sec/client";

/* ---------------------------------------------------------------------------
   XBRL company facts — the numbers, with their provenance attached.

   ── Why a metric is a SEARCH, not a lookup ─────────────────────────────

   There is no single tag for "revenue". US-GAAP offers several, issuers pick
   one, and they change their minds. NVIDIA reported under
   `RevenueFromContractWithCustomerExcludingAssessedTax` through FY2022 and
   under `Revenues` after — verified against their live company facts while
   writing this. Code pinned to either tag reads one era correctly and returns
   nothing, or stale figures, for the other.

   So each metric declares CANDIDATE concepts in preference order, and the
   resolver returns the one that actually has data for the period asked
   about — carrying which concept it used, so the report can say so.

   ── Fiscal years are not calendar years ────────────────────────────────

   NVIDIA's fiscal year ends in January, so the quarter ending 2026-07-26 is
   fiscal Q2 of FY2027. `fy`/`fp` are the issuer's labels and `start`/`end`
   are the real dates. Anything comparing periods uses the dates; anything
   printing a label uses the labels. Mixing them produces a report that
   compares Q2 against Q2 of a different year.

   ── Duration versus instant ────────────────────────────────────────────

   Revenue is earned over a period and has `start` and `end`. Cash is held at
   a moment and has only `end`. Treating a balance as a flow — or summing four
   quarterly cash balances into a "year" — is a category error that produces a
   number nobody would question.
--------------------------------------------------------------------------- */

export interface XbrlFact {
  /** The reported value. */
  value: number;
  unit: string;
  /** Present for duration facts, absent for instants. */
  start: string | null;
  end: string;
  /** The issuer's fiscal-year label. Not a calendar year. */
  fiscalYear: number | null;
  /** "Q1".."Q4" or "FY", as the issuer labels it. */
  fiscalPeriod: string | null;
  form: string | null;
  accession: string | null;
  filedAt: string | null;
  /** The us-gaap concept this came from. Travels for the source appendix. */
  concept: string;
  taxonomy: string;
}

interface FactUnit {
  val?: number;
  start?: string;
  end?: string;
  fy?: number;
  fp?: string;
  form?: string;
  accn?: string;
  filed?: string;
  frame?: string;
}

interface ConceptFacts {
  units?: Record<string, FactUnit[]>;
}

interface CompanyFacts {
  cik?: number;
  entityName?: string;
  facts?: Record<string, Record<string, ConceptFacts>>;
}

export interface CompanyFactSet {
  cik: string;
  entityName: string;
  raw: CompanyFacts;
}

export async function companyFacts(cik: string): Promise<ToolResult<CompanyFactSet>> {
  const padded = padCik(cik);

  const result = await secJson<CompanyFacts>(
    `/api/xbrl/companyfacts/CIK${padded}.json`,
    SEC_TTL.facts,
    "data",
  );

  if (!result.ok || result.data === undefined) {
    return fail<CompanyFactSet>(
      "sec",
      result.error?.code ?? "UPSTREAM_UNAVAILABLE",
      result.error?.message ?? "SEC company facts could not be read.",
    );
  }

  return ok(
    {
      cik: padded,
      entityName: result.data.entityName ?? "",
      raw: result.data,
    },
    "sec",
    { asOf: result.asOf },
  );
}

/* ---------------------------------------------------------------------------
   Metrics
--------------------------------------------------------------------------- */

export type MetricId =
  | "revenue"
  | "grossProfit"
  | "operatingIncome"
  | "netIncome"
  | "dilutedEps"
  | "cash"
  | "totalAssets"
  | "totalDebt"
  | "operatingCashFlow"
  | "capex";

interface MetricDefinition {
  label: string;
  /** In preference order. The first with usable data wins. */
  concepts: string[];
  /** A balance (instant) rather than a flow (duration). */
  instant: boolean;
  /** Reported as a negative by convention, e.g. capital expenditure. */
  negated?: boolean;
}

/**
 * Concept candidates per metric.
 *
 * Every list is ordered most-specific first. The generic fallback sits last
 * because a company that reports both `Revenues` and a more precise concept
 * usually means something narrower by the precise one.
 */
export const METRICS: Record<MetricId, MetricDefinition> = {
  revenue: {
    label: "Revenue",
    concepts: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "Revenues",
      "SalesRevenueNet",
    ],
    instant: false,
  },
  grossProfit: { label: "Gross profit", concepts: ["GrossProfit"], instant: false },
  operatingIncome: {
    label: "Operating income",
    concepts: ["OperatingIncomeLoss"],
    instant: false,
  },
  netIncome: {
    label: "Net income",
    concepts: [
      "NetIncomeLoss",
      "ProfitLoss",
      "NetIncomeLossAvailableToCommonStockholdersBasic",
    ],
    instant: false,
  },
  dilutedEps: {
    label: "Diluted EPS",
    concepts: ["EarningsPerShareDiluted", "IncomeLossFromContinuingOperationsPerDilutedShare"],
    instant: false,
  },
  cash: {
    label: "Cash and equivalents",
    concepts: [
      "CashAndCashEquivalentsAtCarryingValue",
      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    ],
    instant: true,
  },
  totalAssets: { label: "Total assets", concepts: ["Assets"], instant: true },
  totalDebt: {
    label: "Total debt",
    concepts: ["LongTermDebt", "LongTermDebtNoncurrent", "DebtLongtermAndShorttermCombinedAmount"],
    instant: true,
  },
  operatingCashFlow: {
    label: "Operating cash flow",
    concepts: [
      "NetCashProvidedByUsedInOperatingActivities",
      "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    ],
    instant: false,
  },
  capex: {
    label: "Capital expenditure",
    concepts: [
      "PaymentsToAcquirePropertyPlantAndEquipment",
      "PaymentsToAcquireProductiveAssets",
    ],
    instant: false,
  },
};

function toFact(
  row: FactUnit,
  unit: string,
  concept: string,
  taxonomy: string,
): XbrlFact | null {
  if (typeof row.val !== "number" || row.end === undefined) return null;
  return {
    value: row.val,
    unit,
    start: row.start ?? null,
    end: row.end,
    fiscalYear: row.fy ?? null,
    fiscalPeriod: row.fp ?? null,
    form: row.form ?? null,
    accession: row.accn ?? null,
    filedAt: row.filed ?? null,
    concept,
    taxonomy,
  };
}

/** Every reported fact for one concept, across taxonomies and units. */
function factsForConcept(facts: CompanyFacts, concept: string): XbrlFact[] {
  const rows: XbrlFact[] = [];

  for (const [taxonomy, concepts] of Object.entries(facts.facts ?? {})) {
    const entry = concepts[concept];
    if (entry === undefined) continue;

    for (const [unit, values] of Object.entries(entry.units ?? {})) {
      for (const row of values) {
        const fact = toFact(row, unit, concept, taxonomy);
        if (fact !== null) rows.push(fact);
      }
    }
  }

  return rows;
}

/**
 * Roughly how many days a duration fact covers.
 *
 * Used to tell a quarter from a year. An issuer tags both against the same
 * concept, so a "latest revenue" that ignores duration will happily return an
 * annual figure and label it a quarter — off by a factor of about four.
 */
function durationDays(fact: XbrlFact): number | null {
  if (fact.start === null) return null;
  const start = Date.parse(fact.start);
  const end = Date.parse(fact.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return (end - start) / 86_400_000;
}

export type PeriodKind = "quarter" | "annual" | "any";

function matchesPeriod(fact: XbrlFact, kind: PeriodKind, instant: boolean): boolean {
  if (instant) return fact.start === null || kind === "any";
  const days = durationDays(fact);
  if (days === null) return false;
  if (kind === "quarter") return days >= 60 && days <= 115;
  if (kind === "annual") return days >= 330 && days <= 400;
  return true;
}

export interface ResolvedMetric {
  metric: MetricId;
  label: string;
  fact: XbrlFact;
  /** Concepts that were tried and had nothing usable. For the quality notes. */
  concepts: string[];
}

/**
 * The value of a metric for the most recent matching period.
 *
 * Returns null rather than falling back to a different period or a different
 * duration. "We could not find quarterly revenue" is a fact a report can
 * state; an annual figure printed in a quarterly column is not recoverable by
 * anyone reading it.
 */
export function resolveMetric(
  facts: CompanyFacts,
  metric: MetricId,
  options: { period?: PeriodKind; endingOnOrBefore?: string } = {},
): ResolvedMetric | null {
  const definition = METRICS[metric];
  const period = options.period ?? "quarter";

  /* ---- Recency beats preference ----

     Every candidate concept is gathered BEFORE any is chosen. Taking the
     first concept that has any usable row looks reasonable and is wrong:
     NVIDIA stopped tagging revenue under
     `RevenueFromContractWithCustomerExcludingAssessedTax` after FY2022, but
     that concept still holds quarter-shaped comparatives from 2020. A
     preference-ordered loop returned a six-year-old figure as "latest
     revenue" — and the gross margin computed against it came out at 2323%.

     Preference order still matters, but only to break ties between concepts
     reporting the SAME period. */
  const candidates = definition.concepts.flatMap((concept, rank) =>
    factsForConcept(facts, concept)
      .filter((fact) => matchesPeriod(fact, period, definition.instant))
      .filter((fact) =>
        options.endingOnOrBefore === undefined
          ? true
          : fact.end <= options.endingOnOrBefore,
      )
      .map((fact) => ({ fact, rank })),
  );

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    /* Latest period first. */
    if (a.fact.end !== b.fact.end) return b.fact.end.localeCompare(a.fact.end);
    /* Same period: the preferred concept. */
    if (a.rank !== b.rank) return a.rank - b.rank;
    /* Same period and concept: the most recently FILED, which is how a
       restatement supersedes the original. */
    return (b.fact.filedAt ?? "").localeCompare(a.fact.filedAt ?? "");
  });

  return {
    metric,
    label: definition.label,
    fact: candidates[0].fact,
    concepts: definition.concepts,
  };
}

/**
 * Whether two facts describe the same reporting period.
 *
 * Required before any ratio between them. A gross margin built from this
 * quarter's gross profit and a prior year's revenue is not a wrong margin —
 * it is a number with no meaning, and it renders exactly like a real one.
 */
export function samePeriod(a: XbrlFact, b: XbrlFact): boolean {
  return a.end === b.end && (a.start ?? null) === (b.start ?? null);
}

/**
 * The issuer's own fiscal label for a period.
 *
 * ── Why this is not just `fact.fy` / `fact.fp` ─────────────────────────
 *
 * Those fields describe THE FILING THAT REPORTED THE FACT, not the period the
 * fact covers. NVIDIA's Q2 FY2026 revenue appears twice in company facts:
 * once tagged `fy=2026` in its own 10-Q, and again tagged `fy=2027` as the
 * prior-year comparative inside the FY2027 10-Q. Both describe the quarter
 * ending 2025-07-27.
 *
 * Reading the label off the newest occurrence — which is what a
 * restatement-aware sort naturally selects — labelled the prior-year column
 * "Q2 FY2027", identical to the current period.
 *
 * So the label comes from the EARLIEST filing that reported the period, which
 * is the filing whose own fiscal period it was. The VALUE still comes from
 * the latest filing, so a restatement still wins.
 */
export function fiscalLabelFor(
  facts: CompanyFacts,
  metric: MetricId,
  fact: XbrlFact,
): string {
  const definition = METRICS[metric];

  const sameSpan = definition.concepts
    .flatMap((concept) => factsForConcept(facts, concept))
    .filter(
      (candidate) =>
        candidate.end === fact.end && (candidate.start ?? null) === (fact.start ?? null),
    )
    .filter((candidate) => candidate.fiscalPeriod !== null && candidate.fiscalYear !== null)
    .sort((a, b) => (a.filedAt ?? "").localeCompare(b.filedAt ?? ""));

  const original = sameSpan[0];
  if (original !== undefined) {
    return `${original.fiscalPeriod} FY${original.fiscalYear}`;
  }

  /* No labelled occurrence. The dates are always true, so say those. */
  return `Period ended ${fact.end}`;
}

/**
 * The same metric for the equivalent period a year earlier.
 *
 * Matched on the DATE roughly twelve months back rather than on the fiscal
 * label. Labels drift — a 53-week year, a changed year-end — and comparing
 * "Q2" to "Q2" across a relabelled year silently compares the wrong quarters.
 */
export function resolvePriorYear(
  facts: CompanyFacts,
  metric: MetricId,
  current: XbrlFact,
): ResolvedMetric | null {
  const definition = METRICS[metric];
  const currentEnd = Date.parse(current.end);
  if (!Number.isFinite(currentEnd)) return null;

  const targetEnd = currentEnd - 365 * 86_400_000;
  const currentDays = durationDays(current);

  for (const concept of definition.concepts) {
    const candidates = factsForConcept(facts, concept)
      .filter((fact) => {
        const end = Date.parse(fact.end);
        if (!Number.isFinite(end)) return false;
        /* Within five weeks of a year ago: enough for a 52/53-week calendar
           and a shifted quarter end, tight enough not to catch a neighbour. */
        if (Math.abs(end - targetEnd) > 35 * 86_400_000) return false;

        if (definition.instant) return fact.start === null;

        /* The comparison period must be the same SHAPE. A year-ago annual
           figure is not the prior-year quarter. */
        const days = durationDays(fact);
        if (days === null || currentDays === null) return false;
        return Math.abs(days - currentDays) <= 20;
      })
      .sort((a, b) => (b.filedAt ?? "").localeCompare(a.filedAt ?? ""));

    if (candidates.length > 0) {
      return {
        metric,
        label: definition.label,
        fact: candidates[0],
        concepts: definition.concepts,
      };
    }
  }

  return null;
}
