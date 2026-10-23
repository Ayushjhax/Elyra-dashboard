import { NextResponse } from "next/server";
import {
  notificationPreferences,
  parsePreferencesPatch,
  savePreferences,
} from "@/lib/notifications/preferences";
import { badJson, jsonBody, storedSession } from "@/lib/notifications/session";

/* ---------------------------------------------------------------------------
   Notification preferences, for the Android app.

   The same rows and the same validation as the website's route: one set of
   preferences applies to every channel. Everything defaults off, and stays
   off unless a read succeeds — failing open would mean a database blip
   starts broadcasting portfolios.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { headers: { "cache-control": "no-store" } };

export async function GET(request: Request): Promise<Response> {
  const session = await storedSession(request, "Notification settings");
  if ("response" in session) return session.response;
  return NextResponse.json(await notificationPreferences(session.userId), NO_STORE);
}

export async function PATCH(request: Request): Promise<Response> {
  const session = await storedSession(request, "Notification settings");
  if ("response" in session) return session.response;

  const body = await jsonBody(request);
  if (body === null) return badJson();

  const parsed = parsePreferencesPatch(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  if (!(await savePreferences(session.userId, parsed.patch))) {
    return NextResponse.json({ error: "Could not save that. Nothing was changed." }, { status: 503 });
  }
  return NextResponse.json(await notificationPreferences(session.userId), NO_STORE);
}
