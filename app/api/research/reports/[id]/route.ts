import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getReport } from "@/lib/research/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await context.params;
  const report = await getReport(id, user.userId);

  /* Same answer for "no such report" and "someone else's report". Telling
     them apart confirms which ids exist. */
  if (report === null) {
    return NextResponse.json({ error: "No such report." }, { status: 404 });
  }

  return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
}
