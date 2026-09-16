import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getResult } from "@/lib/backtest/run";
import { backtestDocument } from "@/lib/backtest/report";

/* ---------------------------------------------------------------------------
   The backtest PDF.

   Rendered on demand from the stored result rather than at run time. A saved
   backtest is a row; most are never exported, and rendering every one would
   spend seconds of CPU and a storage object on documents nobody opens.

   Ownership is re-checked here. A result id is a uuid, which is unguessable —
   but unguessable is not authorised.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await context.params;
  const row = (await getResult(id, user.userId)) as Record<string, unknown> | null;

  if (row === null) {
    return NextResponse.json({ error: "No such backtest." }, { status: 404 });
  }

  const document = backtestDocument(
    {
      ok: true,
      config: row.config as never,
      metrics: row.metrics as never,
      quality: row.quality === null ? undefined : { level: row.quality as never, issues: [] },
      robustness: (row.robustness as never) ?? undefined,
      warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
      barsLoaded: 0,
      coverage: 1,
    },
    typeof row.query === "string" ? row.query : null,
  );

  if (document === null) {
    return NextResponse.json(
      { error: "That result cannot be rendered." },
      { status: 422 },
    );
  }

  /* Imported here so the PDF engine stays out of the module graph of every
     route that merely reads a row. */
  const { renderReportPdf } = await import("@/lib/research/pdf");

  try {
    const pdf = await renderReportPdf(document);
    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="elyra-backtest-${id.slice(0, 8)}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error: unknown) {
    console.error("[backtest] pdf render failed", error);
    return NextResponse.json({ error: "The PDF could not be rendered." }, { status: 500 });
  }
}
