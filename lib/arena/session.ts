import "server-only";

import { NextResponse } from "next/server";
import { ArenaError } from "@/lib/arena/server";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";

/* The verified caller for an Arena route; the user is the token's, never the body's. */
export async function arenaUser(request: Request): Promise<{ response: NextResponse } | { userId: string }> {
  const user = await getSessionUser(request);
  if (user === null) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (!hasProfile(user)) return { response: NextResponse.json({ error: databaseUnavailableMessage("Arena") }, { status: 503 }) };
  return { userId: user.userId };
}

/** An Arena failure as a response: its own words and status, or a plain 500. */
export function arenaFailure(error: unknown): NextResponse {
  if (error instanceof ArenaError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: "That could not be done right now." }, { status: 500 });
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}
