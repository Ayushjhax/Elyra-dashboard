import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getResult } from "@/lib/backtest/run";

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
  const result = await getResult(id, user.userId);

  /* Same answer for "no such result" and "someone else's" — telling them
     apart confirms which ids exist. */
  if (result === null) {
    return NextResponse.json({ error: "No such backtest." }, { status: 404 });
  }

  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
