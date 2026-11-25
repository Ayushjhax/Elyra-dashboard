import { describe, expect, it } from "vitest";
import { PAPER_STARTING_USD, marginFor, paperFunds, paperRefusal } from "@/lib/paper/funds";

const NONE = new Map<string, number>();

describe("paperFunds", () => {
  it("is the starting funds and nothing else for a new account", () => {
    expect(paperFunds({ startingUsd: PAPER_STARTING_USD, closed: [], open: [], orders: [], marks: NONE })).toEqual({
      startingUsd: 100_000,
      realisedUsd: 0,
      balanceUsd: 100_000,
      unrealisedUsd: 0,
      equityUsd: 100_000,
      marginUsd: 0,
      availableUsd: 100_000,
      openPositions: 0,
      restingOrders: 0,
      unmarked: 0,
    });
  });

  it("adds closed results and closed parts to the balance, and marks open positions into equity", () => {
    const funds = paperFunds({
      startingUsd: 100_000,
      closed: [250, -100],
      open: [
        /* 0.1 BTC long from 90,000 at 3x, marked at 91,000: +100 open, 3,000 margin. */
        { coin: "BTC", side: "long", size: 0.1, entryPrice: 90_000, leverage: 3, realisedPartialUsd: 20 },
        /* 10 ETH short from 3,000 at 2x, marked at 3,050: −500 open, 15,000 margin. */
        { coin: "ETH", side: "short", size: 10, entryPrice: 3_000, leverage: 2, realisedPartialUsd: 0 },
      ],
      orders: [{ sizeUsd: 1_000, leverage: 4 }],
      marks: new Map([
        ["BTC", 91_000],
        ["ETH", 3_050],
      ]),
    });
    expect(funds).toMatchObject({
      realisedUsd: 170,
      balanceUsd: 100_170,
      unrealisedUsd: -400,
      equityUsd: 99_770,
      marginUsd: 18_250,
      availableUsd: 81_520,
      openPositions: 2,
      restingOrders: 1,
      unmarked: 0,
    });
  });

  it("counts an unpriced position as flat and says so, and an old one without leverage as 1x", () => {
    const funds = paperFunds({
      startingUsd: 100_000,
      closed: [],
      open: [{ coin: "kPEPE", side: "long", size: 1_000, entryPrice: 2, leverage: null, realisedPartialUsd: 0 }],
      orders: [],
      marks: NONE,
    });
    expect(funds).toMatchObject({ unrealisedUsd: 0, marginUsd: 2_000, availableUsd: 98_000, unmarked: 1 });
  });

  it("never reports less than nothing available, and ignores a result that is not a number", () => {
    const funds = paperFunds({
      startingUsd: 1_000,
      closed: [Number.NaN, -900],
      open: [{ coin: "SOL", side: "long", size: 10, entryPrice: 100, leverage: 1, realisedPartialUsd: 0 }],
      orders: [],
      marks: new Map([["SOL", 90]]),
    });
    expect(funds.balanceUsd).toBe(100);
    expect(funds.equityUsd).toBe(0);
    expect(funds.availableUsd).toBe(0);
  });
});

describe("paperRefusal", () => {
  it("lets an order through that the available funds cover, to the cent", () => {
    expect(paperRefusal({ availableUsd: 500 }, marginFor({ sizeUsd: 1_000, leverage: 2 }))).toBeNull();
  });

  it("refuses one they do not, saying how much is available and how much it needs", () => {
    const refusal = paperRefusal({ availableUsd: 499.5 }, marginFor({ sizeUsd: 1_000, leverage: 2 }));
    expect(refusal).toMatch(/\$499\.50 available/);
    expect(refusal).toMatch(/\$500\.00 of margin/);
    expect(refusal).not.toMatch(/leverage/);
  });

  it("reads leverage below 1 as 1", () => {
    expect(marginFor({ sizeUsd: 300, leverage: 0 })).toBe(300);
  });
});
