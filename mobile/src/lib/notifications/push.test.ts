import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { api } from "~/lib/api";
import { setAccount } from "~/lib/session";
import {
  acceptPushPrompt,
  clearPushSession,
  createNotificationChannels,
  dismissPushPrompt,
  endPushSession,
  fixPush,
  notificationDeliveryLine,
  offerPushPrompt,
  refreshPushStatus,
  startPushSession,
  usePushState,
} from "~/lib/notifications/push";

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getNotificationChannelAsync: jest.fn(async () => ({ importance: 6 })),
  AndroidImportance: { HIGH: 6, DEFAULT: 5, LOW: 4, NONE: 1 },
  AndroidNotificationVisibility: { PRIVATE: 2 },
}));
jest.mock("expo-device", () => ({ isDevice: true, modelName: "Seeker" }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { easConfig: { projectId: "project-id" } },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
}));
jest.mock("~/lib/api", () => ({
  APP_VERSION: "2.0.0",
  api: { post: jest.fn(), delete: jest.fn() },
}));
jest.mock("~/lib/notifications/stores", () => ({
  saveNotificationPreferences: jest.fn(async () => {}),
}));
const permissions = Notifications.getPermissionsAsync as jest.Mock;
const request = Notifications.requestPermissionsAsync as jest.Mock;
const token = Notifications.getExpoPushTokenAsync as jest.Mock;
const post = api.post as jest.Mock;
const remove = api.delete as jest.Mock;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const granted = { granted: true, status: "granted", canAskAgain: true };
const denied = { granted: false, status: "denied", canAskAgain: false };
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, "OS", {
    value: "android",
    configurable: true,
  });
  permissions.mockResolvedValue({
    granted: false,
    status: "undetermined",
    canAskAgain: true,
  });
  token.mockResolvedValue({ data: "ExponentPushToken[test]" });
  post.mockResolvedValue({ ok: true });
  remove.mockResolvedValue({ ok: true });
  jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  setAccount("account-a");
  startPushSession({ account: "account-a", getToken: async () => "bearer-a" });
});
afterEach(async () => {
  dismissPushPrompt();
  await endPushSession("account-a");
  await endPushSession("account-b");
  clearPushSession("account-a");
  clearPushSession("account-b");
  setAccount(null);
});
it("does not request permission or a token at launch when permission is undetermined", async () => {
  await refreshPushStatus();
  expect(request).not.toHaveBeenCalled();
  expect(token).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});
it("creates all Android channels with deliberate importance before requesting permission", async () => {
  request.mockImplementationOnce(async () => {
    permissions.mockResolvedValue(granted);
    return granted;
  });
  offerPushPrompt("Price alerts");
  await acceptPushPrompt();
  const channels = Notifications.setNotificationChannelAsync as jest.Mock;
  expect(channels.mock.calls.map(([id]) => id)).toEqual(
    expect.arrayContaining([
      "price-alerts-v2",
      "liquidation-v2",
      "market-moves-v2",
      "prediction-markets-v2",
      "daily-summary-v2",
    ]),
  );
  expect(channels.mock.invocationCallOrder[0]).toBeLessThan(
    request.mock.invocationCallOrder[0],
  );
  expect(token).toHaveBeenCalledWith({ projectId: "project-id" });
  expect(post).toHaveBeenCalledWith(
    "/api/devices",
    expect.objectContaining({
      expoPushToken: "ExponentPushToken[test]",
      appVersion: "2.0.0",
      platform: "android",
    }),
    expect.objectContaining({
      auth: false,
      headers: { authorization: "Bearer bearer-a" },
    }),
  );
  expect(usePushState.getState().status).toBe("on");
});
it("points a denied permission at system settings and never repeats the system prompt on launch", async () => {
  permissions.mockResolvedValue(denied);
  await refreshPushStatus();
  await fixPush();
  expect(usePushState.getState().status).toBe("off");
  expect(Linking.openSettings).toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(notificationDeliveryLine(true, "off").title).toBe("Inbox only");
});
it("uses the refreshed native token to obtain and POST an Expo token", async () => {
  permissions.mockResolvedValue(granted);
  await refreshPushStatus({ type: "android", data: "native-rotated" });
  expect(token).toHaveBeenCalledWith({
    projectId: "project-id",
    devicePushToken: { type: "android", data: "native-rotated" },
  });
});
it("unregisters with the leaving account's captured bearer before the next account can own the token", async () => {
  permissions.mockResolvedValue(granted);
  await refreshPushStatus();
  await endPushSession("account-a");
  expect(remove).toHaveBeenCalledWith(
    "/api/devices",
    { expoPushToken: "ExponentPushToken[test]" },
    { auth: false, headers: { authorization: "Bearer bearer-a" } },
  );
});
it("drops a registration whose token arrives after the account changed", async () => {
  permissions.mockResolvedValue(granted);
  let release!: (value: unknown) => void;
  token.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const registering = refreshPushStatus();
  await tick();
  setAccount("account-b");
  clearPushSession("account-a");
  release({ data: "ExponentPushToken[old-account]" });
  await registering;
  expect(post).not.toHaveBeenCalled();
  expect(usePushState.getState().status).not.toBe("on");
});
it("keeps configured-off price pushes distinct from a phone with blocked permission", () => {
  expect(notificationDeliveryLine(false, "on").title).toContain(
    "price pushes are off",
  );
  expect(notificationDeliveryLine(true, "on").title).toBe("Push + inbox");
});
it("does not bypass do-not-disturb for urgent channels", async () => {
  await createNotificationChannels();
  expect(
    (Notifications.setNotificationChannelAsync as jest.Mock).mock.calls.every(
      ([, channel]) => !channel.bypassDnd,
    ),
  ).toBe(true);
});

it("does not let an old permission read overwrite a newer denial", async () => {
  let release!: (value: unknown) => void;
  permissions.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const old = refreshPushStatus();
  permissions.mockResolvedValue(denied);
  await refreshPushStatus();
  release(granted);
  await old;
  expect(usePushState.getState().status).toBe("off");
  expect(post).not.toHaveBeenCalled();
});
it("describes a blocked Android price channel as inbox only", () => {
  expect(notificationDeliveryLine(true, "on", false).title).toBe("Inbox only");
});

it("asks after the pre-prompt when Android initially reports denied but can still ask", async () => {
  permissions.mockResolvedValue({ granted: false, status: "denied", canAskAgain: true });
  await refreshPushStatus();
  expect(usePushState.getState().status).toBe("not-registered");
  request.mockImplementationOnce(async () => { permissions.mockResolvedValue(granted); return granted; });
  offerPushPrompt("Price alerts");
  await acceptPushPrompt();
  expect(request).toHaveBeenCalledTimes(1);
  expect(usePushState.getState().status).toBe("on");
});
