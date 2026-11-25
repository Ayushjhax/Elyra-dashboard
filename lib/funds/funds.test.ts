import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   An AI fund's whole life, end to end against the in-memory database: the
   person launches it, its manager trades through its key inside the
   charter, Elyra marks it, halts it at its drawdown limit, the person
   resumes it, moves capital, and winds it down — and the ledger still
   verifies at the end.

   The network edges are stubbed — Hyperliquid's prices and account, the
   live switch, notices — and everything between them is the real code,
   the automation's own order and close paths included.
--------------------------------------------------------------------------- */

const USER = "user-a";
const STRANGER = "user-b";
const KEY = "00000000-0000-4000-8000-00000000aaaa";
const OTHER_KEY = "00000000-0000-4000-8000-00000000bbbb";
const STRANGER_KEY = "00000000-0000-4000-8000-00000000cccc";

const state = vi.hoisted(() => ({
  db: null as unknown as InstanceType<typeof import("@/lib/test/supabase-fake").FakeSupabase>,
  mids: new Map<string, number>(),
  notices: [] as Array<{ userId: string; title: string; lines: string[] }>,
  liveRefusal: "Live trading is switched off on this server. Keep the rule on paper." as string | null,
  accountValue: 5_000 as number | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/rails/notify", () => ({
  notifyOwner: async (userId: string, title: string, lines: string[]) => {
    state.notices.push({ userId, title, lines });
  },
}));
vi.mock("@/lib/autotrade/hyperliquid", () => ({
  midPrice: async (_network: string, coin: string) => state.mids.get(coin) ?? null,
  midsFor: async (_network: string, coins: string[]) => new Map(coins.flatMap((coin) => (state.mids.has(coin) ? [[coin, state.mids.get(coin) as number]] : []))),
  accountValue: async () => state.accountValue,
  openPosition: async () => ({ ok: false, error: "not in tests" }),
  closePosition: async () => ({ ok: false, error: "not in tests" }),
  fillsSince: async () => [],
  positionSize: async () => 0,
}));
vi.mock("@/lib/autotrade/liveGate", () => ({
  liveRefusal: async () => state.liveRefusal,
  agentKeyFor: async () => null,
}));

const { launchFund, fundAction, moveCapital, setManager, updateCharter, ownerClosePosition } = await import("@/lib/funds/owner");
const { fundToolsFor, runFundTool } = await import("@/lib/funds/tools");
const { runFunds } = await import("@/lib/funds/run");
const { fundDetail, fundsState, fundStatement } = await import("@/lib/funds/console");
const { readLedger } = await import("@/lib/rails/store");
const { verifyChain } = await import("@/lib/rails/ledger");

const AUTH = { keyId: KEY, userId: USER, scopes: ["market" as const] };
const STRANGER_AUTH = { keyId: STRANGER_KEY, userId: STRANGER, scopes: ["market" as const] };

const CHARTER = {
  name: "Trend book",
  objective: "Trade BTC and ETH trends, long or short. Cut losers at the stop.",
  markets: ["BTC", "ETH", "SOL"],
  allowShorts: true,
  maxPositionPct: 25,
  maxGrossExposure: 1.5,
  maxLeverage: 3,
  maxPositions: 3,
  maxDrawdownPct: 10,
  dailyLossPct: 5,
};

async function launch(over: Record<string, unknown> = {}) {
  const launched = await launchFund(USER, { ...CHARTER, capitalUsd: 1_000, keyId: KEY, ...over });
  if (!launched.ok) throw new Error(launched.error);
  return launched.value.fund;
}

/* Results are read loosely here: each test asserts the shape it expects. */
const tool = async (name: string, args: Record<string, unknown> = {}, auth = AUTH) =>
  (await runFundTool(name, args, auth)) as { kind: string; result: unknown; reason?: string };
const order = (over: Record<string, unknown> = {}) => ({ coin: "BTC", side: "long", sizeUsd: 200, leverage: 2, takeProfitPct: 6, stopLossPct: 3, ...over });
const events = async () => ((await readLedger(USER)) ?? []).map((event) => event.event);

beforeEach(() => {
  state.db = new FakeSupabase();
  state.db.seed("profiles", [{ id: USER }, { id: STRANGER }]);
  state.db.seed("agent_keys", [
    { id: KEY, user_id: USER, name: "Claude PM", prefix: "elyra_ak_ab12", key_hash: "h1", revoked_at: null, last_used_at: null },
    { id: OTHER_KEY, user_id: USER, name: "Second bot", prefix: "elyra_ak_cd34", key_hash: "h2", revoked_at: null, last_used_at: null },
    { id: STRANGER_KEY, user_id: STRANGER, name: "Someone else", prefix: "elyra_ak_ef56", key_hash: "h3", revoked_at: null, last_used_at: null },
  ]);
  state.mids = new Map([
    ["BTC", 100_000],
    ["ETH", 4_000],
    ["SOL", 200],
  ]);
  state.notices = [];
  state.liveRefusal = "Live trading is switched off on this server. Keep the rule on paper.";
  state.accountValue = 5_000;
});

describe("launching a fund", () => {
  it("starts on paper at 100 a unit, with its manager's tools listed only to that key", async () => {
    const fund = await launch();
    expect(fund.mode).toBe("paper");
    expect(fund.status).toBe("active");
    expect(state.db.rows("ai_fund_flows")).toMatchObject([{ kind: "subscribe", amount_usd: 1_000, npu: 100, units: 10 }]);
    expect(state.db.rows("ai_fund_marks")).toHaveLength(1);
    expect(await events()).toEqual(["fund.launched"]);

    expect((await fundToolsFor(AUTH)).map((def) => def.name)).toEqual(["fund_overview", "fund_open_position", "fund_close_position", "fund_write_note"]);
    expect(await fundToolsFor({ ...AUTH, keyId: OTHER_KEY })).toEqual([]);
    expect(await fundToolsFor(STRANGER_AUTH)).toEqual([]);
    expect(await tool("fund_overview", {}, STRANGER_AUTH)).toMatchObject({ kind: "forbidden" });
  });

  it("makes a key for a new manager and shows it once", async () => {
    const launched = await launchFund(USER, { ...CHARTER, capitalUsd: 500, newKeyName: "Fund manager" });
    expect(launched.ok).toBe(true);
    if (!launched.ok) return;
    expect(launched.value.key).toMatch(/^elyra_ak_[A-Za-z0-9]{32}$/);
    expect(launched.value.fund.key_id).not.toBeNull();
    const stored = state.db.rows("agent_keys").find((row) => row.id === launched.value.fund.key_id);
    expect(stored?.key_hash).not.toBe(launched.value.key);
  });

  it("refuses a bad charter, too little capital, and a key that already runs a fund", async () => {
    expect(await launchFund(USER, { ...CHARTER, capitalUsd: 50 })).toMatchObject({ ok: false });
    expect(await launchFund(USER, { ...CHARTER, maxLeverage: 9, capitalUsd: 1_000 })).toMatchObject({ ok: false });
    await launch();
    const again = await launchFund(USER, { ...CHARTER, capitalUsd: 1_000, keyId: KEY });
    expect(again).toMatchObject({ ok: false, error: expect.stringMatching(/already manages Trend book/) });
    expect(await launchFund(USER, { ...CHARTER, capitalUsd: 1_000, keyId: STRANGER_KEY })).toMatchObject({ ok: false });
  });
});

describe("the manager", () => {
  it("opens inside the charter, through the automation's own path, with a receipt", async () => {
    const fund = await launch();
    const opened = await tool("fund_open_position", order({ thesis: "BTC broke out of a three-week range on rising volume." }));
    expect(opened.kind).toBe("ok");
    const result = opened.result as { status: string; position: { positionId: string }; receipt: string };
    expect(result.status).toBe("opened");
    expect(result.receipt).toMatch(/^[0-9a-f]{64}$/);

    const row = state.db.rows("trading_positions")[0];
    expect(row).toMatchObject({ fund_id: fund.id, origin: "fund", mode: "paper", coin: "BTC", side: "long", status: "open", rule_name: "Trend book" });
    expect(String(row.entry_reason)).not.toMatch(/range/);
    expect(state.db.rows("ai_fund_notes")).toMatchObject([{ position_id: result.position.positionId, key_id: KEY }]);
    expect(state.notices.at(-1)?.title).toBe("Trend book · Bought BTC");
    expect(state.notices.at(-1)?.lines.join(" ")).not.toMatch(/range/);
    expect(await events()).toEqual(["fund.launched", "fund.position_opened", "fund.note"]);
  });

  it("is refused — on the record — outside the charter", async () => {
    await launch();
    const outside = await tool("fund_open_position", order({ coin: "DOGE" }));
    expect(outside.result).toMatchObject({ status: "refused", reasons: [expect.stringMatching(/outside the fund's markets/)] });
    const big = await tool("fund_open_position", order({ sizeUsd: 600 }));
    expect((big.result as { reasons: string[] }).reasons.join(" ")).toMatch(/at most \$250 per position/);
    const lever = await tool("fund_open_position", order({ leverage: 5 }));
    expect((lever.result as { reasons: string[] }).reasons.join(" ")).toMatch(/above the charter's 3x/);
    await tool("fund_open_position", order());
    const twice = await tool("fund_open_position", order());
    expect((twice.result as { reasons: string[] }).reasons.join(" ")).toMatch(/already holds BTC/);
    expect(state.db.rows("trading_positions")).toHaveLength(1);
    expect((await events()).filter((event) => event === "fund.order_refused")).toHaveLength(4);
  });

  it("chooses neither paper nor live: the fund does", async () => {
    await launch();
    await tool("fund_open_position", order({ mode: "live" }));
    expect(state.db.rows("trading_positions")[0].mode).toBe("paper");
  });

  it("reads the book marked to market, and closes a position with the result", async () => {
    await launch();
    const opened = (await tool("fund_open_position", order())).result as { position: { positionId: string } };
    state.mids.set("BTC", 105_000);
    const overview = (await tool("fund_overview")).result as { book: { navUsd: number; navPerUnit: number }; positions: unknown[]; ownersBrief: string; canOpen: boolean };
    expect(overview.ownersBrief).toBe(CHARTER.objective);
    expect(overview.positions).toHaveLength(1);
    expect(overview.book.navUsd).toBeGreaterThan(1_008);
    expect(overview.book.navPerUnit).toBeGreaterThan(100.8);
    expect(overview.canOpen).toBe(true);

    const closed = await tool("fund_close_position", { positionId: opened.position.positionId, reason: "Target reached early." });
    expect(closed.kind).toBe("ok");
    expect(state.db.rows("trading_positions")[0]).toMatchObject({ status: "closed", exit_reason: "closed_by_manager" });
    expect(Number(state.db.rows("trading_positions")[0].realised_pnl_usd)).toBeGreaterThan(8);
  });

  it("cannot reach another account's fund or position", async () => {
    await launch();
    const opened = (await tool("fund_open_position", order())).result as { position: { positionId: string } };
    state.db.seed("ai_funds", [{ id: "00000000-0000-4000-8000-0000000fffff", user_id: STRANGER, key_id: STRANGER_KEY, name: "Theirs", objective: "x", mode: "paper", status: "active", markets: ["BTC"] }]);
    const theirs = await tool("fund_close_position", { positionId: opened.position.positionId }, STRANGER_AUTH);
    expect(theirs).toMatchObject({ kind: "tool-error", result: { error: "This fund has no position with that id." } });
    expect(state.db.rows("trading_positions")[0].status).toBe("open");
  });
});

describe("Elyra as administrator and risk officer", () => {
  it("halts the fund at its drawdown limit, closes everything, and opens nothing until resumed", async () => {
    const fund = await launch();
    await tool("fund_open_position", order({ sizeUsd: 240, leverage: 3, stopLossPct: 20 }));
    await tool("fund_open_position", order({ coin: "ETH", sizeUsd: 240, leverage: 3, stopLossPct: 20 }));
    expect(state.db.rows("trading_positions")).toHaveLength(2);
    /* Both fall 25%: about -$120 on $1,000, past the 10% limit. */
    state.mids.set("BTC", 75_000);
    state.mids.set("ETH", 3_000);
    const report = await runFunds();
    expect(report.halted).toBe(1);

    const detail = await fundDetail(USER, fund.id);
    expect(detail?.summary.status).toBe("halted");
    expect(detail?.summary.haltReason).toMatch(/10% limit/);
    expect(detail?.positions).toHaveLength(0);
    expect(state.db.rows("trading_positions").every((row) => row.status === "closed" && row.exit_reason === "risk_halt")).toBe(true);
    expect(state.notices.at(-1)?.title).toBe("Trend book halted");

    const refused = await tool("fund_open_position", order());
    expect((refused.result as { reasons: string[] }).reasons[0]).toMatch(/halted/);

    const resumed = await fundAction(USER, fund.id, "resume", {});
    expect(resumed.ok).toBe(true);
    const again = await fundDetail(USER, fund.id);
    expect(again?.summary.status).toBe("active");
    expect(again?.risk.drawdownPct).toBeCloseTo(0, 6);
    /* The account's own automation limits still bind the fund: $120 lost
       today is past the default $100 a day. */
    const gated = await tool("fund_open_position", order({ sizeUsd: 150 }));
    expect(gated.result).toMatchObject({ status: "failed", reasons: [expect.stringMatching(/loss limit of \$100/)] });
    state.db.seed("trading_settings", [{ user_id: USER, paused: false, daily_loss_limit_usd: 500, max_open_positions: 3 }]);
    expect((await tool("fund_open_position", order({ sizeUsd: 150 }))).result).toMatchObject({ status: "opened" });
    expect(await events()).toEqual(expect.arrayContaining(["fund.halted", "fund.resumed"]));
  });

  it("ledgers a take-profit the automation recorded, once, and seals each day's closing NAV", async () => {
    const fund = await launch();
    await tool("fund_open_position", order());
    const row = state.db.rows("trading_positions")[0];
    const now = Date.now();
    Object.assign(row, { status: "closed", exit_reason: "take_profit", exit_price: 106_000, realised_pnl_usd: 11.7, closed_at: new Date(now + 500).toISOString() });

    await runFunds(now + 1_000);
    await runFunds(now + 2_000);
    const closes = ((await readLedger(USER)) ?? []).filter((event) => event.event === "fund.position_closed");
    expect(closes).toHaveLength(1);
    expect(closes[0].body).toMatchObject({ reason: "take_profit", realisedUsd: 11.7 });

    await runFunds(now + 86_400_000);
    const nav = ((await readLedger(USER)) ?? []).find((event) => event.event === "fund.nav");
    expect(nav?.body).toMatchObject({ day: new Date(now).toISOString().slice(0, 10) });
    expect(Number(nav?.body.npu)).toBeGreaterThan(100);
    expect(state.db.rows("ai_funds").find((entry) => entry.id === fund.id)?.day_start_on).toBe(new Date(now + 86_400_000).toISOString().slice(0, 10));
  });
});

describe("the person", () => {
  it("moves capital at the unit price, so returns stay the manager's", async () => {
    const fund = await launch();
    await tool("fund_open_position", order());
    state.mids.set("BTC", 110_000);
    const before = await fundDetail(USER, fund.id);
    const npu = before?.book.npu ?? 0;
    expect(npu).toBeGreaterThan(101);

    expect(await moveCapital(USER, fund.id, { direction: "add", amountUsd: 500 })).toMatchObject({ ok: true });
    const after = await fundDetail(USER, fund.id);
    expect(after?.book.npu).toBeCloseTo(npu, 6);
    expect(after?.book.navUsd).toBeCloseTo((before?.book.navUsd ?? 0) + 500, 6);

    const tooMuch = await moveCapital(USER, fund.id, { direction: "withdraw", amountUsd: 1_500 });
    expect(tooMuch).toMatchObject({ ok: false, error: expect.stringMatching(/At most/) });
    expect(await moveCapital(USER, fund.id, { direction: "withdraw", amountUsd: 300 })).toMatchObject({ ok: true });
    expect((await fundDetail(USER, fund.id))?.book.npu).toBeCloseTo(npu, 6);
    expect(await events()).toEqual(expect.arrayContaining(["fund.capital_added", "fund.capital_withdrawn"]));
  });

  it("changes the charter and the manager, on the record", async () => {
    const fund = await launch();
    expect(await updateCharter(USER, fund.id, { maxLeverage: 2, markets: ["BTC"] })).toMatchObject({ ok: true });
    const refused = await tool("fund_open_position", order({ coin: "ETH", leverage: 3 }));
    expect((refused.result as { reasons: string[] }).reasons.join(" ")).toMatch(/outside the fund's markets.*above the charter's 2x/);

    expect(await setManager(USER, fund.id, OTHER_KEY)).toMatchObject({ ok: true });
    expect(await fundToolsFor(AUTH)).toEqual([]);
    expect((await fundToolsFor({ ...AUTH, keyId: OTHER_KEY })).length).toBe(4);
    expect(await setManager(USER, fund.id, STRANGER_KEY)).toMatchObject({ ok: false });

    const ledger = (await readLedger(USER)) ?? [];
    expect(ledger.find((event) => event.event === "fund.charter_changed")?.body).toMatchObject({ changes: { maxLeverage: { from: 3, to: 2 } } });
    expect(ledger.find((event) => event.event === "fund.manager_changed")?.body).toMatchObject({ from: KEY, to: OTHER_KEY });
  });

  it("overrides the manager by closing a position, and only in their own fund", async () => {
    const fund = await launch();
    const opened = (await tool("fund_open_position", order())).result as { position: { positionId: string } };
    expect(await ownerClosePosition(STRANGER, fund.id, opened.position.positionId)).toMatchObject({ ok: false, status: 404 });
    expect(await ownerClosePosition(USER, fund.id, opened.position.positionId)).toMatchObject({ ok: true });
    expect(state.db.rows("trading_positions")[0]).toMatchObject({ status: "closed", exit_reason: "closed_by_owner" });
    expect(await fundDetail(STRANGER, fund.id)).toBeNull();
    expect(await fundStatement(STRANGER, fund.id)).toBeNull();
  });

  it("pauses, and the manager opens nothing new", async () => {
    const fund = await launch();
    expect(await fundAction(USER, fund.id, "pause", {})).toMatchObject({ ok: true });
    const refused = await tool("fund_open_position", order());
    expect((refused.result as { reasons: string[] }).reasons[0]).toMatch(/paused/);
    expect(await fundAction(USER, fund.id, "pause", {})).toMatchObject({ ok: false });
  });

  it("winds the fund down: every position closed, the record frozen, the manager released", async () => {
    const fund = await launch();
    await tool("fund_open_position", order());
    const wound = await fundAction(USER, fund.id, "wind_down", {});
    expect(wound.ok).toBe(true);
    const closed = await fundDetail(USER, fund.id);
    expect(closed?.summary.status).toBe("closed");
    expect(closed?.summary.closedReason).toBe("wound_down");
    expect(closed?.finalReport?.trades).toBe(1);
    expect(closed?.actions).toEqual([]);
    expect(await fundToolsFor(AUTH)).toEqual([]);
    expect(state.notices.at(-1)?.title).toBe("Fund closed · Trend book");

    /* The key is free to run a new fund. */
    expect((await launchFund(USER, { ...CHARTER, name: "Second book", capitalUsd: 1_000, keyId: KEY })).ok).toBe(true);
    const statement = await fundStatement(USER, fund.id);
    expect(statement?.split("\n")[0]).toBe("at,type,coin,side,amount_usd,nav_usd,nav_per_unit,units,realised_pnl_usd");
    expect(statement).toMatch(/,trade,BTC,long,/);
  });

  it("graduates to live only with a record, the live switch, and capital the account holds", async () => {
    const fund = await launch();
    const young = await fundAction(USER, fund.id, "graduate", { capitalUsd: 1_000 });
    expect(young).toMatchObject({ ok: false, error: expect.stringMatching(/7 days on paper.*3 closed trades/) });

    /* Give it a record: launched ten days ago, three closed trades. */
    const row = state.db.rows("ai_funds").find((entry) => entry.id === fund.id) as Record<string, unknown>;
    row.created_at = new Date(Date.now() - 10 * 86_400_000).toISOString();
    for (const coin of ["BTC", "ETH", "SOL"]) {
      const opened = (await tool("fund_open_position", order({ coin, sizeUsd: 100 }))).result as { position: { positionId: string } };
      await tool("fund_close_position", { positionId: opened.position.positionId });
    }

    const off = await fundAction(USER, fund.id, "graduate", { capitalUsd: 1_000 });
    expect(off).toMatchObject({ ok: false, error: expect.stringMatching(/switched off/) });

    state.liveRefusal = null;
    state.db.seed("trading_agents", [{ user_id: USER, network: "testnet", account_address: "0xabc", agent_address: "0xdef", approved_at: "2026-11-01T00:00:00Z" }]);
    const tooMuch = await fundAction(USER, fund.id, "graduate", { capitalUsd: 9_000 });
    expect(tooMuch).toMatchObject({ ok: false, error: expect.stringMatching(/\$5,000 not already allocated/) });

    state.accountValue = null;
    expect(await fundAction(USER, fund.id, "graduate", { capitalUsd: 1_000 })).toMatchObject({ ok: false, status: 503 });
    state.accountValue = 5_000;

    const graduated = await fundAction(USER, fund.id, "graduate", { capitalUsd: 2_000 });
    expect(graduated.ok).toBe(true);
    if (!graduated.ok) return;
    const live = graduated.value.successor;
    expect(live).toMatchObject({ mode: "live", status: "active", key_id: KEY, predecessor_id: fund.id });
    expect((await fundDetail(USER, fund.id))?.summary).toMatchObject({ status: "closed", closedReason: "graduated" });
    expect((await fundDetail(USER, fund.id))?.successorId).toBe(live?.id);
    expect(((await tool("fund_overview")).result as { fund: { mode: string } }).fund.mode).toBe("live");
    expect(state.notices.at(-1)?.title).toBe("Trend book is live");
  });
});

describe("the record", () => {
  it("lists every fund, and the ledger still verifies after a whole life", async () => {
    const fund = await launch();
    await tool("fund_open_position", order());
    await tool("fund_write_note", { text: "Holding through the CPI print; stop is wide enough." });
    await tool("fund_open_position", order({ coin: "DOGE" }));
    await runFunds();
    await fundAction(USER, fund.id, "wind_down", {});

    const listed = await fundsState(USER);
    expect(listed.funds).toHaveLength(1);
    expect(listed.funds[0]).toMatchObject({ name: "Trend book", status: "closed", manager: { name: "Claude PM" } });
    expect(listed.managers.find((manager) => manager.keyId === KEY)?.managing).toBeNull();
    expect((await fundsState(STRANGER)).funds).toEqual([]);

    const ledger = (await readLedger(USER)) ?? [];
    expect(verifyChain(ledger).ok).toBe(true);
    expect(ledger.find((event) => event.event === "fund.note")?.body).toMatchObject({ sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(JSON.stringify(ledger)).not.toMatch(/CPI print/);
  });
});
