import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   The app's notification channel: devices, the inbox, and the one delivery
   pass that claims an event once and then reaches every channel.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  db: null as unknown as import("@/lib/test/supabase-fake").FakeSupabase,
  price: 150,
  pushes: [] as Array<{ to: string; title: string; data: Record<string, unknown> }>,
  telegram: [] as Array<{ chatId: number; text: string }>,
  ticket: { status: "ok", id: "ticket-1" } as Record<string, unknown>,
}));

vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("expo-server-sdk", () => ({
  Expo: class {
    static isExpoPushToken(token: unknown): boolean {
      return typeof token === "string" && /^Expo(nent)?PushToken\[.+\]$/.test(token);
    }
    chunkPushNotifications<T>(messages: T[]): T[][] {
      return [messages];
    }
    chunkPushNotificationReceiptIds(ids: string[]): string[][] {
      return [ids];
    }
    async sendPushNotificationsAsync(messages: Array<{ to: string; title: string; data: Record<string, unknown> }>) {
      state.pushes.push(...messages);
      return messages.map(() => state.ticket);
    }
    async getPushNotificationReceiptsAsync() {
      return {};
    }
  },
}));
vi.mock("@/lib/providers/binance-public", () => ({
  binanceTicker: async () => ({ ok: true, data: { lastPrice: state.price, change24hPct: 0 } }),
}));
vi.mock("@/lib/telegram/api", () => ({
  sendMessage: async (chatId: number, text: string) => {
    state.telegram.push({ chatId, text });
  },
}));
vi.mock("@/lib/providers/router", () => ({ routeDefiPositions: async () => ({ ok: true, data: [] }) }));
vi.mock("@/lib/prediction/account", () => ({ predictionAccount: async () => null }));
vi.mock("@/lib/prediction/worker", () => ({
  runPredictionWorker: async () => ({
    alertsChecked: 0,
    signalsChecked: 0,
    errors: 0,
    alertsFired: [],
    lifecycleChanges: [],
  }),
}));
vi.mock("@/lib/portfolio/compose", () => ({ composePortfolio: async () => null }));

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const TOKEN = "ExponentPushToken[abc123]";

function preferences(userId: string, priceAlerts: boolean) {
  state.db.seed("telegram_notification_preferences", [
    {
      user_id: userId,
      price_alerts: priceAlerts,
      liquidation_alerts: false,
      large_moves: false,
      daily_summary: false,
      daily_summary_minute: 540,
      timezone: "UTC",
      move_threshold_pct: 5,
      prediction_alerts: false,
      prediction_order_updates: false,
      prediction_resolution_alerts: false,
      prediction_move_threshold_points: 10,
    },
  ]);
}

function device(userId: string, disabled = false) {
  state.db.seed("push_devices", [
    {
      id: `device-${userId}`,
      user_id: userId,
      expo_push_token: TOKEN,
      platform: "android",
      app_version: "1.0.0",
      device_name: null,
      disabled_at: disabled ? "2026-10-01T00:00:00Z" : null,
      disabled_reason: null,
    },
  ]);
}

function crossingAlert(userId: string) {
  state.db.seed("price_alerts", [
    { id: "alert-1", user_id: userId, symbol: "SOL", direction: "above", target: 120, created_price: 100, triggered_at: null },
  ]);
}

beforeEach(async () => {
  state.db = new FakeSupabase();
  state.db.seed("profiles", [
    { id: USER_A, privy_did: "did:a", solana_address: null },
    { id: USER_B, privy_did: "did:b", solana_address: null },
  ]);
  state.pushes = [];
  state.telegram = [];
  state.ticket = { status: "ok", id: "ticket-1" };
  state.price = 150;
  const { resetPushClient } = await import("@/lib/notifications/push");
  resetPushClient();
});

describe("devices", () => {
  it("refuses what is not an Expo push token", async () => {
    const { parseRegistration } = await import("@/lib/notifications/devices");
    expect(parseRegistration({ expoPushToken: "fcm:abc", platform: "android", appVersion: "1.0.0" })).toHaveProperty("error");
    expect(parseRegistration({ expoPushToken: TOKEN, platform: "windows", appVersion: "1.0.0" })).toHaveProperty("error");
    expect(parseRegistration({ expoPushToken: TOKEN, platform: "android" })).toHaveProperty("error");
    expect(parseRegistration({ expoPushToken: TOKEN, platform: "android", appVersion: "1.0.0" })).toEqual({
      expoPushToken: TOKEN,
      platform: "android",
      appVersion: "1.0.0",
      deviceName: null,
    });
  });

  it("moves a token to whoever registers it last — never shares it", async () => {
    const { registerDevice } = await import("@/lib/notifications/devices");
    const registration = { expoPushToken: TOKEN, platform: "android" as const, appVersion: "1.0.0", deviceName: null };

    expect(await registerDevice(USER_A, registration)).toBe(true);
    expect(await registerDevice(USER_B, registration)).toBe(true);

    const rows = state.db.rows("push_devices");
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(USER_B);
  });

  it("re-enables a device Expo had reported gone", async () => {
    device(USER_A, true);
    const { registerDevice } = await import("@/lib/notifications/devices");
    await registerDevice(USER_A, { expoPushToken: TOKEN, platform: "android", appVersion: "1.1.0", deviceName: null });
    expect(state.db.rows("push_devices")[0].disabled_at).toBeNull();
  });

  it("unregisters only from the account asking", async () => {
    device(USER_A);
    const { unregisterDevice } = await import("@/lib/notifications/devices");
    await unregisterDevice(USER_B, TOKEN);
    expect(state.db.rows("push_devices")).toHaveLength(1);
    await unregisterDevice(USER_A, TOKEN);
    expect(state.db.rows("push_devices")).toHaveLength(0);
  });
});

describe("the inbox", () => {
  it("shows and marks only the caller's own entries", async () => {
    const { addToInbox, markRead, readInbox } = await import("@/lib/notifications/inbox");
    const mine = await addToInbox({ userId: USER_A, kind: "system", title: "Mine", body: "a", data: {} });
    const theirs = await addToInbox({ userId: USER_B, kind: "system", title: "Theirs", body: "b", data: {} });

    const page = await readInbox(USER_A, null);
    expect(page?.notifications.map((entry) => entry.title)).toEqual(["Mine"]);
    expect(page?.unread).toBe(1);

    /* B's id, asked for by A, changes nothing. */
    await markRead(USER_A, { ids: [theirs!] });
    expect(state.db.rows("notifications").find((row) => row.id === theirs)?.read_at ?? null).toBeNull();

    await markRead(USER_A, { ids: [mine!] });
    expect((await readInbox(USER_A, null))?.unread).toBe(0);
  });
});

describe("channels", () => {
  it("routes by preference, except an alert the person set reaches the inbox anyway", async () => {
    const { channelsFor } = await import("@/lib/notifications/deliver");
    const withApp = {
      userId: USER_A,
      solanaAddress: null,
      chatId: null,
      hasApp: true,
      devices: [{ disabled_at: null } as never],
    };
    expect(channelsFor(withApp, true)).toEqual({ telegram: false, inbox: true, push: true });
    expect(channelsFor(withApp, false)).toEqual({ telegram: false, inbox: false, push: false });
    expect(channelsFor(withApp, false, true)).toEqual({ telegram: false, inbox: true, push: false });
    expect(channelsFor({ ...withApp, hasApp: false, devices: [], chatId: 42 }, true)).toEqual({
      telegram: true,
      inbox: false,
      push: false,
    });
  });
});

describe("the delivery pass", () => {
  it("sends a crossing to the inbox and as a push, with where a tap goes", async () => {
    preferences(USER_A, true);
    device(USER_A);
    crossingAlert(USER_A);

    const { deliverNotifications } = await import("@/lib/notifications/deliver");
    const report = await deliverNotifications();

    expect(report.sent).toBe(1);
    const inbox = state.db.rows("notifications");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ user_id: USER_A, kind: "price_alert", title: "SOL crossed above $120.00" });
    /* Never a figure without its chain: the level, the price now, what changed. */
    expect(String(inbox[0].body)).toContain("Now: $150.00");
    expect(String(inbox[0].body)).toContain("+50.0%");

    expect(state.pushes).toHaveLength(1);
    expect(state.pushes[0].data).toEqual({ notificationId: inbox[0].id, route: "/asset/SOL" });
    expect(state.db.rows("push_tickets")).toHaveLength(1);
    expect(state.db.rows("price_alerts")[0].triggered_at).not.toBeNull();
  });

  it("puts an alert the person set in the inbox even with price alerts off — and does not push it", async () => {
    preferences(USER_A, false);
    device(USER_A);
    crossingAlert(USER_A);

    const { deliverNotifications } = await import("@/lib/notifications/deliver");
    await deliverNotifications();

    expect(state.db.rows("notifications")).toHaveLength(1);
    expect(state.pushes).toHaveLength(0);
  });

  it("claims an event once, even when two passes overlap", async () => {
    preferences(USER_A, true);
    device(USER_A);
    crossingAlert(USER_A);

    const { deliverNotifications } = await import("@/lib/notifications/deliver");
    await Promise.all([deliverNotifications(), deliverNotifications()]);

    expect(state.db.rows("notifications")).toHaveLength(1);
    expect(state.pushes).toHaveLength(1);
  });

  it("leaves an alert armed when no channel could carry it", async () => {
    crossingAlert(USER_A);
    const { deliverNotifications } = await import("@/lib/notifications/deliver");
    await deliverNotifications();
    expect(state.db.rows("price_alerts")[0].triggered_at).toBeNull();
  });

  it("disables a device Expo says is gone, and keeps the inbox entry", async () => {
    preferences(USER_A, true);
    device(USER_A);
    crossingAlert(USER_A);
    state.ticket = { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } };

    const { deliverNotifications } = await import("@/lib/notifications/deliver");
    await deliverNotifications();

    expect(state.db.rows("push_devices")[0].disabled_reason).toBe("DeviceNotRegistered");
    expect(state.db.rows("notifications")).toHaveLength(1);
  });
});

describe("the watchlist", () => {
  it("normalises symbols the way the agent does, and refuses what cannot be one", async () => {
    const { watchlistSymbol } = await import("@/lib/watchlist");
    expect(watchlistSymbol(" sol-perp ")).toBe("SOL");
    expect(watchlistSymbol("SOLUSDT")).toBe("SOL");
    expect(watchlistSymbol("not a symbol")).toBeNull();
    expect(watchlistSymbol(42)).toBeNull();
  });

  it("adds in order, refuses past the cap, and reorders only the same set", async () => {
    const { addToWatchlist, reorderWatchlist, WATCHLIST_MAX } = await import("@/lib/watchlist");
    expect(await addToWatchlist(USER_A, "SOL")).toEqual({ symbols: ["SOL"] });
    expect(await addToWatchlist(USER_A, "BTC")).toEqual({ symbols: ["SOL", "BTC"] });
    /* Adding one already there is not an error, and not a second row. */
    expect(await addToWatchlist(USER_A, "SOL")).toEqual({ symbols: ["SOL", "BTC"] });

    expect(await reorderWatchlist(USER_A, ["BTC", "SOL"])).toEqual({ symbols: ["BTC", "SOL"] });
    expect(await reorderWatchlist(USER_A, ["BTC", "ETH"])).toMatchObject({ status: 409 });

    for (let index = 0; index < WATCHLIST_MAX; index += 1) await addToWatchlist(USER_B, `T${index}`);
    expect(await addToWatchlist(USER_B, "ONEMORE")).toMatchObject({ status: 400 });
  });
});
