import "server-only";

import { Expo } from "expo-server-sdk";
import { serviceClient } from "@/lib/supabase/server";
import type { PushDeviceRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The Android app's registered phones.

   A push token belongs to ONE account at a time. When someone else signs in
   on the same phone, the row moves to them — it is never shared — so one
   person's balances never reach another person's lock screen. Signing out
   unregisters the token outright.

   A device Expo reports as gone is disabled rather than deleted: the reason
   stays visible, and the next registration from that phone clears it.
--------------------------------------------------------------------------- */

export interface DeviceRegistration {
  expoPushToken: string;
  platform: "android" | "ios";
  appVersion: string;
  deviceName: string | null;
}

/** A body's fields, validated, or the reason they are not. */
export function parseRegistration(body: Record<string, unknown>): DeviceRegistration | { error: string } {
  const token = typeof body.expoPushToken === "string" ? body.expoPushToken.trim() : "";
  if (!Expo.isExpoPushToken(token) || token.length > 200) {
    return { error: "That is not an Expo push token." };
  }
  if (body.platform !== "android" && body.platform !== "ios") {
    return { error: "platform must be android or ios." };
  }
  const appVersion = typeof body.appVersion === "string" ? body.appVersion.trim() : "";
  if (appVersion.length === 0 || appVersion.length > 32) {
    return { error: "appVersion is required." };
  }
  const deviceName =
    typeof body.deviceName === "string" && body.deviceName.trim().length > 0
      ? body.deviceName.trim().slice(0, 80)
      : null;
  return { expoPushToken: token, platform: body.platform, appVersion, deviceName };
}

/**
 * Registers or refreshes this account's device. An upsert on the token, so a
 * token registered by another account moves here and is enabled again.
 */
export async function registerDevice(userId: string, device: DeviceRegistration): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await serviceClient()
    .from("push_devices")
    .upsert(
      {
        user_id: userId,
        expo_push_token: device.expoPushToken,
        platform: device.platform,
        app_version: device.appVersion,
        device_name: device.deviceName,
        last_seen_at: now,
        disabled_at: null,
        disabled_reason: null,
      },
      { onConflict: "expo_push_token" },
    );
  if (error) {
    console.error("[devices] could not register", error.code);
    return false;
  }
  return true;
}

/** Removes the token — only from the account asking, so nobody can unregister another person's phone. */
export async function unregisterDevice(userId: string, expoPushToken: string): Promise<boolean> {
  const { error } = await serviceClient()
    .from("push_devices")
    .delete()
    .eq("user_id", userId)
    .eq("expo_push_token", expoPushToken);
  return !error;
}

/** Every device of these accounts, enabled or not, keyed by account. */
export async function devicesFor(userIds: readonly string[]): Promise<Map<string, PushDeviceRow[]>> {
  const byUser = new Map<string, PushDeviceRow[]>();
  if (userIds.length === 0) return byUser;
  const { data } = await serviceClient().from("push_devices").select("*").in("user_id", [...userIds]);
  for (const row of (data ?? []) as PushDeviceRow[]) {
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
  }
  return byUser;
}

/** Every account that has the app — anyone who has registered a device, even one since disabled. */
export async function accountsWithApp(): Promise<string[]> {
  const { data } = await serviceClient().from("push_devices").select("user_id").limit(5000);
  return [...new Set((data ?? []).map((row) => String(row.user_id)))];
}

export async function disableDevice(deviceId: string, reason: string): Promise<void> {
  await serviceClient()
    .from("push_devices")
    .update({ disabled_at: new Date().toISOString(), disabled_reason: reason })
    .eq("id", deviceId);
}
