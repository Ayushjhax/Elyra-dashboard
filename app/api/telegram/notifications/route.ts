import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  notificationPreferences,
  savePreferences,
} from "@/lib/telegram/notifications";

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

const FLAGS = [
  "priceAlerts",
  "liquidationAlerts",
  "largeMoves",
  "dailySummary",
  "predictionAlerts",
  "predictionOrderUpdates",
  "predictionResolutionAlerts",
] as const;

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

  /* An allowlist, field by field. Spreading the body into the patch would let
     a client set `user_id` and write to another account. */
  const patch: Parameters<typeof savePreferences>[1] = {};

  for (const flag of FLAGS) {
    if (typeof body[flag] === "boolean") patch[flag] = body[flag];
  }

  if (typeof body.moveThresholdPct === "number") {
    const value = body.moveThresholdPct;
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      return NextResponse.json(
        { error: "Move threshold must be between 0 and 100 percent." },
        { status: 400 },
      );
    }
    patch.moveThresholdPct = value;
  }

  if (typeof body.predictionMoveThresholdPoints === "number") {
    const value = body.predictionMoveThresholdPoints;
    /* Points, and a probability cannot move more than 100 of them. */
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      return NextResponse.json(
        { error: "Probability move threshold must be between 0 and 100 points." },
        { status: 400 },
      );
    }
    patch.predictionMoveThresholdPoints = value;
  }

  if (typeof body.dailySummaryMinute === "number") {
    const value = body.dailySummaryMinute;
    if (!Number.isInteger(value) || value < 0 || value > 1439) {
      return NextResponse.json(
        { error: "Daily summary time must be a minute of the day." },
        { status: 400 },
      );
    }
    patch.dailySummaryMinute = value;
  }

  if (typeof body.timezone === "string") {
    /* Validated against the runtime's own zone database rather than a regex:
       an unparseable zone would make every future digest fire at the wrong
       hour, silently. */
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
      patch.timezone = body.timezone;
    } catch {
      return NextResponse.json({ error: "Unknown timezone." }, { status: 400 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const saved = await savePreferences(user.userId, patch);
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
