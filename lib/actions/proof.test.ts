import { describe, expect, it } from "vitest";

const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const OTHER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const noWait = async () => {};

describe("proveSwap", () => {
  it("proves a successful transaction this wallet signed", async () => {
    const { proveSwap } = await import("@/lib/actions/proof");
    const read = async () => ({ err: null, signers: [WALLET] });
    expect(await proveSwap("sig", WALLET, read, noWait)).toEqual({ outcome: "proven" });
  });

  it("rejects a transaction another wallet signed", async () => {
    const { proveSwap } = await import("@/lib/actions/proof");
    const read = async () => ({ err: null, signers: [OTHER] });
    expect((await proveSwap("sig", WALLET, read, noWait)).outcome).toBe("rejected");
  });

  it("rejects a transaction that failed on-chain", async () => {
    const { proveSwap } = await import("@/lib/actions/proof");
    const read = async () => ({ err: { InstructionError: [0, "Custom"] }, signers: [WALLET] });
    expect((await proveSwap("sig", WALLET, read, noWait)).outcome).toBe("rejected");
  });

  it("waits for a node that has not seen the transaction yet", async () => {
    const { proveSwap } = await import("@/lib/actions/proof");
    let calls = 0;
    const read = async () => (++calls < 3 ? null : { err: null, signers: [WALLET] });
    expect(await proveSwap("sig", WALLET, read, noWait)).toEqual({ outcome: "proven" });
    expect(calls).toBe(3);
  });

  it("reports unseen and unreachable as unknown, never as rejected", async () => {
    const { proveSwap } = await import("@/lib/actions/proof");
    expect((await proveSwap("sig", WALLET, async () => null, noWait)).outcome).toBe("unknown");
    const failing = async () => {
      throw new Error("timeout");
    };
    expect((await proveSwap("sig", WALLET, failing, noWait)).outcome).toBe("unknown");
  });
});
