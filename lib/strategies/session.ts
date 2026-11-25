import "server-only";

import { NextResponse } from "next/server";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";

/* The verified caller for a strategy route: the session's user, never the body's. */
export async function strategiesUser(request: Request, needsProfile = true): Promise<{ response: Response } | { userId: string; privyDid: string }> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (needsProfile && !hasProfile(user)) return { response: NextResponse.json({ error: databaseUnavailableMessage("Strategies") }, { status: 503 }) };
  return { userId: user.userId, privyDid: user.privyDid };
}

export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return body !== null && typeof body === "object" && !Array.isArray(body) ? body : null;
}
