import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  notificationPreferences,
  parsePreferencesPatch,
  savePreferences,
} from "@/lib/notifications/preferences";

/* ---------------------------------------------------------------------------
   Notification preferences.

   Changed HERE and not in the chat. Toggling one changes what gets broadcast
   into a Telegram conversation, and Telegram authenticates a chat account
   rather than the Elyra account behind it — so the switch lives on the
   surface that can verify the session.

   Everything defaults off, and stays off unless a read succeeds. Failing open
   would mean a database blip starts broadcasting portfolios.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  return NextResponse.json(await notificationPreferences(user.userId), {
    headers: { "cache-control": "no-store" },
  });
}

export async function PATCH(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = parsePreferencesPatch(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const saved = await savePreferences(user.userId, parsed.patch);
  if (!saved) {
    return NextResponse.json(
      { error: "Could not save that. Nothing was changed." },
      { status: 503 },
    );
  }

  return NextResponse.json(await notificationPreferences(user.userId), {
    headers: { "cache-control": "no-store" },
  });
}
