import { NextResponse } from "next/server";
import { listMarketReports } from "@/lib/analysis/reports";
import { getSessionUser } from "@/lib/auth/session";

/* ---------------------------------------------------------------------------
   The person's saved deep research (lib/analysis/reports.ts), newest first.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const reports = await listMarketReports(user.userId);
  if (reports === null) return NextResponse.json({ reports: [], error: "Saved reports need database migration 0033." }, { status: 503 });
  return NextResponse.json({ reports });
}
