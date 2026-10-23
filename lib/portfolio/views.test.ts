import { describe, expect, it } from "vitest";
import { fillTotals, isViewFailure } from "@/lib/portfolio/views";

describe("detail views", () => {
  it("totals realised PnL and fees, skipping what the venue did not report", () => {
    const fill = { venue: "hyperliquid", symbol: "SOL", side: "sell", direction: "Close Long", price: 150, size: 1, at: "2026-10-22T00:00:00Z" };
    const totals = fillTotals([
      { ...fill, realisedPnl: 12.5, fee: 0.1, feeToken: "USDC" },
      { ...fill, realisedPnl: null, fee: null, feeToken: null },
      { ...fill, realisedPnl: -2.5, fee: 0.05, feeToken: "USDC" },
    ]);
    expect(totals.realisedPnl).toBeCloseTo(10);
    expect(totals.fees).toBeCloseTo(0.15);
    expect(totals.feeTokens).toEqual(["USDC"]);
  });

  it("tells a tool's refusal from its data", () => {
    expect(isViewFailure({ error: "No wallet is connected to this account." })).toBe(true);
    expect(isViewFailure({ orders: [], unreadable: [] })).toBe(false);
  });
});
