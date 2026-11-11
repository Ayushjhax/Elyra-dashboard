import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasProfile } from "@/lib/auth/session";
import { eventsFeed } from "@/lib/events/server";

/* ---------------------------------------------------------------------------
   The events feed, newest first, a page at a time:

     GET /api/events?filter=hacks&before=<cursor>

   Anyone may read it. A signed-in reader also sees what they liked and saved,
   and can filter to their saved items.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const user = await getSessionUser(request).catch(() => null);
  const viewer = user !== null && hasProfile(user) ? user.userId : null;
  const params = request.nextUrl.searchParams;
  try {
    const page = await eventsFeed(viewer, { filter: params.get("filter"), before: params.get("before") });
    return NextResponse.json(page, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ items: [], next: null, signedIn: viewer !== null, error: "The events feed could not be read right now." }, { status: 502 });
  }
}
