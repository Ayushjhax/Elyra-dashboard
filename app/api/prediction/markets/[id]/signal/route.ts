import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { saveSignal } from "@/lib/prediction/signal-store";
import { buildSignal } from "@/lib/prediction/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const query = new URL(request.url).searchParams;

  const index = Number.parseInt(query.get("outcomeIndex") ?? "0", 10);
  const strategy = query.get("strategy");

  const result = await buildSignal({
    query: id,
    outcomeIndex: Number.isFinite(index) ? index : 0,
    strategy: strategy ?? undefined,
  });

  if (!result.ok || result.signal === undefined) {
    /* 200, not an error status. "No setup on this book" is a successful
       answer to "is there a setup", and a 4xx would make the panel render a
       failure state for a market that is simply quiet. */
    return NextResponse.json({
      signal: null,
      reason: result.reason,
      skipped: result.skipped ?? [],
      analytics: result.analytics ?? null,
      basket: result.basket ?? null,
      phase: result.state?.phase ?? null,
    });
  }

  /* Stored only for a signed-in caller, so an alert can later reference this
     exact setup by id. Anonymous callers still see the signal. */
  const user = await getSessionUser(request);
  const stored =
    user?.userId != null ? await saveSignal({ userId: user.userId, signal: result.signal }) : null;

  return NextResponse.json({
    signal: result.signal,
    storedSignalId: stored,
    skipped: result.skipped ?? [],
    analytics: result.analytics ?? null,
    basket: result.basket ?? null,
    phase: result.state?.phase ?? null,
  });
}
