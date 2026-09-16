import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { signedPdfUrl } from "@/lib/research/store";

/* ---------------------------------------------------------------------------
   The PDF download.

   Ownership is re-checked here rather than trusted from the id. A report id
   is a uuid, which is unguessable — but unguessable is not the same as
   authorised, and a link shared in a Telegram chat must not work for whoever
   receives it.

   Redirects to a signed URL valid for sixty seconds: long enough to follow,
   short enough that a forwarded link is already dead.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await context.params;
  const url = await signedPdfUrl(id, user.userId);

  if (url === null) {
    return NextResponse.json(
      { error: "No PDF is available for that report." },
      { status: 404 },
    );
  }

  return NextResponse.redirect(url, { status: 302 });
}
