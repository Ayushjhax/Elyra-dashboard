import { NextResponse } from "next/server";
import { getMarketReport } from "@/lib/analysis/reports";
import { getSessionUser } from "@/lib/auth/session";

/* ---------------------------------------------------------------------------
   One saved deep research report: the reply the person read, and the facts
   it was written from. Only the owner's.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such report." }, { status: 404 });
  const report = await getMarketReport(user.userId, id);
  if (report === null) return NextResponse.json({ error: "No such report." }, { status: 404 });
  return NextResponse.json({ report });
}
