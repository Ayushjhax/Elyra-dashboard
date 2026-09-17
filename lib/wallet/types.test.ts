import { describe, expect, it } from "vitest";
import { activityStatus, describeChainError } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   `err`'s shape is someone else's contract — the node's — and these two
   functions are the only place this app reads it. Both are exercised here
   against the shapes that actually show up on mainnet, not invented ones.
--------------------------------------------------------------------------- */

describe("activityStatus", () => {
  it("is failed whenever err is present, regardless of confirmationStatus", () => {
    expect(activityStatus({ InstructionError: [0, "Custom"] }, "finalized")).toBe("failed");
  });

  it("is pending at processed commitment", () => {
    expect(activityStatus(null, "processed")).toBe("pending");
  });

  it("is confirmed at confirmed or finalized commitment", () => {
    expect(activityStatus(null, "confirmed")).toBe("confirmed");
    expect(activityStatus(null, "finalized")).toBe("confirmed");
  });

  it("treats a missing confirmationStatus as confirmed, for an older node", () => {
    expect(activityStatus(null, null)).toBe("confirmed");
  });
});

describe("describeChainError", () => {
  it("names the failing instruction for the common shape", () => {
    expect(describeChainError({ InstructionError: [1, "InsufficientFunds"] })).toBe(
      "Instruction 1 failed: InsufficientFunds",
    );
  });

  it("unpacks a keyed custom error rather than dumping raw JSON", () => {
    expect(describeChainError({ InstructionError: [0, { Custom: 6001 }] })).toBe(
      "Instruction 0 failed: Custom(6001)",
    );
  });

  it("falls back to a bounded JSON dump for an unrecognised shape", () => {
    expect(describeChainError({ SomeOtherKind: "whatever" })).toBe(
      '{"SomeOtherKind":"whatever"}',
    );
  });

  it("never throws, even on a value JSON cannot stringify", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => describeChainError(circular)).not.toThrow();
  });
});
