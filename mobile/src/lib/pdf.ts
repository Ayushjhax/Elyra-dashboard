import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { apiUrl, authHeaders, ApiError } from "~/lib/api";

/* ---------------------------------------------------------------------------
   A research PDF, on the phone.

   Downloaded with expo-file-system into the app's cache — never to shared
   storage, so the app needs no storage permission — then handed to another
   app: opened in the phone's PDF viewer, or shared through the system
   sheet. A download that fails throws, and the caller says why; a
   half-written file is removed rather than opened.

   Two sources, both the API's:
   - a backtest's PDF is rendered on request, so it is fetched directly with
     the session's headers;
   - a report's PDF is stored, and the API answers with a link signed for
     sixty seconds (`?as=json`), fetched with no headers of ours — the
     session token is for Elyra's API, not for the storage behind it.
--------------------------------------------------------------------------- */

const MIME = "application/pdf";

function folder(): Directory {
  const directory = new Directory(Paths.cache, "research");
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

/** "NVIDIA CORP Q2 FY2027" → "NVIDIA-CORP-Q2-FY2027.pdf". */
export function pdfName(title: string): string {
  const base = title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base.length > 0 ? base : "Elyra-report"}.pdf`;
}

async function download(url: string, name: string, headers: Record<string, string> | undefined): Promise<File> {
  const target = new File(folder(), name);
  try {
    return await File.downloadFileAsync(url, target, { idempotent: true, ...(headers ? { headers } : {}) });
  } catch (error) {
    if (target.exists) target.delete();
    const status = /status: (\d{3})/.exec(error instanceof Error ? error.message : "")?.[1];
    throw new ApiError(
      status === "429"
        ? "Too many requests. Wait a moment and try again."
        : status === "401"
          ? "Your session has ended. Sign in again."
          : "The PDF could not be downloaded. Try again.",
      status === undefined ? 0 : Number(status),
    );
  }
}

/** A backtest's PDF, rendered by the API from the saved result. */
export async function backtestPdf(id: string, title: string): Promise<File> {
  return download(apiUrl(`/api/backtest/results/${encodeURIComponent(id)}/pdf`), pdfName(title), await authHeaders(MIME));
}

/** A report's stored PDF, through the short-lived link the API signs for it. */
export async function reportPdf(signedUrl: string, title: string): Promise<File> {
  return download(signedUrl, pdfName(title), undefined);
}

/** Opens the PDF in another app on the phone. */
export async function openPdf(file: File, title: string): Promise<void> {
  if (!(await File.canPreview(file, { mimeType: MIME }))) {
    throw new ApiError("No app on this phone opens PDFs. Share it instead.", 0);
  }
  await File.preview(file, { mimeType: MIME, title });
}

/** The system share sheet, for the PDF. */
export async function sharePdf(file: File, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new ApiError("Sharing is not available on this phone.", 0);
  await Sharing.shareAsync(file.uri, { mimeType: MIME, dialogTitle: title });
}
