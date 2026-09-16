import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { forwardRecord, listSignals } from "@/lib/prediction/signal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's own signal history. Scoped by the session, never by a param. */
export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limit = Number.parseInt(
    new URL(request.url).searchParams.get("limit") ?? "20",
    10,
  );

  const [signals, forward] = await Promise.all([
    listSignals(user.userId, Number.isFinite(limit) ? limit : 20),
    forwardRecord(user.userId),
  ]);

  return NextResponse.json({
    signals,
    /* Deliberately a separate key with its own basis string. Merging this
       with a backtested rate produces a number describing neither. */
    forwardTrackRecord: forward,
  });
}
