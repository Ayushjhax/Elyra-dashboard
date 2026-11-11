import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   Arena's part of the five-minute tick, against the fake database: a closed
   trade is reviewed once, with a computed label; a call settles at the
   one-minute close for its minute, or is voided when no price exists; each
   settled call gets one card; and every step is capped per run. Hyperliquid,
   the model and delivery are stand-ins.
--------------------------------------------------------------------------- */

type Candle = { openTime: number; closeTime: number; open: number; high: number; low: number; close: number };

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  candles: (() => []) as (coin: string, interval: string, start: number, end: number) => Candle[],
  reply: (async () => ({ text: "", model: "test-model" })) as () => Promise<{ text: string; refused?: boolean; model: string }>,
  sent: [] as Array<{ userId: string; title: string; lines: string[] }>,
  candleCalls: [] as Array<{ coin: string; interval: string }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/notifications/deliver", () => ({
  recipientFor: async (userId: string) => ({ userId, chatId: null, devices: [] }),
  send: async (recipient: { userId: string }, _channels: unknown, message: { title: string; lines: string[] }) => {
    state.sent.push({ userId: recipient.userId, title: message.title, lines: message.lines });
  },
}));
vi.mock("@/lib/autotrade/hyperliquid", () => ({
  hyperliquidCandles: async (coin: string, interval: string, start: number, end: number) => {
    state.candleCalls.push({ coin, interval });
    return state.candles(coin, interval, start, end);
  },
}));
vi.mock("@/lib/agent/providers/router", () => ({ route: async () => state.reply() }));

const { CARD_CAP, REVIEW_CAP, runArena } = await import("@/lib/arena/engine");

const MINUTE = 60_000;
const NOW = Date.parse("2026-11-11T12:00:00.000Z");
const iso = (at: number) => new Date(at).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(900_000 + n).padStart(12, "0")}`;

function position(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: id(n),
    user_id: "user-a",
    rule_id: null,
    rule_name: "BTC test",
    mode: "paper",
    coin: "BTC",
    side: "long",
    size: "10",
    entry_price: "100",
    take_profit: "104",
    stop_loss: "98",
    leverage: 2,
    exit_price: "104",
    exit_reason: "take_profit",
    realised_pnl_usd: "40",
    status: "closed",
    opened_at: iso(NOW - 6 * 60 * MINUTE),
    closed_at: iso(NOW - 30 * MINUTE - n * MINUTE),
    ...overrides,
  };
}

function call(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: id(100 + n),
    user_id: "user-a",
    market: "BTC",
    direction: "above",
    price: "95000",
    resolves_at: iso(NOW - 10 * MINUTE),
    confidence: 70,
    visibility: "groups",
    statement: "BTC closes above $95000 at 2026-11-11T11:50:00.000Z, 70% confident",
    receipt: "ab".repeat(32),
    created_at: iso(NOW - 2 * 86_400_000),
    status: "open",
    settled_price: null,
    settled_source: null,
    settled_at: null,
    brier: null,
    card: null,
    card_model: null,
    onchain_signature: null,
    ...overrides,
  };
}

/* One-minute bars around a moment, each closing at `close`. */
const minutes = (from: number, count: number, close: (at: number) => number): Candle[] =>
  Array.from({ length: count }, (_, index) => {
    const openTime = from + index * MINUTE;
    const value = close(openTime);
    return { openTime, closeTime: openTime + MINUTE - 1, open: value, high: value, low: value, close: value };
  });

beforeEach(() => {
  state.db = new FakeSupabase();
  state.sent = [];
  state.candleCalls = [];
  state.candles = () => [];
  state.reply = async () => ({ text: "", model: "test-model" });
});

describe("trade reviews", () => {
  it("reviews a closed trade once, with the label the code computed", async () => {
    state.db.seed("trading_positions", [position(1)]);
    state.candles = (_coin, interval, start) =>
      interval === "15m" ? [{ openTime: start, closeTime: start + 15 * MINUTE - 1, open: 100, high: 105, low: 99, close: 104 }] : [];
    state.reply = async () => ({ text: "It closed at its take-profit for 2.0R and kept 80% of the best move.", model: "test-model" });

    const report = await runArena(NOW);
    expect(report.reviewed).toBe(1);
    const [review] = state.db.rows("trade_reviews");
    expect(review).toMatchObject({ user_id: "user-a", position_id: id(1), label: "brilliant", coaching_model: "test-model" });
    expect((review.facts as { rMultiple: number }).rMultiple).toBe(2);
    expect(state.sent.map((message) => message.title)).toEqual(["Brilliant · BTC long"]);

    expect((await runArena(NOW)).reviewed).toBe(0);
    expect(state.db.rows("trade_reviews")).toHaveLength(1);
  });

  it("uses the code's coaching when the model strays from the facts, and does not notify an ordinary label", async () => {
    state.db.seed("trading_positions", [position(1, { exit_price: "101", realised_pnl_usd: "10", exit_reason: "exit_rule" })]);
    state.reply = async () => ({ text: "A 12% gain on the account.", model: "test-model" });

    await runArena(NOW);
    const [review] = state.db.rows("trade_reviews");
    expect(review.label).toBe("good");
    expect(review.coaching_model).toBe("fallback");
    expect(review.coaching).toBe("It closed on its plan for 0.5R. The plan worked as written.");
    expect(state.sent).toEqual([]);
  });

  it("skips open, old and incomplete positions", async () => {
    state.db.seed("trading_positions", [
      position(1, { status: "open", closed_at: null }),
      position(2, { closed_at: iso(NOW - 15 * 86_400_000) }),
      position(3, { exit_price: null }),
    ]);
    expect((await runArena(NOW)).reviewed).toBe(0);
  });

  it(`writes at most ${REVIEW_CAP} reviews a run, and the rest on the next`, async () => {
    state.db.seed("trading_positions", Array.from({ length: REVIEW_CAP + 2 }, (_, n) => position(n + 1)));
    expect((await runArena(NOW)).reviewed).toBe(REVIEW_CAP);
    expect((await runArena(NOW)).reviewed).toBe(2);
    expect((await runArena(NOW)).reviewed).toBe(0);
  });
});

describe("settling calls", () => {
  it("settles at the one-minute close for the minute it named, scores it and settles its backings", async () => {
    const at = NOW - 10 * MINUTE;
    state.db.seed("arena_calls", [call(1)]);
    state.db.seed("arena_call_backings", [
      { id: id(201), call_id: id(101), user_id: "user-b", stance: "tail", points: 20, week: "2026-W46", settled_points: null },
      { id: id(202), call_id: id(101), user_id: "user-c", stance: "fade", points: 5, week: "2026-W46", settled_points: null },
    ]);
    /* The minute ending at the resolution closes at 95,100; the minute after, at 94,000. */
    state.candles = (_coin, interval, start) => (interval === "1m" ? minutes(start, 11, (openTime) => (openTime < at ? 95_100 : 94_000)) : []);

    const report = await runArena(NOW);
    expect(report.settled).toBe(1);
    const [settled] = state.db.rows("arena_calls");
    expect(settled).toMatchObject({ status: "hit", settled_price: 95_100, settled_source: "Hyperliquid one-minute close" });
    expect(settled.brier).toBeCloseTo(0.09);
    expect(state.db.rows("arena_call_backings").map((row) => row.settled_points)).toEqual([20, -5]);
    expect(state.sent.find((message) => message.title === "Your call hit")?.userId).toBe("user-a");
  });

  it("leaves a call that is not yet due, and one whose minute is not final", async () => {
    state.db.seed("arena_calls", [call(1, { resolves_at: iso(NOW + 60 * MINUTE) }), call(2, { resolves_at: iso(NOW - MINUTE) })]);
    state.candles = (_coin, _interval, start) => minutes(start, 11, () => 96_000);
    expect((await runArena(NOW)).settled).toBe(0);
    expect(state.db.rows("arena_calls").map((row) => row.status)).toEqual(["open", "open"]);
  });

  it("waits while no price exists for the minute, then voids it after three days", async () => {
    state.db.seed("arena_calls", [call(1)]);
    state.db.seed("arena_call_backings", [{ id: id(201), call_id: id(101), user_id: "user-b", stance: "tail", points: 20, week: "2026-W46", settled_points: null }]);
    expect((await runArena(NOW)).voided).toBe(0);
    expect(state.db.rows("arena_calls")[0].status).toBe("open");

    const later = NOW + 3 * 86_400_000;
    const report = await runArena(later);
    expect(report.voided).toBe(1);
    expect(state.db.rows("arena_calls")[0]).toMatchObject({ status: "void", settled_price: null, brier: null });
    expect(state.db.rows("arena_call_backings")[0].settled_points).toBe(0);
  });
});

describe("cards", () => {
  it("writes one card per settled call, falling back to the code's text when the model fails", async () => {
    state.db.seed("arena_calls", [
      call(1, { status: "miss", settled_price: "94000", settled_source: "Hyperliquid one-minute close", settled_at: iso(NOW), brier: "0.49" }),
      call(2, { status: "void", settled_at: iso(NOW) }),
    ]);
    state.reply = async () => {
      throw new Error("provider down");
    };
    expect((await runArena(NOW)).cards).toBe(1);
    const [miss, voided] = state.db.rows("arena_calls");
    expect(miss.card).toBe("Here lies a call: BTC closes above $95000 at 2026-11-11T11:50:00.000Z, 70% confident. It settled at $94000. The receipt stays.");
    expect(miss.card_model).toBe("fallback");
    expect(voided.card).toBeNull();
    expect((await runArena(NOW)).cards).toBe(0);
  });

  it(`writes at most ${CARD_CAP} cards a run`, async () => {
    state.db.seed(
      "arena_calls",
      Array.from({ length: CARD_CAP + 1 }, (_, n) =>
        call(n + 1, { status: "hit", settled_price: "96000", settled_source: "Hyperliquid one-minute close", settled_at: iso(NOW - n * MINUTE), brier: "0.09" }),
      ),
    );
    state.reply = async () => ({ text: "Called it, and it settled at $96000.", model: "test-model" });
    expect((await runArena(NOW)).cards).toBe(CARD_CAP);
    expect(state.db.rows("arena_calls").filter((row) => row.card_model === "test-model")).toHaveLength(CARD_CAP);
    expect((await runArena(NOW)).cards).toBe(1);
  });
});
