import "server-only";

import { checkCapabilities } from "@/lib/research/capabilities";
import {
  freeCashFlow,
  margin,
  marginChangePoints,
  yearOverYear,
} from "@/lib/research/calculations";
import {
  directionOf,
  formatChange,
  formatPerShare,
  formatPercent,
  formatUsd,
  verifyReport,
  type ReportBlock,
  type ReportMetric,
  type ReportSection,
  type ResearchReportDocument,
  type ResearchSource,
} from "@/lib/research/report";
import { resolveEntity } from "@/lib/research/sec/entities";
import {
  companySubmissions,
  earningsExhibit,
  filingExhibits,
  findEarningsFilings,
  type SecFiling,
} from "@/lib/research/sec/filings";
import {
  companyFacts,
  fiscalLabelFor,
  resolveMetric,
  resolvePriorYear,
  samePeriod,
  type MetricId,
  type ResolvedMetric,
} from "@/lib/research/sec/xbrl";
import { fail, ok, type ToolResult } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   An earnings report, assembled from SEC evidence.

   ── Order of operations ────────────────────────────────────────────────

   Capabilities are checked, then the company is resolved against the SEC's
   own mapping, then the PERIOD is established, and only then are figures
   fetched. Doing it the other way round — fetching first and deciding what
   period the numbers describe afterwards — is how a report ends up comparing
   two different quarters.

   ── Every number here is computed, not written ─────────────────────────

   No model produces a figure in this file. Growth, margins and free cash flow
   come from `calculations.ts`; the values come from XBRL with their concept
   and accession attached. A model's role is to explain the finished table,
   and it is given the table rather than the raw facts.

   ── Absence is a first-class output ────────────────────────────────────

   A metric the issuer did not tag becomes a visible "not disclosed" row, and
   a capability this deployment lacks becomes a stated omission in the quality
   block. Neither is silently dropped, because a gap in a sourced report reads
   as "there was nothing to report".
--------------------------------------------------------------------------- */

const REQUIRED = [
  "sec.resolve_company",
  "sec.fetch_submissions",
  "sec.fetch_xbrl",
  "sec.fetch_filing",
] as const;

const OPTIONAL = [
  "sec.fetch_earnings_materials",
  "company_ir.fetch",
  "market.equity_price",
] as const;

/** A metric plus everything needed to render and verify it. */
interface Prepared {
  metric: ReportMetric;
  resolved: ResolvedMetric | null;
}

function sourceIdFor(resolved: ResolvedMetric): string {
  /* One source per (concept, accession): two metrics from the same filing and
     the same tag are the same evidence, and duplicating it would inflate the
     appendix without adding corroboration. */
  return `xbrl:${resolved.fact.concept}:${resolved.fact.accession ?? "na"}`;
}

function xbrlSource(resolved: ResolvedMetric, company: string): ResearchSource {
  return {
    id: sourceIdFor(resolved),
    kind: "sec_xbrl",
    label: `${company} — ${resolved.fact.form ?? "SEC filing"} XBRL, ${resolved.fact.concept}`,
    url:
      resolved.fact.accession === null
        ? null
        : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum=${resolved.fact.accession}`,
    accession: resolved.fact.accession,
    concept: resolved.fact.concept,
    asOf: resolved.fact.filedAt,
  };
}

function filingSource(filing: SecFiling, company: string): ResearchSource {
  return {
    id: `filing:${filing.accession}`,
    kind: "sec_filing",
    label: `${company} — ${filing.form}, filed ${filing.filedAt}${
      filing.periodEnd === null ? "" : ` (period ended ${filing.periodEnd})`
    }`,
    url: filing.documentUrl ?? filing.indexUrl,
    accession: filing.accession,
    asOf: filing.filedAt,
  };
}

/** A currency metric with its year-over-year change. */
function moneyMetric(
  label: string,
  current: ResolvedMetric | null,
  prior: ResolvedMetric | null,
  company: string,
  sources: Map<string, ResearchSource>,
  perShare = false,
): Prepared {
  if (current === null) {
    return {
      /* A stated absence rather than a missing row. The issuer may simply not
         tag this concept, which is a fact about the filing worth showing. */
      metric: {
        label,
        value: "—",
        raw: null,
        unit: null,
        sources: [],
        note: "Not disclosed in the period's XBRL data.",
      },
      resolved: null,
    };
  }

  const source = xbrlSource(current, company);
  sources.set(source.id, source);

  const change = prior === null ? null : yearOverYear(current.fact.value, prior.fact.value);

  return {
    metric: {
      label,
      value: perShare
        ? formatPerShare(current.fact.value)
        : formatUsd(current.fact.value),
      raw: current.fact.value,
      unit: current.fact.unit,
      change: formatChange(change),
      changeDirection: directionOf(change),
      sources: [source.id],
      /* One tagged fact is one source. Calling that "confirmed" would tell
         the reader it was cross-checked when nothing checked it. */
      agreement: "single_source",
    },
    resolved: current,
  };
}

export interface EarningsReportInput {
  /** Ticker, company name or CIK, as the user typed it. */
  query: string;
}

/**
 * Builds the earnings report.
 *
 * Returns a verified document or a failure with a reason. Never returns a
 * partially-assembled document as though it were complete.
 */
export async function buildEarningsReport(
  input: EarningsReportInput,
): Promise<ToolResult<ResearchReportDocument>> {
  const gate = checkCapabilities(REQUIRED, OPTIONAL);
  if (!gate.ok) {
    return fail<ResearchReportDocument>(
      "sec",
      "UNSUPPORTED",
      gate.missing.map((row) => row.reason).join(" "),
    );
  }

  /* ---- Entity ---- */
  const entity = await resolveEntity(input.query);
  if (!entity.ok || entity.data === undefined) {
    return fail<ResearchReportDocument>(
      "sec",
      entity.error?.code ?? "NOT_FOUND",
      entity.error?.message ?? `No SEC registrant matches "${input.query}".`,
    );
  }

  const { entity: company, alternatives } = entity.data;

  /* ---- Filings ---- */
  const submissions = await companySubmissions(company.cik);
  if (!submissions.ok || submissions.data === undefined) {
    return fail<ResearchReportDocument>(
      "sec",
      submissions.error?.code ?? "UPSTREAM_UNAVAILABLE",
      submissions.error?.message ?? "SEC filings could not be read.",
    );
  }

  const earnings = findEarningsFilings(submissions.data.filings);
  if (earnings.periodicReport === null) {
    return fail<ResearchReportDocument>(
      "sec",
      "NOT_FOUND",
      `${company.companyName} has no recent 10-Q or 10-K on file.`,
    );
  }

  /* ---- Facts ---- */
  const facts = await companyFacts(company.cik);
  if (!facts.ok || facts.data === undefined) {
    return fail<ResearchReportDocument>(
      "sec",
      facts.error?.code ?? "UPSTREAM_UNAVAILABLE",
      facts.error?.message ?? "SEC XBRL facts could not be read.",
    );
  }

  const raw = facts.data.raw;
  const isAnnual = earnings.periodicReport.formKind === "10-K";
  const period = isAnnual ? "annual" : "quarter";

  const sources = new Map<string, ResearchSource>();
  const periodicSource = filingSource(earnings.periodicReport, company.companyName);
  sources.set(periodicSource.id, periodicSource);

  const pick = (metric: MetricId): ResolvedMetric | null =>
    resolveMetric(raw, metric, { period });

  const revenue = pick("revenue");
  const grossProfit = pick("grossProfit");
  const operatingIncome = pick("operatingIncome");
  const netIncome = pick("netIncome");
  const dilutedEps = pick("dilutedEps");
  const operatingCashFlow = pick("operatingCashFlow");
  const capex = pick("capex");
  const cash = resolveMetric(raw, "cash", { period: "any" });
  const totalAssets = resolveMetric(raw, "totalAssets", { period: "any" });

  if (revenue === null) {
    return fail<ResearchReportDocument>(
      "sec",
      "NOT_FOUND",
      `No ${period === "annual" ? "annual" : "quarterly"} revenue is tagged in ` +
        `${company.companyName}'s XBRL data, so an earnings report cannot be built.`,
    );
  }

  const prior = (metric: MetricId, current: ResolvedMetric | null) =>
    current === null ? null : resolvePriorYear(raw, metric, current.fact);

  /* ---- Scorecard ---- */
  const scorecard: Prepared[] = [
    moneyMetric("Revenue", revenue, prior("revenue", revenue), company.companyName, sources),
    moneyMetric("Gross profit", grossProfit, prior("grossProfit", grossProfit), company.companyName, sources),
    moneyMetric("Operating income", operatingIncome, prior("operatingIncome", operatingIncome), company.companyName, sources),
    moneyMetric("Net income", netIncome, prior("netIncome", netIncome), company.companyName, sources),
    moneyMetric("Diluted EPS (GAAP)", dilutedEps, prior("dilutedEps", dilutedEps), company.companyName, sources, true),
  ];

  /* ---- Margins ----

     Only computed when both facts describe the SAME period. A margin built
     from this quarter's gross profit and a stale revenue figure is not a
     wrong margin; it is a number with no meaning that renders like a real
     one — which is exactly what happened before `samePeriod` existed. */
  const marginMetrics: ReportMetric[] = [];

  const marginRow = (
    label: string,
    component: ResolvedMetric | null,
    priorComponent: ResolvedMetric | null,
  ): void => {
    if (component === null || !samePeriod(component.fact, revenue.fact)) {
      marginMetrics.push({
        label,
        value: "—",
        raw: null,
        unit: null,
        sources: [],
        note:
          component === null
            ? "Not disclosed for this period."
            : "Not computed — the underlying figures describe different periods.",
      });
      return;
    }

    const current = margin(component.fact.value, revenue.fact.value);
    const priorRevenue = prior("revenue", revenue);
    const previous =
      priorComponent === null || priorRevenue === null
        ? null
        : samePeriod(priorComponent.fact, priorRevenue.fact)
          ? margin(priorComponent.fact.value, priorRevenue.fact.value)
          : null;

    const points = marginChangePoints(current, previous);
    const source = xbrlSource(component, company.companyName);
    sources.set(source.id, source);

    marginMetrics.push({
      label,
      value: formatPercent(current),
      raw: current,
      unit: "percent",
      /* Margins move in POINTS. "Margin rose 25%" for a 60→75 move is the
         most common way a financial summary misleads. */
      change: points === null ? null : `${points >= 0 ? "+" : ""}${points.toFixed(1)} pts`,
      changeDirection: directionOf(points),
      sources: [source.id, sourceIdFor(revenue)],
      agreement: "single_source",
    });
  };

  marginRow("Gross margin", grossProfit, prior("grossProfit", grossProfit));
  marginRow("Operating margin", operatingIncome, prior("operatingIncome", operatingIncome));

  /* ---- Cash ---- */
  const fcf =
    operatingCashFlow === null || capex === null || !samePeriod(operatingCashFlow.fact, capex.fact)
      ? null
      : freeCashFlow(operatingCashFlow.fact.value, capex.fact.value);

  const cashMetrics: ReportMetric[] = [
    moneyMetric("Operating cash flow", operatingCashFlow, prior("operatingCashFlow", operatingCashFlow), company.companyName, sources).metric,
    moneyMetric("Capital expenditure", capex, prior("capex", capex), company.companyName, sources).metric,
    fcf === null
      ? {
          label: "Free cash flow",
          value: "—",
          raw: null,
          unit: null,
          sources: [],
          note: "Not computed — operating cash flow and capital expenditure were not both available for this period.",
        }
      : {
          label: "Free cash flow",
          value: formatUsd(fcf),
          raw: fcf,
          unit: "USD",
          sources: [sourceIdFor(operatingCashFlow!), sourceIdFor(capex!)],
          agreement: "single_source",
          note: "Operating cash flow less capital expenditure. FCF has no single authoritative definition.",
        },
  ];

  /* ---- Balance sheet ---- */
  const balanceMetrics: ReportMetric[] = [
    moneyMetric("Cash and equivalents", cash, null, company.companyName, sources).metric,
    moneyMetric("Total assets", totalAssets, null, company.companyName, sources).metric,
  ];

  /* ---- Announcement ---- */
  const announcementBlocks: ReportBlock[] = [];
  if (earnings.announcement !== null) {
    const source = filingSource(earnings.announcement, company.companyName);
    sources.set(source.id, source);

    announcementBlocks.push({
      kind: "paragraph",
      text:
        `${company.companyName} announced these results in an 8-K filed ` +
        `${earnings.announcement.filedAt} under Item 2.02 (Results of Operations ` +
        `and Financial Condition).`,
    });

    const exhibits = await filingExhibits(earnings.announcement);
    if (exhibits.ok && exhibits.data !== undefined) {
      const release = earningsExhibit(exhibits.data);
      if (release !== null) {
        const releaseSource: ResearchSource = {
          id: `exhibit:${earnings.announcement.accession}:${release.fileName}`,
          kind: "sec_filing",
          label: `${company.companyName} — earnings press release (${release.type})`,
          url: release.url,
          accession: earnings.announcement.accession,
          asOf: earnings.announcement.filedAt,
        };
        sources.set(releaseSource.id, releaseSource);
        announcementBlocks.push({
          kind: "paragraph",
          text: `The press release was filed as exhibit ${release.type}.`,
        });
      } else {
        announcementBlocks.push({
          kind: "omission",
          text: "No press-release exhibit was identified in the announcement.",
        });
      }
    }
  } else {
    announcementBlocks.push({
      kind: "omission",
      text:
        "No earnings announcement under Item 2.02 was found for this period. " +
        "Figures below come from the periodic report and its XBRL data.",
    });
  }

  /* ---- Assembly ---- */
  /* Labels come from the filing whose own period this was — see
     `fiscalLabelFor`. Reading them off the fact directly labelled the
     prior-year column with the CURRENT fiscal year. */
  const periodLabel = fiscalLabelFor(raw, "revenue", revenue.fact);

  const priorRevenue = prior("revenue", revenue);

  const sections: ReportSection[] = [
    {
      id: "scorecard",
      title: "Earnings scorecard",
      blocks: [{ kind: "metrics", metrics: scorecard.map((row) => row.metric) }],
    },
    {
      id: "margins",
      title: "Margins",
      blocks: [{ kind: "metrics", metrics: marginMetrics }],
    },
    { id: "cash", title: "Cash flow", blocks: [{ kind: "metrics", metrics: cashMetrics }] },
    {
      id: "balance",
      title: "Balance sheet",
      blocks: [{ kind: "metrics", metrics: balanceMetrics }],
    },
    { id: "announcement", title: "Filing and announcement", blocks: announcementBlocks },
  ];

  /* Ambiguity is reported rather than resolved silently — a report about the
     wrong "Delta" is wrong in a way nothing downstream detects. */
  if (alternatives.length > 0) {
    sections.push({
      id: "entity-note",
      title: "Entity resolution",
      blocks: [
        {
          kind: "omission",
          text:
            `"${input.query}" also matches ${alternatives
              .slice(0, 3)
              .map((row) => `${row.companyName} (CIK ${row.cik})`)
              .join(", ")}. This report covers ${company.companyName}.`,
        },
      ],
    });
  }

  const omissions = gate.omitted.map((row) => row.reason);

  const document: ResearchReportDocument = {
    id: `${company.ticker}-${revenue.fact.end}`,
    title: `${company.companyName} — ${periodLabel} ${isAnnual ? "Annual" : "Earnings"} Report`,
    kind: isAnnual ? "10-K" : "earnings",
    subject: { name: company.companyName, ticker: company.ticker, cik: company.cik },
    period: {
      label: periodLabel,
      start: revenue.fact.start,
      end: revenue.fact.end,
    },
    priorPeriod:
      priorRevenue === null
        ? null
        : {
            label: fiscalLabelFor(raw, "revenue", priorRevenue.fact),
            start: priorRevenue.fact.start,
            end: priorRevenue.fact.end,
          },
    generatedAt: new Date().toISOString(),
    sections,
    sources: [...sources.values()],
    quality: { level: "verified", checks: [], omissions },
  };

  /* Verification MUTATES: an unsourced figure is removed, not flagged. */
  const verification = verifyReport(document);
  document.quality = {
    level: verification.level,
    checks: verification.checks,
    omissions,
  };

  return ok(document, "sec", { asOf: facts.asOf });
}

/**
 * A one-line takeaway, computed rather than written.
 *
 * Used for the Telegram summary and the report's opening line. Deliberately
 * mechanical: it states what the numbers did, and leaves interpretation to
 * the analysis layer.
 */
export function headlineFor(document: ResearchReportDocument): string {
  const scorecard = document.sections.find((section) => section.id === "scorecard");
  const metrics =
    scorecard?.blocks.find((block) => block.kind === "metrics")?.metrics ?? [];

  const revenue = metrics.find((metric) => metric.label === "Revenue");
  if (revenue === undefined || revenue.raw === null) {
    return `${document.subject.name} — ${document.period?.label ?? "latest period"}.`;
  }

  const change =
    revenue.change === null || revenue.change === undefined
      ? ""
      : ` (${revenue.change} year over year)`;

  return `${document.subject.name} reported revenue of ${revenue.value}${change} for ${document.period?.label ?? "the period"}.`;
}

