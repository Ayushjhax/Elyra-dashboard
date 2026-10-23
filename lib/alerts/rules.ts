import { priceDecimals } from "@/lib/market/precision";
import type { AppDelivery, PriceAlert } from "@/lib/alerts/types";

/* ---------------------------------------------------------------------------
   The rules a price alert is shown by — shared by the website's chart
   alerts and the Android app's, so the two never disagree about whether an
   alert has been crossed or where it goes.
--------------------------------------------------------------------------- */

/**
 * Whether the live price is already past an alert's level.
 *
 * The server stamps `triggeredAt` only when it delivers, so an alert can be
 * crossed and still read as armed until the next delivery pass. This is how
 * a screen says so honestly.
 */
export function isPast(alert: PriceAlert, price: number | null | undefined): boolean {
  if (price === null || price === undefined || !Number.isFinite(price)) return false;
  return alert.direction === "above" ? price >= alert.target : price <= alert.target;
}

/** How an alert reads in a list: fired, crossed but not yet delivered, or armed. */
export function alertState(alert: PriceAlert, price: number | null | undefined): "Fired" | "Crossed" | "Armed" {
  if (alert.triggeredAt) return "Fired";
  return isPast(alert, price) ? "Crossed" : "Armed";
}

/** A level two per cent either side of the price, at the instrument's precision. */
export function suggestedTarget(price: number | null, side: "above" | "below"): string {
  if (price === null || !Number.isFinite(price)) return "";
  const value = price * (side === "above" ? 1.02 : 0.98);
  return value.toFixed(priceDecimals(value));
}

/**
 * Where a crossing reaches the app — the same rule the delivery engine's
 * channelsFor applies (lib/notifications/deliver.ts): push needs the kind on
 * and a device that takes one; the inbox needs the app; an alert the person
 * set reaches the inbox even with the kind off.
 */
export function appDeliveryFor(input: { priceAlertsOn: boolean; hasApp: boolean; canPush: boolean }): AppDelivery {
  if (!input.hasApp) return "none";
  if (!input.priceAlertsOn) return "off";
  return input.canPush ? "push" : "inbox";
}

/** The line the app shows where an alert is set. */
export const APP_DELIVERY_LINE: Record<AppDelivery, { title: string; detail: string }> = {
  push: { title: "Push + inbox", detail: "A crossing is sent to this phone and kept in your inbox." },
  inbox: {
    title: "Inbox only — push is off",
    detail: "A crossing lands in your inbox. Allow notifications to be told at once.",
  },
  off: {
    title: "Price alerts are off",
    detail: "Alerts you set still land in your inbox. Turn price alerts on to get a push.",
  },
  none: {
    title: "Not delivered yet",
    detail: "Turn on notifications so a crossing can reach this phone. Until then it shows here when you look.",
  },
};
