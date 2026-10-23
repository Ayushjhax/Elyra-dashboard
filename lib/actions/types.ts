import type { PreparedAction } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   Actions awaiting review, as /api/actions returns them. Shared by the
   route, the website and the Android app.
--------------------------------------------------------------------------- */

/**
 * Where an action was prepared: the website, its Telegram chat, the Android
 * app, or an assistant answer (shown in the app as a review card).
 */
export type PreparedActionSurface = "web" | "telegram" | "app" | "agent";

export type PreparedActionStatus =
  | "prepared"
  | "acknowledged"
  | "confirmed"
  | "expired"
  | "cancelled";

export interface OpenAction {
  id: string;
  action: PreparedAction;
  surface: PreparedActionSurface;
  status: PreparedActionStatus;
  expiresAt: string;
}

export interface ActionsResponse {
  actions: OpenAction[];
  error: string | null;
}
