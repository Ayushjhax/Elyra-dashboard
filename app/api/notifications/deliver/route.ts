import { NextResponse } from "next/server";
import { cronAuthorised } from "@/lib/notifications/cron";
import { deliverNotifications } from "@/lib/notifications/deliver";

/* ---------------------------------------------------------------------------
   The delivery pass, as a scheduled endpoint — every channel at once: the
   website's Telegram chats, and the Android app's inbox and push.

   Called every five minutes by the Supabase scheduler (Vercel's Hobby plan
   only runs its own crons daily — see supabase/SCHEDULER.md), and once a day
   by vercel.json as a fallback. A second call in the same window finds every
   event already claimed and sends nothing.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* A pass over every recipient is not a sub-second job. */
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  /* No body on a rejection: nothing to learn from probing this endpoint. */
  if (!cronAuthorised(request)) return new NextResponse(null, { status: 401 });

  /* ?dryRun=1 — for the smoke test (scripts/smoke.ts): the secret was
     accepted and the route is deployed, and nothing is claimed or sent.
     Says which channels this deployment could deliver to, as booleans. */
  if (new URL(request.url).searchParams.get("dryRun") === "1") {
    return NextResponse.json(
      {
        dryRun: true,
        authorised: true,
        channels: {
          push: true,
          pushAccessToken: (process.env.EXPO_ACCESS_TOKEN?.trim() ?? "") !== "",
          telegram: (process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "") !== "",
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const report = await deliverNotifications();
  return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
}

/** Same work, for schedulers that only issue POSTs. */
export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
