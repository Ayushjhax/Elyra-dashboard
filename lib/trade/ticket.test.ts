import { describe, expect, it } from "vitest";
import { PAPER_COSTS } from "@/lib/autotrade/rules";
import type { OrderView, TradeView } from "@/lib/autotrade/types";
import type { Book } from "@/lib/market/book";
import { fillOutcome, positionForOrder, ticketPreview, type TicketInput } from "./ticket";

const book: Book = {
  coin: "SOL",
  bids: [
    { price: 99.99, size: 10 },
    { price: 99.9, size: 100 },
  ],
  asks: [
    { price: 100.01, size: 10 },
    { price: 100.1, size: 100 },
  ],
  at: "2026-11-28T00:00:00.000Z",
};

const base: TicketInput = {
  mode: "paper",
  type: "market",
  side: "long",
  sizeUsd: 100,
  leverage: 2,
  takeProfitPct: 4,
  stopLossPct: 2,
  limitPrice: null,
  book,
  quote: 101,
};

describe("ticketPreview", () => {
  it("prices a paper market order the way the paper engine fills it", () => {
    const long = ticketPreview(base);
    expect(long.basis).toBe("paper");
    expect(long.entry).toBeCloseTo(100 * (1 + PAPER_COSTS.slippagePct / 100), 9);
    const short = ticketPreview({ ...base, side: "short" });
    expect(short.entry).toBeCloseTo(100 * (1 - PAPER_COSTS.slippagePct / 100), 9);
  });

  it("walks the book for a live market order", () => {
    const preview = ticketPreview({ ...base, mode: "live", sizeUsd: 500 });
    expect(preview.basis).toBe("book");
    /* $500 takes all of the first ask level ($1,000.10 of it would be needed for more) at 100.01. */
    expect(preview.entry).toBeCloseTo(100.01, 6);
    expect(preview.beyondCap).toBe(false);
  });

  it("flags a live order the visible book cannot fill within the cap", () => {
    const preview = ticketPreview({ ...base, mode: "live", sizeUsd: 1_000_000 });
    expect(preview.beyondCap).toBe(true);
  });

  it("falls back to the chart's quote before the book is read", () => {
    const preview = ticketPreview({ ...base, book: null });
    expect(preview.basis).toBe("quote");
    expect(preview.entry).toBeCloseTo(101 * (1 + PAPER_COSTS.slippagePct / 100), 9);
    expect(preview.spreadBps).toBeNull();
  });

  it("treats size as notional: quantity is size over the entry, margin is size over leverage", () => {
    const preview = ticketPreview({ ...base, type: "limit", limitPrice: 80, leverage: 4 });
    expect(preview.entry).toBe(80);
    expect(preview.quantity).toBeCloseTo(100 / 80, 9);
    expect(preview.marginUsd).toBe(25);
    expect(preview.feeUsd).toBeCloseTo((100 * PAPER_COSTS.takerFeePct) / 100, 9);
  });

  it("places the exits on the right side of the entry for each side", () => {
    const long = ticketPreview({ ...base, type: "limit", limitPrice: 100 });
    expect(long.takeProfit).toBeCloseTo(104, 9);
    expect(long.stopLoss).toBeCloseTo(98, 9);
    const short = ticketPreview({ ...base, type: "limit", side: "short", limitPrice: 100 });
    expect(short.takeProfit).toBeCloseTo(96, 9);
    expect(short.stopLoss).toBeCloseTo(102, 9);
  });

  it("says whether a limit crosses the book or how far it rests", () => {
    expect(ticketPreview({ ...base, type: "limit", limitPrice: 100.5 }).crosses).toBe(true);
    const resting = ticketPreview({ ...base, type: "limit", limitPrice: 99 });
    expect(resting.crosses).toBe(false);
    expect(resting.restsPct).toBeCloseTo(1, 6);
    expect(ticketPreview({ ...base, type: "limit", side: "short", limitPrice: 99.5 }).crosses).toBe(true);
  });

  it("has nothing to show without a size or a limit price", () => {
    const preview = ticketPreview({ ...base, sizeUsd: 0, type: "limit", limitPrice: null });
    expect(preview.entry).toBeNull();
    expect(preview.quantity).toBeNull();
    expect(preview.marginUsd).toBeNull();
    expect(preview.takeProfit).toBeNull();
  });

  it("reports the spread for the collapsed Liquidity row", () => {
    expect(ticketPreview(base).spreadBps).toBeCloseTo((0.02 / 100) * 10_000, 6);
  });
});

describe("fillOutcome", () => {
  it("calls a long filled above its estimate worse, and below it better", () => {
    expect(fillOutcome({ side: "long", entryPrice: 100.05, expectedPrice: null }, 100)).toMatchObject({ bps: 5, verdict: "worse" });
    expect(fillOutcome({ side: "long", entryPrice: 99.95, expectedPrice: null }, 100)).toMatchObject({ bps: -5, verdict: "better" });
  });

  it("calls a short filled below its estimate worse, and above it better", () => {
    expect(fillOutcome({ side: "short", entryPrice: 99.95, expectedPrice: null }, 100)).toMatchObject({ bps: 5, verdict: "worse" });
    expect(fillOutcome({ side: "short", entryPrice: 100.05, expectedPrice: null }, 100)).toMatchObject({ bps: -5, verdict: "better" });
  });

  it("uses the server's expected price when the ticket captured none", () => {
    expect(fillOutcome({ side: "long", entryPrice: 100.05, expectedPrice: 100 }, null)).toMatchObject({ estimate: 100, bps: 5 });
  });

  it("calls an exact fill even, and says nothing without an estimate", () => {
    expect(fillOutcome({ side: "long", entryPrice: 100, expectedPrice: null }, 100).verdict).toBe("even");
    expect(fillOutcome({ side: "long", entryPrice: 100, expectedPrice: null }, null)).toMatchObject({ estimate: null, bps: null, verdict: null });
  });
});

describe("positionForOrder", () => {
  const order: OrderView = {
    id: "o1",
    mode: "paper",
    network: null,
    coin: "SOL",
    side: "long",
    price: 95,
    sizeUsd: 100,
    leverage: 2,
    takeProfit: 98.8,
    stopLoss: 93.1,
    status: "filled",
    error: null,
    createdAt: "2026-11-28T10:00:00.000Z",
    filledAt: "2026-11-28T10:20:00.000Z",
    cancelledAt: null,
  };
  const trade = (id: string, extra: Partial<TradeView> = {}): TradeView => ({
    id,
    ruleId: null,
    ruleName: "Limit long · SOL",
    mode: "paper",
    network: null,
    side: "long",
    coin: "SOL",
    size: 100 / 95,
    entryPrice: 95,
    takeProfit: 98.8,
    stopLoss: 93.1,
    status: "open",
    entryReason: null,
    exitPrice: null,
    exitReason: null,
    realisedPnlUsd: null,
    error: null,
    openedAt: "2026-11-28T10:15:00.000Z",
    closedAt: null,
    expectedPrice: 95,
    ...extra,
  });

  it("is nothing while the order still rests", () => {
    expect(positionForOrder({ ...order, status: "open", positionId: "p1" }, [trade("p1")])).toBeNull();
  });

  it("follows the position the engine recorded on the order", () => {
    expect(positionForOrder({ ...order, positionId: "p2" }, [trade("p1"), trade("p2")])?.id).toBe("p2");
  });

  it("matches an older fill by coin, side, price and time", () => {
    const found = positionForOrder(order, [
      trade("before", { openedAt: "2026-11-28T09:00:00.000Z" }),
      trade("other-price", { expectedPrice: 96 }),
      trade("short", { side: "short" }),
      trade("match"),
    ]);
    expect(found?.id).toBe("match");
  });
});
