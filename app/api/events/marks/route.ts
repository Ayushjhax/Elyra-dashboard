import { NextResponse } from "next/server";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";
import { EventsError, setMark } from "@/lib/events/server";

/* Likes or saves an events-feed item — `{ itemKey, mark: "like" | "save", on }` — for the signed-in person. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null) return NextResponse.json({ error: "Sign in to like or save." }, { status: 401 });
  if (!hasProfile(user)) return NextResponse.json({ error: databaseUnavailableMessage("Events") }, { status: 503 });
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  try {
    await setMark(user.userId, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EventsError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "That could not be saved right now." }, { status: 500 });
  }
}
