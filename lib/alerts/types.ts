/* ---------------------------------------------------------------------------
   A price alert, as /api/alerts returns it. Shared by the server, the
   website and the Android app.
--------------------------------------------------------------------------- */

export interface PriceAlert {
  id: string;
  symbol: string;
  direction: "above" | "below";
  target: number;
  createdPrice: number | null;
  triggeredAt: string | null;
  /** The price the delivery worker saw when it fired. */
  triggeredPrice?: number | null;
  createdAt?: string;
}

/**
 * Where a crossing goes, for the Android app — said in the app's own terms,
 * since the app has no Telegram of its own.
 * `push`: price alerts are on and a device takes notifications — push and
 *   the inbox.
 * `inbox`: price alerts are on, but no device takes a push — the inbox only.
 * `off`: price alerts are switched off; an alert the person set still lands
 *   in the inbox.
 * `none`: no app device is registered yet, so nothing reaches the app.
 */
export type AppDelivery = "push" | "inbox" | "off" | "none";

/** /api/alerts. */
export interface AlertsResponse {
  alerts: PriceAlert[];
  /**
   * Where a crossing goes, for the website.
   * `telegram`: a linked chat with price alerts on.
   * `app`: the Android app, with price alerts on — push and its inbox.
   * `inbox`: the app has it, but push is off (price alerts switched off, or
   *   no device with notifications allowed) — it lands in the inbox only.
   * `muted`: a linked chat with price alerts switched off, and no app.
   * `null`: no chat and no app, so nothing is ever sent.
   */
  delivery: "telegram" | "app" | "inbox" | "muted" | null;
  /** The same answer in the app's terms. */
  appDelivery: AppDelivery;
  error: string | null;
}
