import { after, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { parseResearchIntent } from "@/lib/research/intent";
import { createReport, listReports, runReport } from "@/lib/research/store";

/* ---------------------------------------------------------------------------
   Research reports.

   POST creates the row, returns the id, and runs the pipeline AFTER the
   response. Several SEC round trips through a rate limiter plus a PDF render
   is seconds of work — long enough that a caller holding the connection would
   time out on some deployments and retry on others, producing two reports.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  return NextResponse.json(
    { reports: await listReports(user.userId) },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { query?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query.length === 0) {
    return NextResponse.json({ error: "Nothing to research." }, { status: 400 });
  }
  if (query.length > 300) {
    return NextResponse.json({ error: "That request is too long." }, { status: 400 });
  }

  const task = parseResearchIntent(query);

  /* Only SEC-backed report intents are runnable. Everything else would
     create a row that can never complete, which is worse than saying no. */
  const RUNNABLE = ["earnings_report", "company_10k_report", "company_10q_report"];
  if (!RUNNABLE.includes(task.intent) || task.subject.kind !== "registrant") {
    return NextResponse.json(
      {
        error:
          "That is not a company report request. Try “NVDA latest earnings” or " +
          "“Generate an MSFT 10-K”.",
        intent: task.intent,
      },
      { status: 400 },
    );
  }

  const kind =
    task.intent === "company_10k_report"
      ? "10-K"
      : task.intent === "company_10q_report"
        ? "10-Q"
        : "earnings";

  const reportId = await createReport({ userId: user.userId, query, kind });
  if (reportId === null) {
    return NextResponse.json({ error: "Could not start the report." }, { status: 503 });
  }

  const userId = user.userId;
  after(async () => {
    try {
      await runReport({ reportId, userId, query: task.subject.kind === "registrant" ? task.subject.query : query });
    } catch (error) {
      console.error("[research] job failed", error);
    }
  });

  return NextResponse.json({ id: reportId, status: "queued" }, { status: 202 });
}
