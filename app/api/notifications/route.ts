import { NextResponse } from "next/server";
import { readInbox } from "@/lib/notifications/inbox";
import { storedSession } from "@/lib/notifications/session";

/* ---------------------------------------------------------------------------
   GET /api/notifications?cursor= — the caller's inbox, newest first, a page
   at a time, with the unread count for the badge. Only ever the caller's own.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const session = await storedSession(request, "Notifications");
  if ("response" in session) return session.response;

  const raw = new URL(request.url).searchParams.get("cursor");
  /* A cursor is a timestamp this route handed out. Anything else is refused
     rather than passed into a comparison. */
  const cursor = raw === null || raw === "" ? null : Number.isNaN(Date.parse(raw)) ? undefined : raw;
  if (cursor === undefined) return NextResponse.json({ error: "Bad cursor." }, { status: 400 });

  const page = await readInbox(session.userId, cursor);
  if (page === null) {
    return NextResponse.json({ error: "Notifications could not be read." }, { status: 503 });
  }
  return NextResponse.json(page, { headers: { "cache-control": "no-store" } });
}
