import "server-only";

import { NextResponse } from "next/server";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";

/* The verified caller for an insider-watch write: the session's user, never the body's. */
export async function insiderUser(request: Request): Promise<{ response: Response } | { userId: string }> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) return { response: NextResponse.json({ error: "Sign in to set a watch." }, { status: 401 }) };
  if (!hasProfile(user)) return { response: NextResponse.json({ error: databaseUnavailableMessage("Insider watch") }, { status: 503 }) };
  return { userId: user.userId };
}
