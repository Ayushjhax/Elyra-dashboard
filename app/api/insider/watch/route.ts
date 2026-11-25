import { NextResponse } from "next/server";
import { WATCH_MINIMUMS } from "@/lib/insider/analyze";
import { deleteWatch, setWatch } from "@/lib/insider/server";
import { insiderUser } from "@/lib/insider/session";
import { jsonBody } from "@/lib/strategies/session";

/* ---------------------------------------------------------------------------
   The person's insider watch: be told, under the website's bell, when Elyra
   flags a fresh wallet whose first bet is at least `minUsd`.

     PUT     { minUsd } — one of WATCH_MINIMUMS; turns it on or changes it
     DELETE  turns it off

   Website only: a watch reaches the bell (and, if the person allows it, a
   desktop notice while Elyra is open). Nothing is sent to the app, push or
   Telegram.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request): Promise<Response> {
  const user = await insiderUser(request);
  if ("response" in user) return user.response;
  const body = await jsonBody(request);
  const minUsd = body?.minUsd;
  if (typeof minUsd !== "number" || !(WATCH_MINIMUMS as readonly number[]).includes(minUsd)) {
    return NextResponse.json({ error: "Choose one of the listed sizes." }, { status: 400 });
  }
  const saved = await setWatch(user.userId, minUsd);
  if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ watch: saved.watch });
}

export async function DELETE(request: Request): Promise<Response> {
  const user = await insiderUser(request);
  if ("response" in user) return user.response;
  const removed = await deleteWatch(user.userId);
  if (removed.error !== null) return NextResponse.json({ error: removed.error }, { status: 503 });
  return new NextResponse(null, { status: 204 });
}
