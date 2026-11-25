import { describe, expect, it } from "vitest";
import { basketTotals, payoutOf, splitStake, validateBasket } from "@/lib/poly/basketMath";
import { bookSums, movers, polyConsensus, toLite, toPosition, type GammaMarketLite, type PolyPosition } from "@/lib/poly/scanMath";

/* Poly scan's and Poly baskets' arithmetic. */

const NOW = Date.parse("2026-11-25T00:00:00Z");
const CONDITION = `0x${"a".repeat(64)}`;
const OTHER = `0x${"b".repeat(64)}`;

const position = (wallet: string, outcomeIndex: number, valueUsd = 1_000, overrides: Partial<PolyPosition> = {}): PolyPosition => ({
  wallet,
  conditionId: CONDITION,
  tokenId: outcomeIndex === 0 ? "111" : "222",
  outcome: outcomeIndex === 0 ? "Yes" : "No",
  outcomeIndex,
  title: "Will the Fed cut in December?",
  slug: "fed-cut",
  eventSlug: "fed-december",
  endDate: "2026-12-10T00:00:00Z",
  avgPrice: 0.4,
  price: 0.5,
  valueUsd,
  redeemable: false,
  ...overrides,
});

describe("Polymarket smart money", () => {
  it("calls an outcome when three top wallets hold it and two thirds agree", () => {
    const rows = [position("w1", 0), position("w2", 0, 3_000, { avgPrice: 0.3 }), position("w3", 0), position("w4", 1)];
    const [call] = polyConsensus(rows, NOW);
    expect(call).toMatchObject({ outcome: "Yes", wallets: 3, against: 1, valueUsd: 5_000, avgEntry: 0.34, price: 0.5 });
  });

  it("leaves out dust, decided markets, past markets and contested ones", () => {
    expect(polyConsensus([position("w1", 0, 50), position("w2", 0, 50), position("w3", 0, 50)], NOW)).toEqual([]);
    expect(polyConsensus([position("w1", 0, 1_000, { price: 0.99 }), position("w2", 0, 1_000, { price: 0.99 }), position("w3", 0, 1_000, { price: 0.99 })], NOW)).toEqual([]);
    expect(polyConsensus([1, 2, 3].map((n) => position(`w${n}`, 0, 1_000, { endDate: "2026-11-01T00:00:00Z" })), NOW)).toEqual([]);
    expect(polyConsensus([position("w1", 0), position("w2", 0), position("w3", 0), position("w4", 1), position("w5", 1)], NOW)).toEqual([]);
  });

  it("reads a v2 position row", () => {
    expect(
      toPosition({ proxy_wallet: "0xABC", condition_id: CONDITION, token_id: "111", outcome: "Yes", outcome_index: 0, title: "T", current_value: 12.5, current_price: 0.25, avg_price: 0.2, redeemable: false, end_date: "" }),
    ).toMatchObject({ wallet: "0xabc", valueUsd: 12.5, price: 0.25, endDate: null });
    expect(toPosition({ proxy_wallet: "0x1" })).toBeNull();
  });
});

const lite = (overrides: Partial<GammaMarketLite>): GammaMarketLite => ({
  id: "1",
  conditionId: CONDITION,
  question: "Q",
  slug: null,
  eventSlug: null,
  outcomes: ["Yes", "No"],
  tokenIds: ["111", "222"],
  prices: [0.5, 0.5],
  bestBid: 0.49,
  bestAsk: 0.51,
  dayChange: 0,
  volume24h: 100_000,
  endDate: null,
  closed: false,
  label: null,
  ...overrides,
});

describe("movers and book sums", () => {
  it("ranks liquid markets by the size of the day's move", () => {
    const list = movers(
      [
        lite({ id: "a", dayChange: 0.06 }),
        lite({ id: "b", dayChange: -0.12, endDate: "2026-12-31T00:00:00Z" }),
        lite({ id: "c", dayChange: 0.2, volume24h: 1_000 }),
        lite({ id: "d", dayChange: 0.01 }),
        /* A game in play settling today is not news. */
        lite({ id: "e", dayChange: 0.72, endDate: "2026-11-25T03:00:00Z" }),
      ],
      NOW,
    );
    expect(list.map((entry) => [entry.market.id, entry.changePts])).toEqual([
      ["b", -12],
      ["a", 6],
    ]);
  });

  it("finds one-winner events whose asks sum under $1 or bids over it, and skips incomplete ones", () => {
    const event = (slug: string, asks: Array<number | null>, bids: number[], negRisk = true) => ({
      slug,
      title: slug,
      negRisk,
      markets: asks.map((ask, index) => lite({ id: `${slug}${index}`, bestAsk: ask, bestBid: bids[index] })),
    });
    const sums = bookSums([
      event("cheap", [0.3, 0.3, 0.35], [0.29, 0.29, 0.33]),
      event("rich", [0.4, 0.4, 0.3], [0.38, 0.38, 0.27]),
      event("fair", [0.34, 0.33, 0.34], [0.33, 0.32, 0.33]),
      event("gap", [0.2, null, 0.2], [0.19, 0.19, 0.19]),
      event("binary", [0.3, 0.3, 0.3], [0.2, 0.2, 0.2], false),
    ]);
    expect(sums.map((sum) => [sum.eventSlug, sum.buyGapPts, sum.sellGapPts])).toEqual([
      ["cheap", 5, 0],
      ["rich", 0, 3],
    ]);
  });

  it("reads Gamma's stringified lists", () => {
    const market = toLite({ id: 3215005, conditionId: CONDITION, question: "Q", outcomes: '["Yes", "No"]', outcomePrices: '["0.0015", "0.9985"]', clobTokenIds: '["1", "2"]', bestBid: 0.001, closed: false, events: [{ slug: "fed" }] });
    expect(market).toMatchObject({ id: "3215005", outcomes: ["Yes", "No"], prices: [0.0015, 0.9985], tokenIds: ["1", "2"], eventSlug: "fed", bestAsk: null });
  });
});

describe("paper baskets", () => {
  const leg = (conditionId: string, tokenId: string) => ({ conditionId, tokenId, outcome: "Yes", question: "Q" });

  it("checks a basket's name, stake and legs", () => {
    expect(validateBasket({ name: "Fed", stakeUsd: 100, legs: [leg(CONDITION, "1"), leg(OTHER, "2")] })).toMatchObject({ basket: { name: "Fed", stakeUsd: 100 } });
    expect(validateBasket({ name: "Fed", stakeUsd: 5, legs: [leg(CONDITION, "1"), leg(OTHER, "2")] })).toMatchObject({ error: expect.stringContaining("Stake") });
    expect(validateBasket({ name: "Fed", stakeUsd: 100, legs: [leg(CONDITION, "1")] })).toMatchObject({ error: expect.stringContaining("2 to 8") });
    expect(validateBasket({ name: "Fed", stakeUsd: 100, legs: [leg(CONDITION, "1"), leg(CONDITION, "2")] })).toMatchObject({ error: "A basket holds one outcome per market." });
    expect(validateBasket({ name: "Fed", stakeUsd: 100, legs: [leg("0x12", "1"), leg(OTHER, "2")] })).toMatchObject({ error: expect.stringContaining("Polymarket outcome") });
    expect(validateBasket({ name: "", stakeUsd: 100, legs: [] })).toMatchObject({ error: expect.stringContaining("Name") });
  });

  it("splits a stake to the cent", () => {
    expect(splitStake(100, 3)).toEqual([33.34, 33.33, 33.33]);
    expect(splitStake(10, 4)).toEqual([2.5, 2.5, 2.5, 2.5]);
  });

  it("values open legs at the bids and settled legs at their payout", () => {
    expect(basketTotals([{ costUsd: 50, shares: 100, valueUsd: 60, settled: null }, { costUsd: 50, shares: 80, valueUsd: null, settled: 1 }])).toEqual({ costUsd: 100, valueUsd: 140, pnlUsd: 40, pnlPct: 40, settledLegs: 1 });
    expect(basketTotals([{ costUsd: 50, shares: 100, valueUsd: null, settled: null }]).valueUsd).toBeNull();
    expect(payoutOf([1, 0], 0, true)).toBe(1);
    expect(payoutOf([1, 0], 1, true)).toBe(0);
    expect(payoutOf([0.6, 0.4], 0, true)).toBeNull();
    expect(payoutOf([1, 0], 0, false)).toBeNull();
  });
});
