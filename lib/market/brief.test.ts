import { describe, expect, it } from "vitest";
import type { PriceAlert } from "@/lib/alerts/types";
import { structureLine, watchNextLine } from "@/lib/market/brief";
import type { PriceRow } from "@/lib/market/pyth/types";

const row: PriceRow = {
  id: 6,
  symbol: "SOL",
  price: 150,
  change24hPct: 2,
  high24h: 160,
  low24h: 140,
  volume24h: 1e9,
  confidence: 0.05,
  emaPrice: 148,
  publisherCount: 20,
  marketSession: "regular",
  publishedAt: "2026-10-22T00:00:00.000Z",
};

const alert: PriceAlert = { id: "a", symbol: "SOL", direction: "above", target: 149, createdPrice: 140, triggeredAt: null };

describe("the decision brief", () => {
  it("places the price in its range and against its EMA", () => {
    const line = structureLine("SOL", row, null, Date.parse(row.publishedAt) + 60_000);
    expect(line.kind).toBe("ready");
    if (line.kind === "ready") {
      expect(line.text).toContain("50% up it");
      expect(line.text).toContain("above its EMA");
    }
  });

  it("names Telegram only on the website", () => {
    const alerts = { alerts: [alert], delivery: "telegram" as const, appDelivery: "push" as const };
    const web = watchNextLine("SOL", row, alerts, null, "web");
    const app = watchNextLine("SOL", row, alerts, null, "app");
    expect(web.kind === "ready" && web.text).toContain("Telegram");
    expect(app.kind === "ready" && app.text).not.toMatch(/telegram/i);
    expect(app.kind === "ready" && app.text).toContain("the app is told");
  });
});
