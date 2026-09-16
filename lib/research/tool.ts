import "server-only";

import type { RegisteredTool } from "@/lib/agent/tools/registry";
import { ToolArgumentError } from "@/lib/agent/tools/args";
import { capabilities } from "@/lib/research/capabilities";
import { buildEarningsReport, headlineFor } from "@/lib/research/earnings";
import type { ReportMetric } from "@/lib/research/report";

/* ---------------------------------------------------------------------------
   Company research, as a tool the agent can call.

   ── What the model receives ────────────────────────────────────────────

   The finished, verified table — not the raw XBRL. Every figure here was
   computed by `calculations.ts` from facts carrying their own concept and
   accession, and anything unsupported was already removed by the verifier.

   The model's job is to explain it. It is told, in the description, that the
   numbers are authoritative and not to be recomputed — a model that "checks"
   a growth rate by dividing two figures it half-remembers will occasionally
   contradict the table it was handed.
--------------------------------------------------------------------------- */

function flatten(metrics: ReportMetric[]) {
  return metrics.map((metric) => ({
    label: metric.label,
    value: metric.value,
    change: metric.change ?? null,
    ...(metric.note === null || metric.note === undefined ? {} : { note: metric.note }),
  }));
}

export const companyResearch: RegisteredTool = {
  def: {
    name: "company_research",
    description:
      "A source-grounded financial report on a public company, built from SEC " +
      "filings and XBRL company facts. Use for any question about a listed " +
      "company's earnings, revenue, margins, cash flow or latest quarter — " +
      "'latest NVDA earnings', 'how did Microsoft do last quarter'. " +
      "Every figure returned is already computed and verified against its " +
      "filing: report them as given and do NOT recalculate growth rates or " +
      "margins yourself. Figures marked with a note were not disclosed; say " +
      "so rather than estimating them.",
    parameters: {
      type: "object",
      properties: {
        company: {
          type: "string",
          description: "Ticker, company name or SEC CIK — 'NVDA', 'NVIDIA', '1045810'.",
        },
      },
      required: ["company"],
    },
  },
  async execute(args) {
    if (typeof args.company !== "string" || args.company.trim().length === 0) {
      throw new ToolArgumentError("company_research needs a `company`.");
    }

    const sec = capabilities()["sec.resolve_company"];
    if (!sec.available) {
      return {
        error: sec.reason ?? "SEC data is not configured.",
        note: "Say that company research is not configured. Do not answer from memory.",
      };
    }

    const built = await buildEarningsReport({ query: args.company });

    if (!built.ok || built.data === undefined) {
      return {
        error: built.error?.message ?? "The report could not be built.",
        note:
          "Report this plainly. Do NOT fall back to remembered financials — " +
          "a figure without a filing behind it is not research.",
      };
    }

    const document = built.data;

    return {
      company: document.subject.name,
      ticker: document.subject.ticker,
      cik: document.subject.cik,
      period: document.period?.label ?? null,
      periodEnded: document.period?.end ?? null,
      comparisonPeriod: document.priorPeriod?.label ?? null,
      headline: headlineFor(document),
      sections: document.sections
        .map((section) => ({
          title: section.title,
          metrics: section.blocks.flatMap((block) =>
            block.kind === "metrics" ? flatten(block.metrics) : [],
          ),
          notes: section.blocks.flatMap((block) =>
            block.kind === "omission" ? [block.text] : [],
          ),
        }))
        .filter((section) => section.metrics.length > 0 || section.notes.length > 0),
      quality: document.quality.level,
      /* Surfaced so the answer can say what was left out, rather than the
         reader inferring the gap means nothing happened. */
      omitted: document.quality.omissions,
      sourceCount: document.sources.length,
      note:
        "Figures come from SEC filings and XBRL. Changes are year over year; " +
        "margin changes are in percentage points. Mention that a full PDF " +
        "report can be generated from the Research page.",
    };
  },
};
