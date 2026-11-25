import "server-only";

import { NextResponse } from "next/server";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";

/* The verified caller for a Scout route: the session's user, never the body's. */
export async function scoutUser(request: Request): Promise<{ response: Response } | { userId: string }> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) return { response: NextResponse.json({ error: "Sign in to use this." }, { status: 401 }) };
  if (!hasProfile(user)) return { response: NextResponse.json({ error: databaseUnavailableMessage("Scout") }, { status: 503 }) };
  return { userId: user.userId };
}

export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  return body !== null && typeof body === "object" && !Array.isArray(body) ? body : null;
}

export const NO_STORE = { "cache-control": "no-store" } as const;
