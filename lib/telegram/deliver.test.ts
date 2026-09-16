import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   Delivery scheduling and the account reader.

   Two things here are quietly easy to get backwards, and neither throws when
   wrong: a user's local clock, and Hyperliquid's A/B side encoding. The first
   sends someone's morning summary at bedtime; the second inverts every order
   in the list.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => ({}) }));
vi.mock("@/lib/portfolio/compose", () => ({ composePortfolio: async () => null }));
vi.mock("@/lib/telegram/api", () => ({
  sendMessage: async () => {},
}));

describe("localClock", () => {
  it("reads the calendar date and minute where the user lives", async () => {
    const { localClock } = await import("@/lib/telegram/deliver");

    /* 2026-09-16T01:30:00Z is still the 15th in New York and already the
       16th, mid-morning, in Tokyo. A summary keyed on the server's date would
       arrive on the wrong day for one of them. */
    const at = new Date("2026-09-16T01:30:00Z");

    expect(localClock("UTC", at)).toEqual({ date: "2026-09-16", minutes: 90 });
    expect(localClock("America/New_York", at)).toEqual({
      date: "2026-09-15",
      minutes: 21 * 60 + 30,
    });
    expect(localClock("Asia/Tokyo", at)).toEqual({
      date: "2026-09-16",
      minutes: 10 * 60 + 30,
    });
  });

  it("handles a half-hour offset", async () => {
    const { localClock } = await import("@/lib/telegram/deliver");
    const at = new Date("2026-09-16T01:30:00Z");

    /* India is UTC+5:30. An implementation that assumes whole hours is an
       hour wrong for a billion people. */
    expect(localClock("Asia/Kolkata", at)).toEqual({
      date: "2026-09-16",
      minutes: 7 * 60,
    });
  });

  it("returns null for a timezone it cannot resolve", async () => {
    const { localClock } = await import("@/lib/telegram/deliver");

    /* Null rather than falling back to UTC, which would send the summary at
       the wrong hour and never say why. */
    expect(localClock("Mars/Olympus_Mons")).toBeNull();
    expect(localClock("")).toBeNull();
  });

  it("uses a 24-hour clock, so midnight is 0 and not 720", async () => {
    const { localClock } = await import("@/lib/telegram/deliver");

    /* h12 reports midnight as hour 12. That would put the daily summary
       exactly twelve hours out for anyone who picked a morning slot. */
    expect(localClock("UTC", new Date("2026-09-16T00:15:00Z"))?.minutes).toBe(15);
    expect(localClock("UTC", new Date("2026-09-16T12:15:00Z"))?.minutes).toBe(735);
  });
});

/* ------------------------------------------------------------------------- */

describe("hyperliquid account reader", () => {
  beforeEach(async () => {
    vi.resetModules();
    state.fetchMock = vi.fn();
    vi.stubGlobal("fetch", state.fetchMock);
    const { resetProviderHealth, clearProviderCache } = await import("@/lib/providers/http");
    resetProviderHealth();
    clearProviderCache();
  });

  const ORDER = {
    coin: "DYDX",
    side: "A",
    limitPx: "0.10439",
    sz: "1663.4",
    origSz: "1663.4",
    oid: 546317897350,
    timestamp: 1789524511424,
    orderType: "Limit",
    reduceOnly: false,
    isTrigger: false,
    triggerPx: "0.0",
  };

  it("maps A to sell and B to buy", async () => {
    /* Hyperliquid encodes the side as ask/bid, not buy/sell. Backwards, every
       order in the list shows as its opposite — and both read as plausible. */
    state.fetchMock.mockResolvedValue(
      new Response(JSON.stringify([ORDER, { ...ORDER, oid: 2, side: "B" }])),
    );

    const { hyperliquidOpenOrders } = await import("@/lib/providers/hyperliquid-account");
    const result = await hyperliquidOpenOrders("0x31ca8395cf837de08b24da3f660e77761dfb974b");

    expect(result.data?.[0].side).toBe("sell");
    expect(result.data?.[1].side).toBe("buy");
  });

  it("does not report a $0 trigger on a non-trigger order", async () => {
    /* Hyperliquid sends "0.0" for every ordinary order. Rendered as a trigger
       price that reads as a stop at zero. */
    state.fetchMock.mockResolvedValue(new Response(JSON.stringify([ORDER])));

    const { hyperliquidOpenOrders } = await import("@/lib/providers/hyperliquid-account");
    const result = await hyperliquidOpenOrders("0x31ca8395cf837de08b24da3f660e77761dfb974b");

    expect(result.data?.[0].triggerPrice).toBeNull();
  });

  it("keeps a real trigger price", async () => {
    state.fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ ...ORDER, isTrigger: true, triggerPx: "0.09" }])),
    );

    const { hyperliquidOpenOrders } = await import("@/lib/providers/hyperliquid-account");
    const result = await hyperliquidOpenOrders("0x31ca8395cf837de08b24da3f660e77761dfb974b");

    expect(result.data?.[0].triggerPrice).toBeCloseTo(0.09, 6);
  });

  it("refuses a non-address without calling out", async () => {
    const { hyperliquidOpenOrders } = await import("@/lib/providers/hyperliquid-account");
    const result = await hyperliquidOpenOrders("not-an-address");

    expect(result.error?.code).toBe("INVALID_REQUEST");
    expect(state.fetchMock).not.toHaveBeenCalled();
  });

  it("returns a failure, not an empty order book, when the venue is down", async () => {
    /* "No open orders" and "we could not look" are opposite claims. */
    state.fetchMock.mockResolvedValue(new Response("nope", { status: 503 }));

    const { hyperliquidOpenOrders } = await import("@/lib/providers/hyperliquid-account");
    const result = await hyperliquidOpenOrders("0x31ca8395cf837de08b24da3f660e77761dfb974b");

    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
  });

  it("bounds the fills it returns", async () => {
    /* The endpoint returns up to 2000 rows and every caller wants the recent
       few. Unbounded, this is a 2000-row payload into a chat message. */
    const many = Array.from({ length: 2000 }, (_, index) => ({
      coin: "SOL",
      px: "96.5",
      sz: "1",
      side: "B",
      time: 1789524516360,
      dir: "Open Long",
      closedPnl: "0.0",
      fee: "0.01",
      feeToken: "USDC",
      tid: index,
    }));
    state.fetchMock.mockResolvedValue(new Response(JSON.stringify(many)));

    const { hyperliquidFills } = await import("@/lib/providers/hyperliquid-account");
    const result = await hyperliquidFills("0x31ca8395cf837de08b24da3f660e77761dfb974b", 12);

    expect(result.data).toHaveLength(12);
    expect(result.data?.[0].side).toBe("buy");
  });

  it("caps the fill limit even when a caller asks for everything", async () => {
    state.fetchMock.mockResolvedValue(
      new Response(JSON.stringify(Array.from({ length: 500 }, () => ({
        coin: "SOL", px: "1", sz: "1", side: "B", time: 1, tid: Math.random(),
      })))),
    );

    const { hyperliquidFills } = await import("@/lib/providers/hyperliquid-account");
    const result = await hyperliquidFills("0x31ca8395cf837de08b24da3f660e77761dfb974b", 9999);

    expect(result.data!.length).toBeLessThanOrEqual(100);
  });
});
