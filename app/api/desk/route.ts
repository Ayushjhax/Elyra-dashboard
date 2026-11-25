import { NextResponse, after } from "next/server";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";
import { DeskError, convene, deskState, runDesk } from "@/lib/desk/engine";

/* ---------------------------------------------------------------------------
   The Desk: a committee of AI models from different labs that forecasts one
   market question together and is scored on it (lib/desk).

   GET   the seats this deployment fills, the person's runs, the scoreboard
   POST  { market, horizon: "4h" | "24h" | "7d", note? } convenes the desk.
         The run is recorded and answered at once; the committee then works
         after the response (`after`), stage by stage, and the page follows
         it with GET. Words only — nothing here can trade.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* A run is a few rounds of parallel model calls, each capped at 30 seconds. */
export const maxDuration = 300;

async function caller(request: Request): Promise<{ response: NextResponse } | { userId: string }> {
  const user = await getSessionUser(request);
  if (user === null) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (!hasProfile(user)) return { response: NextResponse.json({ error: databaseUnavailableMessage("The desk") }, { status: 503 }) };
  return { userId: user.userId };
}

const failure = (error: unknown) =>
  error instanceof DeskError
    ? NextResponse.json({ error: error.message }, { status: error.status })
    : NextResponse.json({ error: "The desk is unavailable right now." }, { status: 500 });

export async function GET(request: Request): Promise<Response> {
  const resolved = await caller(request);
  if ("response" in resolved) return resolved.response;
  try {
    return NextResponse.json(await deskState(resolved.userId, Date.now()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const resolved = await caller(request);
  if ("response" in resolved) return resolved.response;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = await convene(resolved.userId, body, Date.now());
    after(() => runDesk(id));
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
