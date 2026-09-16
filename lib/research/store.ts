import "server-only";

import { serviceClient } from "@/lib/supabase/server";
import { buildEarningsReport, headlineFor } from "@/lib/research/earnings";
import type { QualityLevel, ResearchReportDocument } from "@/lib/research/report";

/* ---------------------------------------------------------------------------
   Running a report, storing it, and handing it back.

   ── Why the row is created first ───────────────────────────────────────

   A report takes seconds: several SEC round trips through a rate limiter, a
   document build, a PDF render. The row is written before any of that, so a
   caller gets an id immediately and the work happens behind it. A Telegram
   webhook that waited for the whole pipeline would be retried by Telegram
   halfway through and would run it twice.

   ── Why the PDF lives in object storage ────────────────────────────────

   A twelve-kilobyte PDF would fit in a column, and putting it there would
   make every listing query drag every report's bytes across the wire. It
   goes to Supabase Storage in a PRIVATE bucket; the path is stored and the
   download route re-checks ownership before signing a short-lived URL.

   The path is deliberately not guessable AND not trusted: `user_id/report_id`
   means a leaked path still resolves to a row whose owner is checked.
--------------------------------------------------------------------------- */

const BUCKET = "research-reports";

export type ReportStatus =
  | "queued"
  | "resolving"
  | "collecting"
  | "analyzing"
  | "rendering"
  | "complete"
  | "failed";

export interface ReportRecord {
  id: string;
  query: string;
  kind: string;
  subjectName: string | null;
  subjectTicker: string | null;
  periodLabel: string | null;
  status: ReportStatus;
  statusDetail: string | null;
  quality: QualityLevel | null;
  hasPdf: boolean;
  pdfBytes: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface Row {
  id: string;
  query: string;
  kind: string;
  subject_name: string | null;
  subject_ticker: string | null;
  subject_cik: string | null;
  period_label: string | null;
  status: string;
  status_detail: string | null;
  quality: string | null;
  document: unknown;
  pdf_path: string | null;
  pdf_bytes: number | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

function toRecord(row: Row): ReportRecord {
  return {
    id: row.id,
    query: row.query,
    kind: row.kind,
    subjectName: row.subject_name,
    subjectTicker: row.subject_ticker,
    periodLabel: row.period_label,
    status: row.status as ReportStatus,
    statusDetail: row.status_detail,
    quality: row.quality as QualityLevel | null,
    /* Derived from the path rather than exposed: a client has no use for a
       storage key and every use for "is there a file". */
    hasPdf: row.pdf_path !== null,
    pdfBytes: row.pdf_bytes,
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

/** Creates the row and returns its id. The work runs after this. */
export async function createReport(input: {
  userId: string;
  query: string;
  kind: "earnings" | "10-K" | "10-Q" | "custom";
}): Promise<string | null> {
  const { data, error } = await serviceClient()
    .from("research_reports")
    .insert({
      user_id: input.userId,
      query: input.query,
      kind: input.kind,
      status: "queued",
      status_detail: "Queued.",
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    /* The message, not just the code. PGRST205 means the table is absent,
       which is an operator problem with an exact fix, and logging only a code
       sent me looking at the wrong layer. */
    console.error(
      "[research] could not create report:",
      error?.message ?? "no row returned",
    );
    return null;
  }
  return data.id;
}

async function advance(
  reportId: string,
  status: ReportStatus,
  detail: string,
): Promise<void> {
  await serviceClient()
    .from("research_reports")
    .update({ status, status_detail: detail, updated_at: new Date().toISOString() })
    .eq("id", reportId);
}

async function markFailed(reportId: string, reason: string): Promise<void> {
  await serviceClient()
    .from("research_reports")
    .update({
      status: "failed",
      status_detail: null,
      error: reason,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq("id", reportId);
}

export interface RunOutcome {
  ok: boolean;
  document?: ResearchReportDocument;
  headline?: string;
  error?: string;
}

/**
 * Runs the pipeline for a created report.
 *
 * Every failure path writes a REASON to the row. A report that fails silently
 * leaves the user watching a spinner, and "something went wrong" is not
 * something they can act on — "NVDA has no recent 10-Q on file" is.
 */
export async function runReport(input: {
  reportId: string;
  userId: string;
  query: string;
}): Promise<RunOutcome> {
  try {
    /* The row must exist before any work starts. Without this the updates
       below silently match zero rows and the pipeline reports success for a
       report nobody can ever read — which is exactly what happened when the
       migration had not been applied. */
    const { data: exists } = await serviceClient()
      .from("research_reports")
      .select("id")
      .eq("id", input.reportId)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (!exists) {
      return {
        ok: false,
        error:
          "That report record does not exist. The research_reports table may " +
          "not have been created — apply migration 0009.",
      };
    }

    await advance(input.reportId, "resolving", "Resolving the company against SEC records…");

    const built = await buildEarningsReport({ query: input.query });

    if (!built.ok || built.data === undefined) {
      const reason = built.error?.message ?? "The report could not be built.";
      await markFailed(input.reportId, reason);
      return { ok: false, error: reason };
    }

    const document = built.data;
    await advance(input.reportId, "rendering", "Rendering the PDF…");

    let pdfPath: string | null = null;
    let pdfBytes: number | null = null;

    try {
      /* Imported here, not at module scope. The PDF engine is a large
         dependency, and anything importing this module — the Telegram
         command router among them — would otherwise pay to load it on every
         cold start just to read a report row. */
      const { renderReportPdf } = await import("@/lib/research/pdf");
      const pdf = await renderReportPdf(document);
      /* Scoped by user so a leaked path still lands inside an ownership
         check, and suffixed with the report id so re-running never
         overwrites a report someone already downloaded. */
      const path = `${input.userId}/${input.reportId}.pdf`;

      const upload = await serviceClient()
        .storage.from(BUCKET)
        .upload(path, pdf.buffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (upload.error) {
        /* The document is still good. A missing PDF is a degraded result,
           not a failed report — the web version renders from the same
           document. */
        console.error("[research] pdf upload failed", upload.error.message);
      } else {
        pdfPath = path;
        pdfBytes = pdf.bytes;
      }
    } catch (error: unknown) {
      console.error("[research] pdf render failed", error);
    }

    await serviceClient()
      .from("research_reports")
      .update({
        status: "complete",
        status_detail: null,
        subject_name: document.subject.name,
        subject_ticker: document.subject.ticker,
        subject_cik: document.subject.cik,
        period_label: document.period?.label ?? null,
        kind: document.kind,
        quality: document.quality.level,
        document,
        pdf_path: pdfPath,
        pdf_bytes: pdfBytes,
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", input.reportId);

    return { ok: true, document, headline: headlineFor(document) };
  } catch (error: unknown) {
    const reason =
      error instanceof Error ? error.message : "The report pipeline failed.";
    await markFailed(input.reportId, reason);
    return { ok: false, error: reason };
  }
}

/* ---------------------------------------------------------------------------
   Reading
--------------------------------------------------------------------------- */

const COLUMNS =
  "id, query, kind, subject_name, subject_ticker, subject_cik, period_label, status, status_detail, quality, document, pdf_path, pdf_bytes, error, created_at, completed_at";

export async function listReports(
  userId: string,
  limit = 25,
): Promise<ReportRecord[]> {
  const { data } = await serviceClient()
    .from("research_reports")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  return (data ?? []).map((row) => toRecord(row as unknown as Row));
}

export interface FullReport extends ReportRecord {
  document: ResearchReportDocument | null;
}

/**
 * One report, for its owner.
 *
 * `userId` is filtered on rather than compared afterwards. The service-role
 * client bypasses RLS, so this filter IS the ownership boundary — and an id
 * being a uuid is not a substitute for checking who is asking.
 */
export async function getReport(
  reportId: string,
  userId: string,
): Promise<FullReport | null> {
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return null;

  const { data } = await serviceClient()
    .from("research_reports")
    .select(COLUMNS)
    .eq("id", reportId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  const row = data as unknown as Row;
  return {
    ...toRecord(row),
    document: (row.document as ResearchReportDocument | null) ?? null,
  };
}

/**
 * A short-lived download URL, for the owner only.
 *
 * Signed rather than public: the bucket is private, so a URL that leaks stops
 * working instead of exposing the report indefinitely. Sixty seconds is
 * enough to follow a link and not enough to be worth passing on.
 */
export async function signedPdfUrl(
  reportId: string,
  userId: string,
): Promise<string | null> {
  const { data } = await serviceClient()
    .from("research_reports")
    .select("pdf_path")
    .eq("id", reportId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.pdf_path) return null;

  const signed = await serviceClient()
    .storage.from(BUCKET)
    .createSignedUrl(data.pdf_path, 60);

  if (signed.error) {
    console.error("[research] could not sign pdf url", signed.error.message);
    return null;
  }
  return signed.data?.signedUrl ?? null;
}

export { BUCKET as RESEARCH_BUCKET };
