import { NextResponse } from "next/server";
import { createLeague, joinLeague } from "@/lib/arena/leagues";
import { arenaFailure, arenaUser, jsonBody } from "@/lib/arena/session";

/* ---------------------------------------------------------------------------
   Creates a league, or joins one by its invite code. Points and paper only:
   a league drafts markets and scores their moves; nothing is staked.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await arenaUser(request);
  if ("response" in resolved) return resolved.response;
  try {
    const body = await jsonBody(request);
    const id = body.action === "join" ? await joinLeague(resolved.userId, body.code) : await createLeague(resolved.userId, body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return arenaFailure(error);
  }
}
