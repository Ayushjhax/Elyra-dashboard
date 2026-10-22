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
