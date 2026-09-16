/* ---------------------------------------------------------------------------
   The report document.

   A typed structure, not Markdown. Two reasons, and the second is the one
   that matters.

   A PDF renderer needs to know that a thing is a table in order to paginate
   it, keep its header with it, and avoid clipping a column. Markdown erases
   that: by the time a string says "| Revenue | $96,221M |" the renderer is
   guessing.

   And a report built from prose cannot be CHECKED. Every metric below carries
   the evidence it came from, so a verifier can walk the document and ask "is
   there a source for this number" mechanically. A paragraph containing
   "$96.2 billion" offers nothing to walk.

   Client-safe: no `server-only`, no I/O. The page renders these and the PDF
   renderer renders these, from the same object.
--------------------------------------------------------------------------- */

export type SourceKind =
  | "sec_filing"
  | "sec_xbrl"
  | "company_ir"
  | "market_data"
  | "protocol_api"
  | "token_unlock_provider";

export interface ResearchSource {
  /** Referenced from metrics as "S1", "S2". Stable within one report. */
  id: string;
  kind: SourceKind;
  /** "NVIDIA Corporation 10-Q, filed 2026-08-26". Already written for a person. */
  label: string;
  /** Where it came from. Shown in the appendix, never inline. */
  url: string | null;
  /** SEC accession, for a filing. */
  accession?: string | null;
  /** The XBRL concept, for a tagged fact. */
  concept?: string | null;
  /** When the underlying data was published or read. */
  asOf: string | null;
}

export type AgreementStatus =
  | "confirmed"
  | "minor_rounding_difference"
  | "conflict"
  | "single_source"
  | "unavailable";

export interface ReportMetric {
  label: string;
  /** Already formatted: "$96,221M", "75.0%", "$2.46". */
  value: string;
  /** The raw number, so a verifier can re-check arithmetic. */
  raw: number | null;
  unit: string | null;
  /** Change against the comparison period, formatted. */
  change?: string | null;
  changeDirection?: "up" | "down" | "flat" | null;
  /** Source ids. EMPTY MEANS UNSOURCED, which the verifier rejects. */
  sources: string[];
  agreement?: AgreementStatus;
  /** True when this is a company-defined non-GAAP measure. */
  nonGaap?: boolean;
  /** Stated when a figure could not be produced, instead of omitting silently. */
  note?: string | null;
}

export interface ReportTable {
  caption: string | null;
  columns: string[];
  /** Cells are pre-formatted strings; the renderer does no arithmetic. */
  rows: string[][];
  sources: string[];
}

export type ReportBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "metrics"; metrics: ReportMetric[] }
  | { kind: "table"; table: ReportTable }
  | { kind: "bullets"; items: string[] }
  /** A stated absence. Rendered visibly — never silently dropped. */
  | { kind: "omission"; text: string };

export interface ReportSection {
  id: string;
  title: string;
  blocks: ReportBlock[];
}

export type QualityLevel = "verified" | "verified_with_warnings" | "incomplete";

export interface QualityCheck {
  id: string;
  label: string;
  passed: boolean;
  /** Why it failed, or what the caveat is. */
  detail: string | null;
}

export interface ReportSubject {
  /** "NVIDIA Corporation". */
  name: string;
  /** "NVDA". */
  ticker: string | null;
  /** SEC CIK, for a registrant. */
  cik: string | null;
}

export interface ReportPeriod {
  /** "Q2 FY2027". The issuer's own label. */
  label: string;
  /** The real dates. Comparisons use these, never the label. */
  start: string | null;
  end: string;
}

export interface ResearchReportDocument {
  id: string;
  /** "NVIDIA Corporation — Q2 FY2027 Earnings". */
  title: string;
  kind: "earnings" | "10-K" | "10-Q" | "custom";
  subject: ReportSubject;
  period: ReportPeriod | null;
  /** The comparison period, where one was found. */
  priorPeriod: ReportPeriod | null;
  generatedAt: string;
  sections: ReportSection[];
  sources: ResearchSource[];
  quality: {
    level: QualityLevel;
    checks: QualityCheck[];
    /** Capabilities that were unavailable, as stated omissions. */
    omissions: string[];
  };
}

/* ---------------------------------------------------------------------------
   Formatting

   Centralised so a figure reads the same in the web report, the PDF and the
   Telegram summary. Three renderers formatting independently is three chances
   for the same number to appear three ways.
--------------------------------------------------------------------------- */

/** A large USD figure, scaled to the unit a reader expects. */
export function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/** Per-share figures keep cents; scaling them would lose the whole number. */
export function formatPerShare(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** A signed change, so direction is readable without colour. */
export function formatChange(value: number | null, digits = 1): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function directionOf(value: number | null): "up" | "down" | "flat" | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (Math.abs(value) < 0.05) return "flat";
  return value > 0 ? "up" : "down";
}

/* ---------------------------------------------------------------------------
   Verification
--------------------------------------------------------------------------- */

export interface VerificationResult {
  level: QualityLevel;
  checks: QualityCheck[];
  /** Metrics stripped because nothing supported them. */
  removed: string[];
}

/**
 * Walks a finished document and checks it mechanically.
 *
 * ── Why this exists rather than asking the model ───────────────────────
 *
 * A model asked "did you check your work?" answers yes. The checks below
 * either pass or do not, and the ones that matter — is every figure sourced,
 * is GAAP kept apart from non-GAAP, is there an appendix — are structural
 * properties of the document rather than judgements about it.
 *
 * MUTATES: an unsourced metric is removed, not flagged. A number with no
 * evidence in a report that carries a source appendix is worse than no
 * number, because the appendix implies everything in it was checked.
 */
export function verifyReport(document: ResearchReportDocument): VerificationResult {
  const checks: QualityCheck[] = [];
  const removed: string[] = [];
  const sourceIds = new Set(document.sources.map((source) => source.id));

  /* ---- Every metric must cite a source that exists ---- */
  for (const section of document.sections) {
    for (const block of section.blocks) {
      if (block.kind !== "metrics") continue;

      const kept: ReportMetric[] = [];
      for (const metric of block.metrics) {
        /* A metric with a note and no value is a stated absence, which is
           allowed and is the point — "not disclosed" needs no source. */
        if (metric.raw === null && metric.note !== null && metric.note !== undefined) {
          kept.push(metric);
          continue;
        }

        const cited = metric.sources.filter((id) => sourceIds.has(id));
        if (cited.length === 0) {
          removed.push(`${section.title} · ${metric.label}`);
          continue;
        }
        kept.push({ ...metric, sources: cited });
      }
      block.metrics = kept;
    }
  }

  checks.push({
    id: "sourced",
    label: "Every figure cites a source",
    passed: removed.length === 0,
    detail:
      removed.length === 0
        ? null
        : `${removed.length} unsupported figure(s) were removed: ${removed.join("; ")}.`,
  });

  /* ---- Subject and period must be established ---- */
  checks.push({
    id: "entity",
    label: "Company identified against SEC records",
    passed: document.subject.cik !== null,
    detail: document.subject.cik === null ? "No CIK was resolved." : null,
  });

  checks.push({
    id: "period",
    label: "Reporting period established",
    passed: document.period !== null,
    detail: document.period === null ? "No reporting period was determined." : null,
  });

  /* ---- Conflicts are surfaced, never hidden ---- */
  const conflicts: string[] = [];
  for (const section of document.sections) {
    for (const block of section.blocks) {
      if (block.kind !== "metrics") continue;
      for (const metric of block.metrics) {
        if (metric.agreement === "conflict") {
          conflicts.push(`${section.title} · ${metric.label}`);
        }
      }
    }
  }
  checks.push({
    id: "conflicts",
    label: "Sources agree on cross-referenced figures",
    passed: conflicts.length === 0,
    detail: conflicts.length === 0 ? null : `Sources disagree on: ${conflicts.join("; ")}.`,
  });

  /* ---- GAAP and non-GAAP must not be presented as the same thing ---- */
  const nonGaap = document.sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.kind === "metrics" ? block.metrics.filter((m) => m.nonGaap === true) : [],
    ),
  );
  checks.push({
    id: "gaap",
    label: "GAAP and non-GAAP measures kept separate",
    passed: nonGaap.every((metric) => /adjusted|non-gaap/i.test(metric.label)),
    detail: nonGaap.length === 0 ? null : `${nonGaap.length} non-GAAP measure(s) present.`,
  });

  /* ---- The appendix is what makes citations checkable ---- */
  checks.push({
    id: "appendix",
    label: "Source appendix present",
    passed: document.sources.length > 0,
    detail: document.sources.length === 0 ? "No sources were recorded." : null,
  });

  const failed = checks.filter((check) => !check.passed);

  /* Entity and period failing means the report is about nothing identifiable;
     everything else is a caveat on a report that still stands. */
  const structural = failed.some((check) => check.id === "entity" || check.id === "period");

  return {
    level: structural
      ? "incomplete"
      : failed.length > 0 || document.quality.omissions.length > 0
        ? "verified_with_warnings"
        : "verified",
    checks,
    removed,
  };
}
