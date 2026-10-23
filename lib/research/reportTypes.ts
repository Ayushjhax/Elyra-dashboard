/* ---------------------------------------------------------------------------
   A research report's row, as /api/research/reports returns it — apart from
   the store, which is server-only, so the website and the Android app read
   one definition.
--------------------------------------------------------------------------- */

/** How much of a report's content was checked against its filing. */
export type QualityLevel = "verified" | "verified_with_warnings" | "incomplete";

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

/** Whether a report has stopped moving. */
export function reportSettled(status: ReportStatus): boolean {
  return status === "complete" || status === "failed";
}
