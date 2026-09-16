import "server-only";

import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Notification preferences, and the rule that every channel is opt-in.

   An unsolicited Telegram message containing someone's balance is a
   disclosure they did not ask for. Linking a chat is consent to ASK
   questions, not consent to be told things — so every flag defaults false in
   the schema and a missing row means "send nothing", never "send everything".

   That last point is the one worth stating: the read below returns the
   all-off defaults when there is no row AND when the store is unreachable.
   Failing open here would mean a database blip broadcasts portfolios.
--------------------------------------------------------------------------- */

export interface TelegramNotificationPreferences {
  priceAlerts: boolean;
  liquidationAlerts: boolean;
  largeMoves: boolean;
  dailySummary: boolean;
  /** Minutes past local midnight. */
  dailySummaryMinute: number;
  timezone: string;
  moveThresholdPct: number;
  /** Probability moves on prediction markets the user holds. */
  predictionAlerts: boolean;
  predictionOrderUpdates: boolean;
  predictionResolutionAlerts: boolean;
  /**
   * In percentage POINTS. 54% to 64% is a 10-point move and an 18.5%
   * relative one; people mean the first, and using the second makes the
   * alert fire roughly twice as often as asked.
   */
  predictionMoveThresholdPoints: number;
}

/** Everything off. The answer whenever we are not certain of the opposite. */
export const NOTIFICATIONS_OFF: TelegramNotificationPreferences = {
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
): Promise<TelegramNotificationPreferences> {
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
  patch: Partial<TelegramNotificationPreferences>,
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
    console.error("[telegram] could not save notification preferences", error.code);
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
