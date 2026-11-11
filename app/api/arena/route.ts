import { NextResponse } from "next/server";
import { utcDate } from "@/lib/arena/puzzle";
import { arenaState } from "@/lib/arena/server";
import { arenaFailure, arenaUser } from "@/lib/arena/session";

/* ---------------------------------------------------------------------------
   Elyra Arena for the signed-in account: today's puzzle, their calls and the
   calls shared with them, their calibration, their trade reviews, their
   groups and points. Points and paper only — nothing here touches money.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type { ArenaResponse } from "@/lib/arena/types";

export async function GET(request: Request): Promise<Response> {
  const resolved = await arenaUser(request);
  if ("response" in resolved) return resolved.response;
  try {
    const now = Date.now();
    return NextResponse.json(await arenaState(resolved.userId, now, utcDate(now)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return arenaFailure(error);
  }
}
