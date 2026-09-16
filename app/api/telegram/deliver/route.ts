import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto/credentials";
import { optional } from "@/lib/env";
import { flags } from "@/lib/flags";
import { deliverNotifications } from "@/lib/telegram/deliver";

/* ---------------------------------------------------------------------------
   The notification delivery pass, as a scheduled endpoint.

   Call it from a cron — every five minutes is a sensible cadence. On Vercel
   that is a "crons" entry in vercel.json pointing at this path; anywhere
   else, any scheduler that can issue an authenticated GET.

   ── Why it is authenticated ────────────────────────────────────────────

   This endpoint sends messages to users. An open one is a way to make Elyra
   spam every linked chat on demand, and to burn the API budget doing it. It
   reuses TELEGRAM_WEBHOOK_SECRET — the same shared secret, compared the same
   constant-time way — rather than introducing a second credential to rotate.

   Vercel Cron sends its own `Authorization: Bearer <CRON_SECRET>` header;
   either is accepted so the endpoint works under both.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* A pass over every linked chat is not a sub-second job. */
export const maxDuration = 300;

const UNAUTHORIZED = new NextResponse(null, { status: 401 });

function authorised(request: Request): boolean {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret !== undefined && cronSecret.length > 0 && bearer !== undefined) {
    if (safeEqual(bearer, cronSecret)) return true;
  }

  const shared = optional("TELEGRAM_WEBHOOK_SECRET");
  if (shared === undefined) return false;

  const presented =
    request.headers.get("x-telegram-bot-api-secret-token") ?? bearer ?? null;

  return presented !== null && safeEqual(presented, shared);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorised(request)) return UNAUTHORIZED;

  /* The flag is checked after the secret, so an unauthenticated caller cannot
     learn whether the surface is enabled. */
  if (!flags().telegram) {
    return NextResponse.json(
      { skipped: "The Telegram surface is disabled or unconfigured." },
      { status: 200 },
    );
  }

  const report = await deliverNotifications();
  return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
}

/** Same work, for schedulers that only issue POSTs. */
export async function POST(request: Request): Promise<Response> {
  return GET(request);
}
