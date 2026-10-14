import { describe, expect, it } from "vitest";
import type { AccountEvent } from "@/lib/activity/events";
import { DEFAULT_FILTERS, filterEvents, formatTokenAmount } from "@/lib/activity/filter";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const tx = (id: string, kind: "receive" | "send" | "swap" | null, at: string | null, extra: Partial<AccountEvent> = {}): AccountEvent => ({
  id: `tx:${id}`,
  kind: "transaction",
  text: kind ? `${kind} thing` : "Wallet transaction confirmed",
  at,
  status: "confirmed",
  href: null,
  agent: false,
  attention: false,
  summary: kind
    ? {
        kind,
        title: "",
        amounts: [{ symbol: kind === "swap" ? "USDC" : "SOL", mint: kind === "swap" ? "EPjF" : null, amount: kind === "send" ? -1 : 1, icon: null }],
        counterparty: kind === "send" ? "7xKXrecipient" : null,
        via: "System program",
        feeSol: null,
        unverifiedOnly: false,
      }
    : null,
  ...extra,
});
const alert: AccountEvent = { id: "alert:a", kind: "alert", text: "SOL crossed", at: "2026-10-15T10:00:00Z", status: "confirmed", href: null, agent: true, attention: true };

const events = [
  tx("in", "receive", "2026-10-15T09:00:00Z"),
  tx("out", "send", "2026-10-10T09:00:00Z"),
  tx("swap", "swap", "2026-09-01T09:00:00Z"),
  tx("plain", null, null),
  alert,
];
const ids = (list: AccountEvent[]) => list.map((event) => event.id);

describe("filterEvents", () => {
  it("splits received and sent, leaving swaps and undecoded rows to All", () => {
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, direction: "received" }, NOW))).toEqual(["tx:in"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, direction: "sent" }, NOW))).toEqual(["tx:out"]);
    expect(filterEvents(events, DEFAULT_FILTERS, NOW)).toHaveLength(5);
  });

  it("filters by date, keeping a transaction not yet in a block", () => {
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, range: "today" }, NOW))).toEqual(["tx:in", "tx:plain", "alert:a"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, range: "7d" }, NOW))).toEqual(["tx:in", "tx:out", "tx:plain", "alert:a"]);
    expect(filterEvents(events, { ...DEFAULT_FILTERS, range: "30d" }, NOW)).toHaveLength(4);
  });

  it("limits Solana to wallet transactions", () => {
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, network: "solana" }, NOW))).not.toContain("alert:a");
  });

  it("searches token, mint, address and signature", () => {
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, query: "usdc" }, NOW))).toEqual(["tx:swap"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, query: "EPJF" }, NOW))).toEqual(["tx:swap"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, query: "7xkx" }, NOW))).toEqual(["tx:out"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, query: "plain" }, NOW))).toEqual(["tx:plain"]);
  });
});

describe("formatTokenAmount", () => {
  it("keeps every meaningful digit and never uses exponent notation", () => {
    expect(formatTokenAmount(-0.201453127)).toBe("0.201453127");
    expect(formatTokenAmount(1711467.952641)).toBe("1,711,467.952641");
    expect(formatTokenAmount(0.000000042)).toBe("0.000000042");
  });
});
