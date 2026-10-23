import { NextResponse } from "next/server";
import { cronAuthorised } from "@/lib/notifications/cron";
import { deliverNotifications } from "@/lib/notifications/deliver";

/* ---------------------------------------------------------------------------
   The delivery pass under its original path, kept so a scheduler still
   pointed here keeps working. It runs the same pass as
   /api/notifications/deliver — every channel, Telegram included when that
   surface is enabled — so calling both in one window only finds every event
   already claimed.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorised(request)) return new NextResponse(null, { status: 401 });
  const report = await deliverNotifications();
  return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
