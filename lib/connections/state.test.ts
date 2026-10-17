import { describe, expect, it } from "vitest";
import {
  codeDeadline,
  formatCountdown,
  isBinanceCredential,
  isEvmAddress,
  remainingMs,
  venueRead,
  type VenueReadInput,
} from "@/lib/connections/state";

describe("isEvmAddress", () => {
  it("accepts a 0x address of 40 hex characters in either case", () => {
    expect(isEvmAddress("0x" + "a".repeat(40))).toBe(true);
    expect(isEvmAddress("0xAbCdEf0123456789aBcDeF0123456789AbCdEf01")).toBe(true);
    expect(isEvmAddress("  0x" + "1".repeat(40) + "  ")).toBe(true);
  });

  it("refuses a short, long, unprefixed or non-hex value", () => {
    expect(isEvmAddress("0x" + "a".repeat(39))).toBe(false);
    expect(isEvmAddress("0x" + "a".repeat(41))).toBe(false);
    expect(isEvmAddress("a".repeat(42))).toBe(false);
    expect(isEvmAddress("0x" + "g".repeat(40))).toBe(false);
    expect(isEvmAddress("")).toBe(false);
  });
});

describe("isBinanceCredential", () => {
  it("accepts a 64-character alphanumeric key", () => {
    expect(isBinanceCredential("A1".repeat(32))).toBe(true);
  });

  it("refuses a half-copied value, an inner space or a pasted private key", () => {
    expect(isBinanceCredential("abc123")).toBe(false);
    expect(isBinanceCredential("A1".repeat(16) + " " + "A1".repeat(16))).toBe(false);
    expect(isBinanceCredential("-----BEGIN PRIVATE KEY-----")).toBe(false);
  });
});

describe("codeDeadline", () => {
  const issuedAt = "2026-10-16T12:00:00.000Z";
  const expiresAt = "2026-10-16T12:10:00.000Z";

  it("counts the server's window from when the response arrived", () => {
    /* A device clock five minutes fast: the code still has its ten minutes. */
    const receivedAt = Date.parse("2026-10-16T12:05:00.000Z");
    expect(codeDeadline(issuedAt, expiresAt, receivedAt) - receivedAt).toBe(600_000);
  });

  it("takes the expiry as given when the issue time is missing or nonsense", () => {
    expect(codeDeadline(undefined, expiresAt, 0)).toBe(Date.parse(expiresAt));
    expect(codeDeadline("2026-10-16T13:00:00.000Z", expiresAt, 0)).toBe(Date.parse(expiresAt));
  });

  it("treats an unreadable expiry as already expired", () => {
    expect(codeDeadline(issuedAt, "not a date", 1_000)).toBe(1_000);
  });
});

describe("countdown", () => {
  it("never reads 0:00 while time remains, and never goes negative", () => {
    expect(formatCountdown(600_000)).toBe("10:00");
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(200)).toBe("0:01");
    expect(remainingMs(1_000, 5_000)).toBe(0);
  });
});

describe("venueRead", () => {
  const base: VenueReadInput = {
    loading: false,
    refreshing: false,
    error: null,
    stale: false,
    snapshot: { scopes: [], notes: [] },
  };

  it("is synced only when the venue answered in the latest reading", () => {
    expect(venueRead({ ...base, snapshot: { scopes: [{ venue: "hyperliquid" }], notes: [] } }, "hyperliquid")).toEqual({
      status: "synced",
    });
  });

  it("reports the venue's own failure, without the source tag", () => {
    const read = venueRead(
      {
        ...base,
        snapshot: {
          scopes: [{ venue: "hyperliquid" }],
          notes: [{ scope: "binance", reason: "[binance] API key rejected.", kind: "failed" }],
        },
      },
      "binance",
    );
    expect(read).toEqual({ status: "attention", reason: "API key rejected." });
  });

  it("does not call a venue synced when every venue failed to load", () => {
    const read = venueRead(
      { ...base, snapshot: { scopes: [], notes: [{ scope: "venues", reason: "Timed out", kind: "failed" }] } },
      "hyperliquid",
    );
    expect(read.status).toBe("attention");
  });

  it("does not present a stale reading as synced", () => {
    const read = venueRead(
      { ...base, stale: true, error: "Network error", snapshot: { scopes: [{ venue: "hyperliquid" }], notes: [] } },
      "hyperliquid",
    );
    expect(read).toEqual({ status: "attention", reason: "Network error" });
  });

  it("is checking while the first read is in flight, and failed when it failed", () => {
    expect(venueRead({ ...base, snapshot: null, loading: true }, "hyperliquid")).toEqual({ status: "checking" });
    expect(venueRead({ ...base, snapshot: null, error: "Not signed in" }, "hyperliquid")).toEqual({
      status: "attention",
      reason: "Not signed in",
    });
  });

  it("waits for the next reading when a connection is newer than the snapshot", () => {
    expect(venueRead(base, "binance")).toEqual({ status: "checking" });
  });
});
