import { NextResponse } from "next/server";
import { markRead } from "@/lib/notifications/inbox";
import { badJson, jsonBody, storedSession } from "@/lib/notifications/session";

/* ---------------------------------------------------------------------------
   POST /api/notifications/read — { ids } or { all: true }. Marks only the
   caller's own entries; an id belonging to anyone else changes nothing.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request): Promise<Response> {
  const session = await storedSession(request, "Notifications");
  if ("response" in session) return session.response;

  const body = await jsonBody(request);
  if (body === null) return badJson();

  let target: { ids: string[] } | { all: true };
  if (body.all === true) {
    target = { all: true };
  } else if (
    Array.isArray(body.ids) &&
    body.ids.length > 0 &&
    body.ids.length <= 100 &&
    body.ids.every((id) => typeof id === "string" && ID.test(id))
  ) {
    target = { ids: body.ids as string[] };
  } else {
    return NextResponse.json({ error: "Pass ids (up to 100) or all: true." }, { status: 400 });
  }

  if (!(await markRead(session.userId, target))) {
    return NextResponse.json({ error: "Could not mark those read." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
