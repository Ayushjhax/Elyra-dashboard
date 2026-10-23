import { describe, expect, it } from "vitest";
import type { AccountEvent } from "@/lib/activity/events";
import {
  READ_ID_LIMIT,
  groupByDay,
  isUnread,
  notificationsFrom,
  rememberRead,
  toNotification,
} from "@/lib/activity/notifications";

function event(over: Partial<AccountEvent>): AccountEvent {
  return {
    id: "e1",
    kind: "alert",
    text: "SOL crossed above $150.00 at $151.20 — alert sent to Telegram",
    at: "2026-10-16T09:00:00.000Z",
    status: "confirmed",
    href: null,
    agent: true,
    attention: true,
    ...over,
  };
}

describe("toNotification", () => {
  it("rings only for events that ask for attention and have a time", () => {
    expect(toNotification(event({ attention: false }))).toBeNull();
    expect(toNotification(event({ at: null }))).toBeNull();
  });

  it("names each kind and sends it somewhere it can be acted on", () => {
    expect(toNotification(event({}))).toMatchObject({ category: "alert", title: "Price alert triggered", target: { kind: "alerts" } });
    expect(
      toNotification(event({ id: "a", kind: "action", text: "Swap 2 SOL to USDC — awaiting your review", status: "pending" })),
    ).toMatchObject({ category: "action", description: "Swap 2 SOL to USDC", target: { kind: "review-actions" } });
    expect(
      toNotification(event({ id: "t", kind: "transaction", status: "failed", text: "Failed: swapped 2 SOL", href: "https://solscan.io/tx/x" })),
    ).toMatchObject({ category: "failed", title: "Transaction failed", description: "Swapped 2 SOL", target: { kind: "link", external: true } });
  });

  it("offers no destination where there is none", () => {
    expect(toNotification(event({ id: "v", kind: "venue", status: "failed", text: "Order rejected", href: null }))?.target).toBeNull();
  });
});

describe("read state", () => {
  const item = notificationsFrom([event({})])[0];

  it("is unread when newer than the watermark and not opened", () => {
    expect(isUnread(item, null, [])).toBe(true);
    expect(isUnread(item, "2026-10-16T08:00:00.000Z", [])).toBe(true);
    expect(isUnread(item, "2026-10-16T09:00:00.000Z", [])).toBe(false);
    expect(isUnread(item, null, ["e1"])).toBe(false);
  });

  it("remembers what was opened, newest first and bounded", () => {
    const many = Array.from({ length: READ_ID_LIMIT }, (_, index) => `id${index}`);
    const next = rememberRead(many, "fresh");
    expect(next[0]).toBe("fresh");
    expect(next).toHaveLength(READ_ID_LIMIT);
    expect(rememberRead(["a", "b"], "b")).toEqual(["b", "a"]);
  });
});

describe("groupByDay", () => {
  it("puts each day's notifications under one label, newest first", () => {
    const now = Date.parse("2026-10-16T12:00:00.000Z");
    const items = notificationsFrom([
      event({ id: "1", at: "2026-10-16T10:00:00.000Z" }),
      event({ id: "2", at: "2026-10-15T10:00:00.000Z" }),
      event({ id: "3", at: "2026-10-16T11:00:00.000Z" }),
    ]);
    expect(groupByDay(items, now).map((group) => [group.label, group.items.map((entry) => entry.id)])).toEqual([
      ["Today", ["3", "1"]],
      ["Yesterday", ["2"]],
    ]);
  });
});
