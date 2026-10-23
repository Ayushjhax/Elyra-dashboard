import "server-only";

import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Notification preferences, and the rule that every channel is opt-in.

   An unsolicited message containing someone's balance — in a Telegram chat
   or on a phone's lock screen — is a disclosure they did not ask for. Linking
   a chat or installing the app is consent to ASK questions, not consent to be
   told things — so every flag defaults false in the schema and a missing row
   means "send nothing", never "send everything". One set of preferences
   applies to every channel. The tables keep their original telegram_ names;
   they cover push and the app's inbox too.

   That last point is the one worth stating: the read below returns the
   all-off defaults when there is no row AND when the store is unreachable.
   Failing open here would mean a database blip broadcasts portfolios.
--------------------------------------------------------------------------- */

import type { NotificationPreferences } from "@/lib/notifications/types";
export type { NotificationPreferences } from "@/lib/notifications/types";

/** Everything off. The answer whenever we are not certain of the opposite. */
export const NOTIFICATIONS_OFF: NotificationPreferences = {
  priceAlerts: false,
  liquidationAlerts: false,
  largeMoves: false,
  dailySummary: false,
  dailySummaryMinute: 540,
  timezone: "UTC",
  moveThresholdPct: 5,
  predictionAlerts: false,
  predictionOrderUpdates: false,
  predictionResolutionAlerts: false,
  predictionMoveThresholdPoints: 10,
};

export async function notificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const { data, error } = await serviceClient()
    .from("telegram_notification_preferences")
    .select(
      "price_alerts, liquidation_alerts, large_moves, daily_summary, daily_summary_minute, timezone, move_threshold_pct, prediction_alerts, prediction_order_updates, prediction_resolution_alerts, prediction_move_threshold_points",
    )
    .eq("user_id", userId)
    .maybeSingle();

  /* A read failure is not a reason to start sending. */
  if (error || !data) return NOTIFICATIONS_OFF;

  return {
    priceAlerts: data.price_alerts,
    liquidationAlerts: data.liquidation_alerts,
    largeMoves: data.large_moves,
    dailySummary: data.daily_summary,
    dailySummaryMinute: data.daily_summary_minute,
    timezone: data.timezone,
    moveThresholdPct: Number(data.move_threshold_pct),
    predictionAlerts: data.prediction_alerts,
    predictionOrderUpdates: data.prediction_order_updates,
    predictionResolutionAlerts: data.prediction_resolution_alerts,
    predictionMoveThresholdPoints: Number(data.prediction_move_threshold_points),
  };
}

export async function savePreferences(
  userId: string,
  patch: Partial<NotificationPreferences>,
): Promise<boolean> {
  /* Read-modify-write rather than a partial upsert. An upsert carrying only
     the changed columns REPLACES the row on conflict in postgrest, silently
     resetting every flag the caller did not mention — so turning on price
     alerts would turn off the daily summary. */
  const current = await notificationPreferences(userId);
  const merged = { ...current, ...patch };

  const { error } = await serviceClient()
    .from("telegram_notification_preferences")
    .upsert(
      {
        user_id: userId,
        price_alerts: merged.priceAlerts,
        liquidation_alerts: merged.liquidationAlerts,
        large_moves: merged.largeMoves,
        daily_summary: merged.dailySummary,
        daily_summary_minute: Math.min(
          1439,
          Math.max(0, Math.round(merged.dailySummaryMinute)),
        ),
        timezone: merged.timezone,
        move_threshold_pct:
          merged.moveThresholdPct > 0 ? merged.moveThresholdPct : current.moveThresholdPct,
        prediction_alerts: merged.predictionAlerts,
        prediction_order_updates: merged.predictionOrderUpdates,
        prediction_resolution_alerts: merged.predictionResolutionAlerts,
        prediction_move_threshold_points:
          merged.predictionMoveThresholdPoints > 0
            ? merged.predictionMoveThresholdPoints
            : current.predictionMoveThresholdPoints,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("[notifications] could not save notification preferences", error.code);
    return false;
  }
  return true;
}

/**
 * Claims the right to send one notification.
 *
 * A unique constraint, not a check-then-insert. Two workers racing on the
 * same alert both pass a "has this been sent?" read and both send; only one
 * wins an insert. Returns false when someone else already claimed it.
 */
export async function claimNotification(
  userId: string,
  kind: string,
  dedupeKey: string,
): Promise<boolean> {
  const { error } = await serviceClient()
    .from("telegram_notifications_sent")
    .insert({ user_id: userId, kind, dedupe_key: dedupeKey });

  /* 23505 is unique_violation: someone got there first, which is success for
     the system and "do not send" for this caller. */
  if (error) return false;
  return true;
}

const PREFERENCE_FLAGS = [
  "priceAlerts",
  "liquidationAlerts",
  "largeMoves",
  "dailySummary",
  "predictionAlerts",
  "predictionOrderUpdates",
  "predictionResolutionAlerts",
] as const;

/**
 * A PATCH body, validated field by field, or the reason it is not valid.
 * Shared by the website's and the app's preference routes, so one rule
 * decides what a person may set.
 */
export function parsePreferencesPatch(
  body: Record<string, unknown>,
): { patch: Partial<NotificationPreferences> } | { error: string } {
  /* An allowlist, field by field. Spreading the body into the patch would let
     a client set `user_id` and write to another account. */
  const patch: Partial<NotificationPreferences> = {};

  for (const flag of PREFERENCE_FLAGS) {
    if (typeof body[flag] === "boolean") patch[flag] = body[flag];
  }

  if (typeof body.moveThresholdPct === "number") {
    const value = body.moveThresholdPct;
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      return { error: "Move threshold must be between 0 and 100 percent." };
    }
    patch.moveThresholdPct = value;
  }

  if (typeof body.predictionMoveThresholdPoints === "number") {
    const value = body.predictionMoveThresholdPoints;
    /* Points, and a probability cannot move more than 100 of them. */
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      return { error: "Probability move threshold must be between 0 and 100 points." };
    }
    patch.predictionMoveThresholdPoints = value;
  }

  if (typeof body.dailySummaryMinute === "number") {
    const value = body.dailySummaryMinute;
    if (!Number.isInteger(value) || value < 0 || value > 1439) {
      return { error: "Daily summary time must be a minute of the day." };
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
      return { error: "Unknown timezone." };
    }
  }

  if (Object.keys(patch).length === 0) return { error: "Nothing to change." };
  return { patch };
}
