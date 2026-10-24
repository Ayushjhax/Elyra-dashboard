import "server-only";

import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import { disableDevice } from "@/lib/notifications/devices";
import { serviceClient } from "@/lib/supabase/server";
import type { NotificationKind, PushDeviceRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Push, through Expo.

   Expo answers a send with a ticket at once; whether the phone's push service
   took it arrives later as a receipt. Ticket ids are kept (push_tickets) and
   read back on a later run, about fifteen minutes on, as Expo asks.

   DeviceNotRegistered — the app was uninstalled or the token rotated —
   disables the device, whether a ticket or a receipt says so. Any other error
   is recorded and the device left alone: a rate limit or an Expo outage is
   not a reason to stop telling someone about their liquidation.

   A claimed event is never re-sent. If the push fails, the inbox row it was
   written beside still stands; sending again would only risk a duplicate.
--------------------------------------------------------------------------- */

import { ANDROID_CHANNEL } from "@/lib/notifications/types";
export { ANDROID_CHANNEL } from "@/lib/notifications/types";

/** Expo asks for receipts to be read no sooner than this after the send. */
const RECEIPT_DELAY_MS = 15 * 60_000;

let client: Expo | null = null;
function expo(): Expo {
  if (client === null) {
    const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
    client = new Expo(accessToken ? { accessToken } : {});
  }
  return client;
}

/** Test seam. */
export function resetPushClient(): void {
  client = null;
}

export interface PushContent {
  kind: NotificationKind;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export interface PushResult {
  sent: number;
  failed: number;
}

/** Sends to every enabled device and records each ticket. */
export async function pushToDevices(
  devices: readonly PushDeviceRow[],
  content: PushContent,
  notificationId: string | null,
): Promise<PushResult> {
  const targets = devices.filter((device) => device.disabled_at === null);
  if (targets.length === 0) return { sent: 0, failed: 0 };

  const messages: ExpoPushMessage[] = targets.map((device) => ({
    to: device.expo_push_token,
    title: content.title,
    body: content.body,
    data: { ...content.data, kind: content.kind },
    channelId: ANDROID_CHANNEL[content.kind],
    priority: "high",
    sound: "default",
  }));

  let tickets: ExpoPushTicket[] = [];
  try {
    for (const chunk of expo().chunkPushNotifications(messages)) {
      tickets = tickets.concat(await expo().sendPushNotificationsAsync(chunk));
    }
  } catch (error) {
    console.error("[push] send failed", error instanceof Error ? error.message : error);
    return { sent: 0, failed: targets.length };
  }

  const result: PushResult = { sent: 0, failed: 0 };
  const records: Array<{ id: string; device_id: string; notification_id: string | null }> = [];
  for (const [index, ticket] of tickets.entries()) {
    const device = targets[index];
    if (device === undefined) continue;
    if (ticket.status === "ok") {
      result.sent += 1;
      records.push({ id: ticket.id, device_id: device.id, notification_id: notificationId });
      continue;
    }
    result.failed += 1;
    if (ticket.details?.error === "DeviceNotRegistered") {
      await disableDevice(device.id, "DeviceNotRegistered");
    } else {
      console.error("[push] ticket error", ticket.details?.error ?? ticket.message);
    }
  }

  if (records.length > 0) {
    const { error } = await serviceClient().from("push_tickets").insert(records);
    if (error) console.error("[push] could not record tickets", error.code);
  }
  return result;
}

/**
 * Reads the receipts that are due and acts on them. Run at the start of each
 * delivery pass, so a device gone since the last one is skipped this time.
 */
export async function checkReceipts(now: number = Date.now()): Promise<{ checked: number; disabled: number }> {
  const due = new Date(now - RECEIPT_DELAY_MS).toISOString();
  const { data } = await serviceClient()
    .from("push_tickets")
    .select("id, device_id")
    .is("checked_at", null)
    .lt("created_at", due)
    .limit(1000);
  const tickets = (data ?? []) as Array<{ id: string; device_id: string }>;
  if (tickets.length === 0) return { checked: 0, disabled: 0 };

  const outcome = { checked: 0, disabled: 0 };
  for (const chunk of expo().chunkPushNotificationReceiptIds(tickets.map((ticket) => ticket.id))) {
    let receipts: Awaited<ReturnType<Expo["getPushNotificationReceiptsAsync"]>>;
    try {
      receipts = await expo().getPushNotificationReceiptsAsync(chunk);
    } catch (error) {
      console.error("[push] receipts failed", error instanceof Error ? error.message : error);
      continue;
    }
    for (const id of chunk) {
      const receipt = receipts[id];
      /* Not ready, or already expired at Expo (they keep receipts a day): left
         for the next run, then dropped by the age limit above. */
      if (receipt === undefined) continue;
      const ticket = tickets.find((entry) => entry.id === id);
      const error = receipt.status === "error" ? (receipt.details?.error ?? "error") : null;
      await serviceClient()
        .from("push_tickets")
        .update({
          checked_at: new Date(now).toISOString(),
          receipt_status: error ?? "ok",
          receipt_message: receipt.status === "error" ? receipt.message : null,
        })
        .eq("id", id);
      outcome.checked += 1;
      if (error === "DeviceNotRegistered" && ticket !== undefined) {
        await disableDevice(ticket.device_id, "DeviceNotRegistered");
        outcome.disabled += 1;
      }
    }
  }
  return outcome;
}
