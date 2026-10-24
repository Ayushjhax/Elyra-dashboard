import { describe, expect, it } from "vitest";
import { accountEvents } from "@/lib/activity/events";

const explorer = (signature: string) => `https://explorer/${signature}`;

describe("accountEvents", () => {
  it("merges every source newest first, pending-without-time on top", () => {
    const events = accountEvents({
      alertNote: "alert sent to Telegram",
      wallet: [
        { signature: "old", status: "confirmed", slot: 1, at: "2026-10-12T00:00:00Z", memo: null },
        { signature: "new", status: "pending", slot: 2, at: null, memo: null },
      ],
      venue: [
        {
          id: "v",
          kind: "perp_close",
          summary: "Closed SOL-PERP",
          venue: "hyperliquid",
          status: "confirmed",
          at: "2026-10-13T00:00:00Z",
          href: null,
        },
      ],
      alerts: [
        {
          id: "a",
          symbol: "SOL",
          direction: "above",
          target: 120,
          createdPrice: 100,
          triggeredAt: "2026-10-14T00:00:00Z",
          triggeredPrice: 121.5,
        },
        { id: "armed", symbol: "BTC", direction: "below", target: 90_000, createdPrice: null, triggeredAt: null },
      ],
      actions: [],
      explorer,
    });

    expect(events.map((event) => event.id)).toEqual([
      "tx:new",
      "alert:a:2026-10-14T00:00:00Z",
      "venue:v",
      "tx:old",
    ]);
    expect(events[1].text).toBe("SOL crossed above $120.0000 at $121.5000 — alert sent to Telegram");
    expect(events[3].href).toBe("https://explorer/old");
  });

  it("rings the bell for failures, fired alerts and actions, not routine transactions", () => {
    const events = accountEvents({
      alertNote: "alert sent to Telegram",
      wallet: [
        { signature: "ok", status: "confirmed", slot: 1, at: "2026-10-12T00:00:00Z", memo: null },
        { signature: "bad", status: "failed", slot: 2, at: "2026-10-12T01:00:00Z", memo: null },
      ],
      venue: [],
      alerts: [],
      actions: [
        {
          id: "x",
          surface: "telegram",
          status: "prepared",
          expiresAt: "2026-10-14T00:10:00Z",
          action: {
            id: "act",
            kind: "swap",
            summary: "Swap 2 SOL to USDC",
            fields: [],
            readiness: "ready",
            reason: null,
            warnings: [],
            preparedAt: "2026-10-14T00:00:00Z",
          },
        },
      ],
      explorer,
    });
    const attention = Object.fromEntries(events.map((event) => [event.id, event.attention]));
    expect(attention).toEqual({ "action:x": true, "tx:bad": true, "tx:ok": false });
  });
});
