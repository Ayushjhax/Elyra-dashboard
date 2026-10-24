import { NextResponse } from "next/server";
import { Expo } from "expo-server-sdk";
import { parseRegistration, registerDevice, unregisterDevice } from "@/lib/notifications/devices";
import { badJson, jsonBody, storedSession } from "@/lib/notifications/session";

/* ---------------------------------------------------------------------------
   The Android app's push devices.

   POST registers or refreshes the caller's phone — after sign-in, when the
   token rotates, and when the app updates. A token another account had
   moves to the caller; it is never shared. DELETE unregisters it on sign-out,
   and only from the caller's own account.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const session = await storedSession(request, "Push notifications");
  if ("response" in session) return session.response;

  const body = await jsonBody(request);
  if (body === null) return badJson();

  const registration = parseRegistration(body);
  if ("error" in registration) return NextResponse.json({ error: registration.error }, { status: 400 });

  if (!(await registerDevice(session.userId, registration))) {
    return NextResponse.json({ error: "Could not register this device." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, accountId: session.userId });
}

export async function DELETE(request: Request): Promise<Response> {
  const session = await storedSession(request, "Push notifications");
  if ("response" in session) return session.response;

  const body = await jsonBody(request);
  if (body === null) return badJson();

  const token = typeof body.expoPushToken === "string" ? body.expoPushToken.trim() : "";
  if (!Expo.isExpoPushToken(token)) {
    return NextResponse.json({ error: "That is not an Expo push token." }, { status: 400 });
  }

  if (!(await unregisterDevice(session.userId, token))) {
    return NextResponse.json({ error: "Could not unregister this device." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
