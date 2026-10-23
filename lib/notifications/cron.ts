import "server-only";

import { safeEqual } from "@/lib/crypto/credentials";
import { optional } from "@/lib/env";

/* ---------------------------------------------------------------------------
   Who may start a delivery pass.

   The pass sends messages to real people. An open endpoint would be a way to
   make Elyra notify every account on demand and burn the API budget doing
   it, so it takes a shared secret, compared in constant time:

     - CRON_SECRET as a bearer token — what Vercel Cron and the Supabase
       scheduler (supabase/SCHEDULER.md) send;
     - or TELEGRAM_WEBHOOK_SECRET, so a deployment that only ever set that one
       keeps working.
--------------------------------------------------------------------------- */

export function cronAuthorised(request: Request): boolean {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret !== undefined && cronSecret.length > 0 && bearer !== undefined) {
    if (safeEqual(bearer, cronSecret)) return true;
  }

  const shared = optional("TELEGRAM_WEBHOOK_SECRET");
  if (shared === undefined) return false;

  const presented = request.headers.get("x-telegram-bot-api-secret-token") ?? bearer ?? null;
  return presented !== null && safeEqual(presented, shared);
}
