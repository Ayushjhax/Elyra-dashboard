import { describe, expect, it } from "vitest";
import { HYPERLIQUID_BRIDGE, coversSince, flowsByDay, flowsIn, valueFlows, type FlowBoundary } from "@/lib/portfolio/flows";
import type { WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Deposits and withdrawals: only money that crossed the edge of what the
   total counts is a flow.
--------------------------------------------------------------------------- */

const SOL = "So1anaWa11etAddress1111111111111111111111111";
const OTHER_SOL = "Exchange111111111111111111111111111111111111";
const EVM = "0xAbCdEf0000000000000000000000000000000001";

const boundary: FlowBoundary = { solana: [SOL], evm: [EVM], sui: [] };

function row(partial: Partial<WalletActivity> & { summary: WalletActivity["summary"] }): WalletActivity {
  return { signature: `sig-${Math.random()}`, status: "confirmed", slot: 1, at: "2026-11-24T10:00:00.000Z", memo: null, ...partial };
}

const receive = (counterparty: string | null, amount: number, symbol: string | null = "SOL", extra: Partial<WalletActivity> = {}) =>
  row({
    ...extra,
    summary: {
      kind: "receive",
      title: "Received",
      amounts: [{ symbol, mint: null, amount, icon: null }],
      counterparty,
      via: null,
      feeSol: null,
      unverifiedOnly: symbol === null,
    },
  });

const send = (counterparty: string | null, amount: number, symbol = "USDC", extra: Partial<WalletActivity> = {}) =>
  row({
    ...extra,
    summary: {
      kind: "send",
      title: "Sent",
      amounts: [{ symbol, mint: null, amount: -amount, icon: null }],
      counterparty,
      via: null,
      feeSol: 0.000005,
      unverifiedOnly: false,
    },
  });

describe("what counts as a flow", () => {
  it("counts money in from, and out to, an outside address", () => {
    const { flows } = flowsIn([receive(OTHER_SOL, 2), send(OTHER_SOL, 50)], boundary);
    expect(flows.map((flow) => [flow.direction, flow.symbol, flow.amount])).toEqual([
      ["in", "SOL", 2],
      ["out", "USDC", 50],
    ]);
  });

  it("does not count a move between the person's own wallets", () => {
    expect(flowsIn([send(SOL, 10), receive(SOL, 10)], boundary).flows).toEqual([]);
  });

  it("compares EVM addresses without case", () => {
    expect(flowsIn([send(EVM.toLowerCase(), 5, "USDC", { network: "base" })], boundary).flows).toEqual([]);
  });

  it("treats Hyperliquid's bridge as inside: its account is in the total", () => {
    const deposit = send(HYPERLIQUID_BRIDGE.toUpperCase().replace("0X", "0x"), 500, "USDC", { network: "arbitrum" });
    expect(flowsIn([deposit], boundary).flows).toEqual([]);
    /* The same address on another chain is just an address. */
    expect(flowsIn([send(HYPERLIQUID_BRIDGE, 500, "USDC", { network: "base" })], boundary).flows).toHaveLength(1);
  });

  it("ignores swaps, stakes and failed or pending rows", () => {
    const swap = row({ summary: { kind: "swap", title: "Swapped", amounts: [{ symbol: "SOL", mint: null, amount: -1, icon: null }, { symbol: "USDC", mint: null, amount: 150, icon: null }], counterparty: null, via: "Jupiter", feeSol: null, unverifiedOnly: false } });
    const failed = receive(OTHER_SOL, 3, "SOL", { status: "failed" });
    const pending = receive(OTHER_SOL, 3, "SOL", { status: "pending" });
    expect(flowsIn([swap, failed, pending], boundary).flows).toEqual([]);
  });

  it("never counts an unverified token: the total does not value it either", () => {
    expect(flowsIn([receive(OTHER_SOL, 1_000_000, null)], boundary).flows).toEqual([]);
  });

  it("counts a row with no summary as unreadable, not as nothing", () => {
    const { flows, unreadable } = flowsIn([row({ summary: null })], boundary);
    expect(flows).toEqual([]);
    expect(unreadable).toBe(1);
  });
});

describe("valuing flows", () => {
  it("holds stablecoins at a dollar and prices the rest on the day", () => {
    const { flows } = flowsIn([receive(OTHER_SOL, 2), send(OTHER_SOL, 50)], boundary);
    const valued = valueFlows(flows, (symbol, day) => (symbol === "SOL" && day === "2026-11-24" ? 140 : null));
    expect(valued.map((flow) => flow.usd)).toEqual([280, 50]);
  });

  it("leaves a token with no price unvalued, and its day unpriced", () => {
    const { flows } = flowsIn([receive(OTHER_SOL, 2, "JUP")], boundary);
    const valued = valueFlows(flows, () => null);
    expect(valued[0].usd).toBeNull();
    expect(flowsByDay(valued).get("2026-11-24")).toMatchObject({ priced: false, count: 1 });
  });

  it("nets a day's flows: in minus out", () => {
    const { flows } = flowsIn([receive(OTHER_SOL, 1000, "USDC"), send(OTHER_SOL, 250)], boundary);
    expect(flowsByDay(valueFlows(flows, () => null)).get("2026-11-24")).toMatchObject({ netUsd: 750, priced: true });
  });
});

describe("whether a read reached back far enough", () => {
  it("is complete when no page was full, or a full page reached past the start", () => {
    expect(
      coversSince(
        [
          { network: "solana", rows: 40, limit: 100, failed: false, oldest: "2026-11-24T05:00:00Z" },
          { network: "base", rows: 100, limit: 100, failed: false, oldest: "2026-11-23T00:00:00Z" },
        ],
        "2026-11-24T00:00:00Z",
      ),
    ).toEqual({ complete: true, short: [] });
  });

  it("names a chain that failed, or whose full page stopped short", () => {
    expect(
      coversSince(
        [
          { network: "solana", rows: 100, limit: 100, failed: false, oldest: "2026-11-24T12:00:00Z" },
          { network: "ethereum", rows: 0, limit: 100, failed: true, oldest: null },
        ],
        "2026-11-24T00:00:00Z",
      ),
    ).toEqual({ complete: false, short: ["solana", "ethereum"] });
  });
});
