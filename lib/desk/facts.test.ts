import { describe, expect, it, vi } from "vitest";
import type { Candle } from "@/lib/backtest/intervals";

vi.mock("server-only", () => ({}));

const { chartFacts } = await import("@/lib/desk/facts");
const { factText } = await import("@/lib/desk/protocol");
const { zhCN } = await import("@/lib/i18n/messages/zh-CN");
const { translate } = await import("@/lib/i18n/translate");
const { formatPriceUsd } = await import("@/lib/format");

/* ---------------------------------------------------------------------------
   The fact sheet is templates and values: the models read the English, the
   page shows the same line in the reader's language, and a value is only
   ever a number, a price or a market's name.
--------------------------------------------------------------------------- */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-26T12:00:00.000Z");

const bars = (count: number, step: number, from: number): Candle[] =>
  Array.from({ length: count }, (_, index) => {
    const open = 100 + index;
    return { instrumentId: "BTC", venue: "hyperliquid", interval: step === DAY ? "1d" : "1h", openTime: from + index * step, closeTime: from + (index + 1) * step - 1, open, high: open + 2, low: open - 2, close: open + 1, volume: 1, complete: true, source: "test" };
  });

describe("the fact sheet", () => {
  const lines = chartFacts({ label: "Bitcoin", price: 131, daily: bars(30, DAY, NOW - 30 * DAY), hourly: bars(48, HOUR, NOW - 48 * HOUR), horizonMinutes: 1440, now: NOW });

  it("gives the models the English they read before", () => {
    const text = lines.map(factText);
    expect(text[0]).toBe("Market: Bitcoin, a Hyperliquid perpetual");
    expect(text[1]).toBe(`Price now (mid): ${formatPriceUsd(131)}`);
    expect(text).toContain("Days that closed higher than they opened, last 30 days: 30 of 30");
  });

  it("has a Chinese line for every template, with no English word in a value", () => {
    for (const line of lines) {
      expect(zhCN[line.template]).toBeDefined();
      for (const value of Object.values(line.values)) expect(String(value)).not.toMatch(/\b(?!Bitcoin\b)[A-Za-z]{2,}\b/);
      expect(translate(zhCN, line.template, line.values)).not.toMatch(/\{\w+\}/);
    }
  });
});
