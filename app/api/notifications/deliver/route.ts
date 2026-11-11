import { NextResponse } from "next/server";
import { cronAuthorised } from "@/lib/notifications/cron";
import { runArena } from "@/lib/arena/engine";
import { runAutotrade } from "@/lib/autotrade/engine";
import { runEvents } from "@/lib/events/engine";
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

  /* Trading automation first (lib/autotrade/engine.ts), so an entry or an
     exit it records reaches the person in this same pass. Its failure never
     holds up delivery. */
  const automation = await runAutotrade().catch((error: unknown) => ({
    error: error instanceof Error ? error.message : "Automation pass failed.",
  }));
  /* Then Arena (lib/arena/engine.ts): reviews of trades that just closed,
     calls that came due, and their cards — capped per run. */
  const arena = await runArena().catch((error: unknown) => ({
    error: error instanceof Error ? error.message : "Arena pass failed.",
  }));
  /* Then the events feed (lib/events/engine.ts): Elyra's AI posts a new
     hack, a large move or "on this day" — only when there is one. */
  const events = await runEvents().catch((error: unknown) => ({
    error: error instanceof Error ? error.message : "Events pass failed.",
  }));
  const report = await deliverNotifications();
  return NextResponse.json({ ...report, automation, arena, events }, { headers: { "cache-control": "no-store" } });
}

/** Same work, for schedulers that only issue POSTs. */
export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
