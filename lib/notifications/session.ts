import "server-only";

import { NextResponse } from "next/server";
import { getSessionUser, hasProfile, profileUnavailable } from "@/lib/auth/session";

/* ---------------------------------------------------------------------------
   The caller, for the app's notification, device and watchlist routes. Each
   of them reads or writes rows, so each needs a profile: an unreachable
   database is a 503 that says so, never an empty list that reads as "nothing
   here".
--------------------------------------------------------------------------- */

export async function storedSession(
  request: Request,
  feature: string,
): Promise<{ userId: string } | { response: Response }> {
  const user = await getSessionUser(request);
  if (user === null) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (!hasProfile(user)) return { response: profileUnavailable(feature) };
  return { userId: user.userId };
}

export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const badJson = (): Response => NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
