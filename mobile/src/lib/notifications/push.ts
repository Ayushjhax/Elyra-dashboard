import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  AndroidImportance,
  AndroidNotificationVisibility,
} from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { api, APP_VERSION } from "~/lib/api";
import { currentAccount, onAccountChange } from "~/lib/session";
import { onAccountLeave } from "~/lib/auth/accountChange";
import { saveNotificationPreferences } from "~/lib/notifications/stores";
import type { NotificationFlag } from "@/lib/notifications/types";
import { color } from "~/theme/tokens";

export type PushStatus = "checking" | "on" | "off" | "not-registered";
interface Prompt {
  flag?: NotificationFlag;
  label: string;
}
interface PushState {
  status: PushStatus;
  granted: boolean;
  priceChannelEnabled: boolean | null;
  canAskAgain: boolean;
  error: string | null;
  busy: boolean;
  prompt: Prompt | null;
}
export const usePushState = create<PushState>(() => ({
  status: "checking",
  granted: false,
  priceChannelEnabled: null,
  canAskAgain: true,
  error: null,
  busy: false,
  prompt: null,
}));
interface Session {
  account: string;
  getToken: () => Promise<string | null>;
}
let session: Session | null = null;
let revision = 0;
let statusRead = 0;
let controller: AbortController | null = null;
let queue: Promise<unknown> = Promise.resolve();
// Captured credentials are used only to remove a device from the account that
// registered it. A later account's token must never be used for this DELETE.
let registration: { account: string; token: string; bearer: string } | null =
  null;
const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
  const next = queue.catch(() => {}).then(work);
  queue = next;
  return next;
};
export async function createNotificationChannels() {
  if (Platform.OS !== "android") return;
  const channels = [
    ["price-alerts", "Price alerts", AndroidImportance.HIGH],
    ["liquidation", "Liquidation warnings", AndroidImportance.HIGH],
    ["market-moves", "Market moves", AndroidImportance.DEFAULT],
    ["prediction-markets", "Prediction markets", AndroidImportance.DEFAULT],
    ["daily-summary", "Daily summary", AndroidImportance.LOW],
    ["system", "System", AndroidImportance.DEFAULT],
  ] as const;
  await Promise.all(
    channels.map(([id, name, importance]) =>
      Notifications.setNotificationChannelAsync(id, {
        name,
        importance,
        lightColor: color.accent,
        sound: importance >= AndroidImportance.DEFAULT ? "default" : undefined,
        lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
      }),
    ),
  );
}
async function deleteRegistration(account: string) {
  const record = registration;
  if (!record || record.account !== account) return;
  await api.delete(
    "/api/devices",
    { expoPushToken: record.token },
    { auth: false, headers: { authorization: `Bearer ${record.bearer}` } },
  );
  if (registration === record) registration = null;
}
export function endPushSession(account: string) {
  return enqueue(() => deleteRegistration(account));
}
onAccountLeave(endPushSession);
onAccountChange((account) => {
  revision++;
  controller?.abort();
  controller = null;
  usePushState.setState({
    status: "checking",
    granted: false,
    priceChannelEnabled: null,
    error: null,
    prompt: null,
    busy: false,
  });
  if (registration && registration.account !== account)
    void endPushSession(registration.account).catch(() => {});
  if (session?.account === account) void refreshPushStatus();
});
export function startPushSession(next: Session) {
  session = next;
  if (currentAccount() === next.account) void refreshPushStatus();
}
export function clearPushSession(account: string) {
  if (session?.account === account) session = null;
}

const PERMISSION_REQUESTED = "elyra.notifications-permission-requested";
async function permissionWasRequested() {
  return (await SecureStore.getItemAsync(PERMISSION_REQUESTED).catch(() => null)) === "1";
}
/** Checks are safe on launch. Only acceptPushPrompt requests permission. */
export async function refreshPushStatus(
  nativeToken?: Notifications.DevicePushToken,
): Promise<void> {
  const ticket = revision;
  const readTicket = ++statusRead;
  const live = session;
  if (!live || currentAccount() !== live.account) return;
  const current = () =>
    revision === ticket &&
    statusRead === readTicket &&
    session?.account === live.account &&
    currentAccount() === live.account;
  try {
    const permission = await Notifications.getPermissionsAsync();
    const previouslyRequested = !permission.granted && await permissionWasRequested();
    if (!current()) return;
    usePushState.setState({
      granted: permission.granted,
      canAskAgain: permission.canAskAgain,
      status: permission.granted
        ? "not-registered"
        : (!permission.canAskAgain || previouslyRequested)
          ? "off"
          : "not-registered",
      error: null,
      busy: false,
    });
    if (!permission.granted) {
      if (registration?.account === live.account)
        await endPushSession(live.account);
      return;
    }
    await enqueue(async () => {
      if (!current()) return;
      usePushState.setState({ busy: true });
      const bearer = await live.getToken();
      if (!current()) return;
      if (!bearer) throw new Error("Sign in again to register notifications.");
      if (!Device.isDevice)
        throw new Error("Register push notifications on a real device.");
      const projectId =
        Constants.easConfig?.projectId ??
        Constants.expoConfig?.extra?.eas?.projectId;
      if (typeof projectId !== "string" || !projectId)
        throw new Error("This build has no EAS project configured.");
      await createNotificationChannels();
      if (Platform.OS === "android") {
        const channel =
          await Notifications.getNotificationChannelAsync("price-alerts");
        if (!current()) return;
        usePushState.setState({
          priceChannelEnabled:
            channel !== null && channel.importance !== AndroidImportance.NONE,
        });
      }
      const token = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
          ...(nativeToken ? { devicePushToken: nativeToken } : {}),
        })
      ).data;
      if (!current()) return;
      if (
        registration &&
        (registration.account !== live.account || registration.token !== token)
      )
        await deleteRegistration(registration.account);
      // Keep the record before POST: if the connection fails after the server
      // accepted it, sign-out still knows which token must be removed.
      registration = { account: live.account, token, bearer };
      controller = new AbortController();
      await api.post(
        "/api/devices",
        {
          expoPushToken: token,
          platform: Platform.OS,
          appVersion: APP_VERSION,
          deviceName: Device.modelName,
        },
        {
          auth: false,
          headers: { authorization: `Bearer ${bearer}` },
          signal: controller.signal,
        },
      );
      if (!current()) {
        await deleteRegistration(live.account);
        return;
      }
      usePushState.setState({ status: "on", error: null });
    });
  } catch (failure) {
    if (current())
      usePushState.setState({
        status: "not-registered",
        error:
          failure instanceof Error
            ? failure.message
            : "Push registration failed. Try again.",
      });
  } finally {
    if (current()) usePushState.setState({ busy: false });
  }
}
export function offerPushPrompt(label: string, flag?: NotificationFlag) {
  usePushState.setState({ prompt: { label, flag }, error: null });
}
export function dismissPushPrompt() {
  usePushState.setState({ prompt: null });
}
export async function acceptPushPrompt() {
  const prompt = usePushState.getState().prompt;
  if (!prompt || usePushState.getState().busy) return;
  const ticket = revision;
  usePushState.setState({ busy: true, error: null });
  try {
    if (prompt.flag) await saveNotificationPreferences({ [prompt.flag]: true });
    if (ticket !== revision) return;
    const permission = await Notifications.getPermissionsAsync();
    if (ticket !== revision) return;
    const previouslyRequested = await permissionWasRequested();
    if (ticket !== revision) return;
    if (!permission.granted && (!permission.canAskAgain || previouslyRequested)) {
      usePushState.setState({ prompt: null });
      await Linking.openSettings();
      return;
    }
    await createNotificationChannels();
    if (!permission.granted) {
      await Notifications.requestPermissionsAsync();
      await SecureStore.setItemAsync(PERMISSION_REQUESTED, "1").catch(() => {});
    }
    if (ticket !== revision) return;
    usePushState.setState({ prompt: null });
    await refreshPushStatus();
  } catch (failure) {
    if (ticket === revision)
      usePushState.setState({
        error:
          failure instanceof Error ? failure.message : "Could not enable push.",
      });
  } finally {
    if (ticket === revision) usePushState.setState({ busy: false });
  }
}
const offered = new Set<string>();
export async function offerPushForFirstAlert() {
  const account = currentAccount();
  if (!account || offered.has(account)) return;
  offered.add(account);
  let saved: string[] = [];
  try {
    saved = JSON.parse(
      (await SecureStore.getItemAsync("elyra.notification-alert-prompts")) ??
        "[]",
    );
  } catch {
    /* Offer in context if storage was unavailable. */
  }
  if (saved.includes(account) || currentAccount() !== account) return;
  await SecureStore.setItemAsync(
    "elyra.notification-alert-prompts",
    JSON.stringify([...saved, account].slice(-20)),
  ).catch(() => {});
  if (currentAccount() === account)
    offerPushPrompt("Price alerts", "priceAlerts");
}
export async function fixPush() {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && (!permission.canAskAgain || await permissionWasRequested())) await Linking.openSettings();
  else if (permission.granted) await refreshPushStatus();
  else offerPushPrompt("The notification types you turn on");
}
export function pushStatusLabel(status: PushStatus) {
  return {
    checking: "Checking push status…",
    on: "Push is on",
    off: "Off in system settings",
    "not-registered": "Push is not registered",
  }[status];
}
export function notificationDeliveryLine(
  enabled: boolean | undefined,
  status: PushStatus,
  priceChannelEnabled: boolean | null = null,
) {
  if (enabled === undefined || status === "checking")
    return {
      title: "Checking delivery…",
      detail: "Your inbox works regardless of push permission.",
    };
  if (!enabled)
    return {
      title: "Inbox only · price pushes are off",
      detail:
        "Alerts you set are kept in your inbox. Turn on price alerts to receive a push.",
    };
  if (priceChannelEnabled === false)
    return {
      title: "Inbox only",
      detail:
        "The Price alerts channel is off in system settings. Your inbox still receives the alert.",
    };
  if (status === "on")
    return {
      title: "Push + inbox",
      detail: "A crossing is sent to this phone and kept in your inbox.",
    };
  return {
    title: "Inbox only",
    detail:
      status === "off"
        ? "Notifications are off in system settings. Your inbox still receives the alert."
        : "Push is not registered on this phone. Your inbox still receives the alert.",
  };
}
