import {
  notificationIntent,
  ownedNotification,
} from "~/lib/notifications/intents";
const id = "11111111-1111-4111-8111-111111111111";
const inbox = {
  accountId: "caller",
  notifications: [
    {
      id,
      kind: "price_alert" as const,
      title: "Crossed",
      body: "Level reached",
      data: { route: "/asset/SOL" },
      createdAt: "2026-10-23T10:00:00Z",
      readAt: null,
    },
  ],
};
const intent = (data: Record<string, unknown>) =>
  notificationIntent({ identifier: "request", content: { data } });
it("accepts only the active inbox owner for new pushes", () => {
  expect(
    ownedNotification(
      intent({ accountId: "another", notificationId: id, route: "/asset/BTC" }),
      inbox,
    ),
  ).toBeNull();
  expect(
    ownedNotification(
      intent({ accountId: "caller", notificationId: id, route: "/asset/SOL" }),
      inbox,
    )?.route,
  ).toBe("/asset/SOL");
});
it("resolves legacy pushes from the authenticated inbox, using the saved route", () => {
  expect(
    ownedNotification(
      intent({ notificationId: id, route: "/asset/BTC" }),
      inbox,
    )?.route,
  ).toBe("/asset/SOL");
  expect(
    ownedNotification(
      intent({ notificationId: "22222222-2222-4222-8222-222222222222" }),
      inbox,
    ),
  ).toBeNull();
});
it("waits for an authenticated inbox and rejects malformed legacy IDs", () => {
  expect(ownedNotification(intent({ notificationId: id }), null)).toBeNull();
  expect(intent({ notificationId: "not-a-notification" })).toBeNull();
});
