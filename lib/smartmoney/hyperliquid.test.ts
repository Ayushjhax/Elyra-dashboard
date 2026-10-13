import { describe, expect, it } from "vitest";
import { buildSignals, type Holding, type Trader } from "@/lib/smartmoney/hyperliquid";

const AT = "2026-10-13T12:00:00.000Z";

function trader(index: number): Trader {
  return { address: `0x${String(index).padStart(40, "0")}`, accountValue: 1_000_000, monthPnl: 50_000, monthRoi: 0.1 };
}

function hold(index: number, coin: string, size: number, valueUsd: number, entry = 100): Holding {
  return { trader: trader(index), coin, size, entry, entryText: String(entry), valueUsd };
}

describe("buildSignals", () => {
  it("keeps a small token's prices as plain decimals", () => {
    const signals = buildSignals(
      [1, 2, 3].map((index) => ({ ...hold(index, "kPEPE", 1, 100, 0.00000421), entryText: "0.00000421" })),
      { kPEPE: "0.000004380" },
      AT,
    );
    expect(signals[0].currentPxUsd).toBe("0.000004380");
    expect(signals[0].participants[0].vwapEntryUsd).toBe("0.00000421");
    expect(signals[0].vwapEntryUsd).toBe("0.00000421");
  });

  it("calls a market where three or more wallets agree with two thirds of the cohort", () => {
    const signals = buildSignals(
      [hold(1, "HYPE", 10, 1_000), hold(2, "HYPE", 5, 500), hold(3, "HYPE", 2, 200), hold(4, "HYPE", -1, 100)],
      { HYPE: "81.2" },
      AT,
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      symbol: "HYPE",
      side: "LONG",
      walletCount: 3,
      status: "3 of 4 wallets",
      currentPxUsd: "81.2",
      configVersion: "elyra-hl-consensus-1",
    });
    /* 1,700 of 1,800 in value is on the long side. */
    expect(signals[0].weightedScore).toBe(94);
  });

  it("calls a short consensus as short", () => {
    const signals = buildSignals(
      [hold(1, "XRP", -10, 300), hold(2, "XRP", -10, 300), hold(3, "XRP", -10, 300)],
      {},
      AT,
    );
    expect(signals[0].side).toBe("SHORT");
    expect(signals[0].currentPxUsd).toBeNull();
  });

  it("does not call a market fewer than three wallets hold", () => {
    expect(buildSignals([hold(1, "ZRO", 1, 10), hold(2, "ZRO", 1, 10)], {}, AT)).toEqual([]);
  });

  it("leaves a contested market out rather than picking a side", () => {
    /* 4 long and 3 short: under two thirds either way. */
    const holdings = [
      ...[1, 2, 3, 4].map((index) => hold(index, "BTC", 1, 1_000)),
      ...[5, 6, 7].map((index) => hold(index, "BTC", -1, 1_000)),
    ];
    expect(buildSignals(holdings, {}, AT)).toEqual([]);
  });

  it("weights the average entry by position value", () => {
    const signals = buildSignals(
      [hold(1, "SOL", 1, 300, 100), hold(2, "SOL", 1, 100, 200), hold(3, "SOL", 1, 100, 200)],
      {},
      AT,
    );
    /* (100×300 + 200×100 + 200×100) / 500 = 140 */
    expect(Number(signals[0].vwapEntryUsd)).toBeCloseTo(140, 6);
  });

  it("orders by how many wallets agree", () => {
    const signals = buildSignals(
      [
        ...[1, 2, 3].map((index) => hold(index, "AAVE", 1, 10)),
        ...[1, 2, 3, 4, 5].map((index) => hold(index, "NEAR", 1, 10)),
      ],
      {},
      AT,
    );
    expect(signals.map((signal) => signal.symbol)).toEqual(["NEAR", "AAVE"]);
  });
});
