/** The notification wire format. Pure: shared by the API and native app. */
export type NotificationKind =
  | "price_alert"
  | "liquidation"
  | "large_move"
  | "prediction_move"
  | "prediction_order"
  | "prediction_resolution"
  | "prediction_signal"
  | "daily_summary"
  | "system";
export interface InboxEntry {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}
export interface InboxPage {
  notifications: InboxEntry[];
  nextCursor: string | null;
  unread: number;
}
export interface NotificationPreferences {
  priceAlerts: boolean;
  liquidationAlerts: boolean;
  largeMoves: boolean;
  dailySummary: boolean;
  dailySummaryMinute: number;
  timezone: string;
  moveThresholdPct: number;
  predictionAlerts: boolean;
  predictionOrderUpdates: boolean;
  predictionResolutionAlerts: boolean;
  predictionMoveThresholdPoints: number;
}
export type NotificationFlag = {
  [K in keyof NotificationPreferences]: NotificationPreferences[K] extends boolean
    ? K
    : never;
}[keyof NotificationPreferences];
export const NOTIFICATION_FLAGS: ReadonlyArray<{
  key: NotificationFlag;
  label: string;
  detail: string;
}> = [
  {
    key: "priceAlerts",
    label: "Price alerts",
    detail: "When a price crosses a level you set.",
  },
  {
    key: "liquidationAlerts",
    label: "Liquidation warnings",
    detail: "When a position approaches liquidation.",
  },
  {
    key: "largeMoves",
    label: "Market moves",
    detail: "Large moves in markets you watch.",
  },
  {
    key: "predictionAlerts",
    label: "Prediction probability moves",
    detail:
      "Probability changes in markets you hold, plus your prediction alert rules and signal updates.",
  },
  {
    key: "predictionOrderUpdates",
    label: "Prediction order updates",
    detail: "Fills and changes to prediction orders.",
  },
  {
    key: "predictionResolutionAlerts",
    label: "Prediction resolutions",
    detail: "When a prediction position resolves in your favour.",
  },
  {
    key: "dailySummary",
    label: "Daily summary",
    detail:
      "Your capital and the day's largest moves, at your chosen local time.",
  },
];
export const ANDROID_CHANNEL: Record<NotificationKind, string> = {
  price_alert: "price-alerts-v2",
  liquidation: "liquidation-v2",
  large_move: "market-moves-v2",
  prediction_move: "prediction-markets-v2",
  prediction_order: "prediction-markets-v2",
  prediction_resolution: "prediction-markets-v2",
  prediction_signal: "prediction-markets-v2",
  daily_summary: "daily-summary-v2",
  system: "system-v2",
};
