import { NextResponse } from "next/server";
import { storedSession } from "@/lib/notifications/session";
import { claimNotification } from "@/lib/notifications/preferences";
import { addToInbox } from "@/lib/notifications/inbox";
import { devicesFor, rememberAppAccount } from "@/lib/notifications/devices";
import { pushToDevices } from "@/lib/notifications/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Explicit test: caller only, inbox first, at most once per minute across workers. */
export async function POST(request: Request): Promise<Response> {
  const session = await storedSession(request, "Test notifications");
  if ("response" in session) return session.response;
  const { userId } = session;
  if (!(await claimNotification(userId, "system_test", String(Math.floor(Date.now() / 60_000))))) {
    return NextResponse.json({ error: "Wait a minute before sending another test notification." }, { status: 429, headers: { "retry-after": "60" } });
  }
  const title = "Your Elyra test notification";
  const body = "Notifications are connected. Tap to open your inbox.";
  await rememberAppAccount(userId);
  const notificationId = await addToInbox({ userId, kind: "system", title, body, data: { route: "/notifications" } });
  if (notificationId === null) return NextResponse.json({ error: "The test could not be added to your inbox." }, { status: 503 });
  const devices = await devicesFor([userId]);
  const push = await pushToDevices(devices.get(userId) ?? [], { kind: "system", title, body, data: { route: "/notifications", notificationId, accountId: userId } }, notificationId);
  return NextResponse.json({ notificationId, inbox: true, push }, { headers: { "cache-control": "no-store" } });
}
