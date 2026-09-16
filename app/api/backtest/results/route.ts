import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listResults } from "@/lib/backtest/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  return NextResponse.json(
    { results: await listResults(user.userId) },
    { headers: { "cache-control": "no-store" } },
  );
}
