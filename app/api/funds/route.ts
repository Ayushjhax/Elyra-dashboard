import { NextResponse } from "next/server";
import { fundsState, fundsUser } from "@/lib/funds/console";
import { launchFund } from "@/lib/funds/owner";
import { toSummary } from "@/lib/funds/store";

/* ---------------------------------------------------------------------------
   The person's AI funds.

     GET   every fund, from its last mark; the agent keys that may manage
           one; whether this server trades live
     POST  launch a fund on paper (lib/funds/owner.ts `launchFund`). With
           `newKeyName`, a key is made for its manager and returned ONCE.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await fundsUser(request);
  if ("response" in user) return user.response;
  const state = await fundsState(user.userId);
  return NextResponse.json(state, { status: state.error === null ? 200 : 503, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const user = await fundsUser(request);
  if ("response" in user) return user.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null || typeof body !== "object") return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  const launched = await launchFund(user.userId, body);
  if (!launched.ok) return NextResponse.json({ error: launched.error }, { status: launched.status });
  return NextResponse.json(
    { fund: toSummary(launched.value.fund, new Map(), []), key: launched.value.key },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
