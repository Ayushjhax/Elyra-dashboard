import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   The automation pass end to end on paper: a signal opens a position with
   its TP and SL, the same bar never enters twice, a later bar closes it at
   its take-profit, and live rules send nothing unless the server allows it.
   Hyperliquid, Binance and the inbox are stand-ins; the database is the fake.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  bars: [] as Array<{ openTime: number; closeTime: number; open: number; high: number; low: number; close: number }>,
  signal: "enter" as "enter" | "none",
  inbox: [] as Array<{ title: string; channels?: { inbox: boolean; push: boolean; telegram: boolean } }>,
  orders: 0,
  openCalls: [] as Array<{ side: string; coin: string; network: string }>,
  orderStatus: { status: "open", filledSize: null as number | null, limitPrice: null as number | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/notifications/deliver", () => ({
  recipientFor: async (userId: string) => ({ userId, solanaAddress: null, chatId: 42, hasApp: true, devices: [{ disabled_at: null }] }),
  send: async (_recipient: unknown, channels: { inbox: boolean; push: boolean; telegram: boolean }, message: { title: string }) => {
    state.inbox.push({ title: message.title, channels });
  },
}));
vi.mock("@/lib/backtest/strategies", () => ({
  getStrategy: () => ({
    warmupFor: () => 1,
    evaluate: (bars: unknown[]) =>
      bars.map((_, index) => ({ enterLong: state.signal === "enter" && index === bars.length - 1, exitLong: false, reason: "Test entry" })),
  }),
}));
vi.mock("@/lib/autotrade/hyperliquid", () => ({
  hyperliquidCandles: async () => state.bars.map((bar) => ({ instrumentId: "BTC", venue: "hyperliquid", interval: "1h", volume: 1, complete: true, source: "hyperliquid", ...bar })),
  midPrice: async () => 100,
  openPosition: async (input: { side: string; coin: string; network: string }) => {
    state.orders += 1;
    state.openCalls.push({ side: input.side, coin: input.coin, network: input.network });
    return {
      ok: true,
      size: 0.5,
      entryPrice: 100.2,
      takeProfit: input.side === "long" ? 103.2 : 97.2,
      stopLoss: input.side === "long" ? 98.7 : 101.7,
      cloids: { entry: "0xe", tp: "0xt", sl: "0xs" },
    };
  },
  closePosition: async () => ({ ok: false, error: "should not be called" }),
  positionSize: async () => 0,
  orderStatus: async () => state.orderStatus,
  fillsSince: async () => [],
}));

import { runAutotrade } from "@/lib/autotrade/engine";
import { encryptSecret } from "@/lib/crypto/credentials";

const HOUR = 3_600_000;
const NOW = 10 * HOUR + 60_000;

function hourBar(index: number, low: number, high: number) {
  return { openTime: index * HOUR, closeTime: (index + 1) * HOUR - 1, open: 100, high, low, close: 100 };
}

function seedRule(overrides: Record<string, unknown> = {}) {
  state.db.seed("trading_rules", [
    {
      id: "11111111-1111-1111-1111-111111111111",
      user_id: "user-1",
      name: "BTC test",
      coin: "BTC",
      strategy_id: "test",
      params: {},
      interval: "1h",
      size_usd: 100,
      leverage: 2,
      take_profit_pct: 3,
      stop_loss_pct: 1.5,
      mode: "paper",
      enabled: true,
      last_signal_at: null,
      ...overrides,
    },
  ]);
}

beforeEach(() => {
  state.db = new FakeSupabase();
  state.bars = Array.from({ length: 10 }, (_, index) => hourBar(index, 99.5, 100.5));
  state.signal = "enter";
  state.inbox = [];
  state.orders = 0;
  state.openCalls = [];
  state.orderStatus = { status: "open", filledSize: null, limitPrice: null };
});

afterEach(() => {
  delete process.env.AUTOTRADE_LIVE;
});

function approveKey(network = "testnet") {
  process.env.CREDENTIALS_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
  state.db.seed("trading_agents", [
    {
      user_id: "user-1",
      network,
      account_address: "0x0000000000000000000000000000000000000001",
      agent_address: "0x0000000000000000000000000000000000000002",
      agent_key: encryptSecret(`0x${"11".repeat(32)}`, "api_secret"),
      approval_nonce: 1,
      approved_at: "2026-11-10T00:00:00.000Z",
    },
  ]);
}

describe("runAutotrade on paper", () => {
  it("opens a position with TP and SL on the signal, and never enters the same bar twice", async () => {
    seedRule();
    const first = await runAutotrade(NOW);
    expect(first.entered).toBe(1);
    const [position] = state.db.rows("trading_positions");
    /* The paper fill pays slippage: 100 × 1.0005. */
    expect(position).toMatchObject({ status: "open", mode: "paper", side: "long", coin: "BTC" });
    expect(position.entry_price).toBeCloseTo(100.05);
    expect(position.take_profit).toBeCloseTo(100.05 * 1.03);
    expect(position.stop_loss).toBeCloseTo(100.05 * 0.985);
    expect(state.inbox[0].title).toMatch(/Paper entry/);
    /* Sent everywhere the person can be reached, preferences aside. */
    expect(state.inbox[0].channels).toEqual({ inbox: true, push: true, telegram: true });

    const second = await runAutotrade(NOW + 5 * 60_000);
    expect(second.entered).toBe(0);
    expect(state.db.rows("trading_positions")).toHaveLength(1);
  });

  it("closes the paper position at its take-profit when a later bar reaches it", async () => {
    seedRule();
    await runAutotrade(NOW);
    state.signal = "none";
    state.bars = [...state.bars, hourBar(10, 99.8, 103.4)];
    const later = await runAutotrade(11 * HOUR + 60_000);
    expect(later.exited).toBe(1);
    const closed = state.db.rows("trading_positions")[0];
    expect(closed).toMatchObject({ status: "closed", exit_reason: "take_profit" });
    /* A 3% move on $100, less slippage on both fills and the taker fee on both legs. */
    expect(Number(closed.realised_pnl_usd)).toBeGreaterThan(2.7);
    expect(Number(closed.realised_pnl_usd)).toBeLessThan(3);
  });

  it("opens a short with its take-profit below the entry and its stop above", async () => {
    seedRule({ side: "short" });
    await runAutotrade(NOW);
    const [position] = state.db.rows("trading_positions");
    expect(position).toMatchObject({ side: "short", status: "open" });
    expect(position.entry_price).toBeCloseTo(99.95);
    expect(Number(position.take_profit)).toBeLessThan(Number(position.entry_price));
    expect(Number(position.stop_loss)).toBeGreaterThan(Number(position.entry_price));
  });

  it("enters nothing while the account is paused", async () => {
    seedRule();
    state.db.seed("trading_settings", [{ user_id: "user-1", paused: true, daily_loss_limit_usd: 100, max_open_positions: 3 }]);
    expect((await runAutotrade(NOW)).entered).toBe(0);
    expect(state.db.rows("trading_rules")[0].last_note).toMatch(/paused/);
  });
});

describe("runAutotrade live", () => {
  it("sends nothing, and says why, while live trading is off on the server", async () => {
    seedRule({ mode: "live" });
    await runAutotrade(NOW);
    expect(state.orders).toBe(0);
    expect(state.db.rows("trading_positions")).toHaveLength(0);
    expect(state.db.rows("trading_rules")[0].last_note).toMatch(/switched off/);
  });

  it("sends nothing without an approved trading key, even with live on", async () => {
    process.env.AUTOTRADE_LIVE = "1";
    seedRule({ mode: "live" });
    await runAutotrade(NOW);
    expect(state.orders).toBe(0);
    expect(state.db.rows("trading_rules")[0].last_note).toMatch(/not approved/);
  });
});

describe("runAutotrade live, with the key approved", () => {
  it("opens a long on Hyperliquid testnet and records the exchange's fill, TP and SL", async () => {
    process.env.AUTOTRADE_LIVE = "1";
    approveKey();
    seedRule({ mode: "live" });
    const result = await runAutotrade(NOW);
    expect(result.entered).toBe(1);
    expect(state.openCalls).toEqual([{ side: "long", coin: "BTC", network: "testnet" }]);
    expect(state.db.rows("trading_positions")[0]).toMatchObject({
      status: "open",
      mode: "live",
      network: "testnet",
      size: 0.5,
      entry_price: 100.2,
      take_profit: 103.2,
      stop_loss: 98.7,
      tp_cloid: "0xt",
      sl_cloid: "0xs",
    });
    expect(state.inbox.at(-1)?.title).toBe("Bought BTC");
  });

  it("sells to open a live short", async () => {
    process.env.AUTOTRADE_LIVE = "1";
    approveKey();
    seedRule({ mode: "live", side: "short" });
    await runAutotrade(NOW);
    expect(state.openCalls).toEqual([{ side: "short", coin: "BTC", network: "testnet" }]);
    expect(state.inbox.at(-1)?.title).toBe("Sold short BTC");
  });

  it("refuses a key approved on another network than the server trades on", async () => {
    process.env.AUTOTRADE_LIVE = "1";
    approveKey("mainnet");
    seedRule({ mode: "live" });
    await runAutotrade(NOW);
    expect(state.orders).toBe(0);
    expect(state.db.rows("trading_rules")[0].last_note).toMatch(/not approved on Hyperliquid testnet/);
  });
});

describe("runAutotrade limit orders", () => {
  function seedOrder(overrides: Record<string, unknown> = {}) {
    state.db.seed("trading_orders", [
      {
        id: "22222222-2222-2222-2222-222222222222",
        user_id: "user-1",
        mode: "paper",
        network: null,
        coin: "BTC",
        side: "long",
        limit_price: 99.6,
        size_usd: 100,
        leverage: 3,
        take_profit: 103,
        stop_loss: 98,
        status: "open",
        entry_cloid: null,
        tp_cloid: null,
        sl_cloid: null,
        created_at: new Date(5 * HOUR).toISOString(),
        ...overrides,
      },
    ]);
  }

  it("fills a paper limit when a later bar trades through it, as a position that records its leverage", async () => {
    seedOrder();
    const result = await runAutotrade(NOW);
    expect(result.entered).toBe(1);
    expect(state.db.rows("trading_orders")[0]).toMatchObject({ status: "filled" });
    expect(state.db.rows("trading_positions")[0]).toMatchObject({
      origin: "order",
      rule_id: null,
      mode: "paper",
      side: "long",
      entry_price: 99.6,
      take_profit: 103,
      stop_loss: 98,
      leverage: 3,
      status: "open",
    });
    expect(state.inbox.at(-1)?.title).toBe("Limit order filled · BTC");
  });

  it("leaves a paper limit waiting while no bar reaches it", async () => {
    seedOrder({ limit_price: 95 });
    expect((await runAutotrade(NOW)).entered).toBe(0);
    expect(state.db.rows("trading_orders")[0]).toMatchObject({ status: "open" });
  });

  it("records a live order Hyperliquid reports filled, with its exits' ids, and ends one it reports cancelled", async () => {
    approveKey();
    seedOrder({ mode: "live", network: "testnet", entry_cloid: "0xentry", tp_cloid: "0xtp", sl_cloid: "0xsl" });
    state.orderStatus = { status: "filled", filledSize: 1.004, limitPrice: 99.6 };
    await runAutotrade(NOW);
    expect(state.db.rows("trading_positions")[0]).toMatchObject({ mode: "live", network: "testnet", size: 1.004, tp_cloid: "0xtp", sl_cloid: "0xsl" });

    state.db = new FakeSupabase();
    approveKey();
    seedOrder({ mode: "live", network: "testnet", entry_cloid: "0xentry" });
    state.orderStatus = { status: "marginCanceled", filledSize: null, limitPrice: null };
    await runAutotrade(NOW);
    expect(state.db.rows("trading_orders")[0]).toMatchObject({ status: "cancelled" });
    expect(state.db.rows("trading_positions")).toHaveLength(0);
  });

  it("keeps a live rule out of a coin where a live limit order rests", async () => {
    process.env.AUTOTRADE_LIVE = "1";
    approveKey();
    seedOrder({ mode: "live", network: "testnet", entry_cloid: "0xentry" });
    seedRule({ mode: "live" });
    await runAutotrade(NOW);
    expect(state.orders).toBe(0);
    expect(state.db.rows("trading_rules")[0].last_note).toMatch(/limit order on BTC is resting/);
  });
});
