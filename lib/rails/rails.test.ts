import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   Agent rails, end to end against the in-memory database: an agent asks,
   the mandate decides, the person answers, the chain proves it, and every
   step lands in a ledger that still verifies at the end.

   The network edges are stubbed — prices, the sanctions lists, the chain,
   Hyperliquid — and everything between them is the real code.
--------------------------------------------------------------------------- */

const USER = "user-a";
const STRANGER = "user-b";
const KEY = "key-a";
const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const PAYEE = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SIG = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";

const state = vi.hoisted(() => ({
  db: null as unknown as InstanceType<typeof import("@/lib/test/supabase-fake").FakeSupabase>,
  screening: "clear" as "clear" | "listed" | "unavailable",
  prices: new Map<string, number>(),
  notices: [] as Array<{ userId: string; title: string }>,
  trades: [] as unknown[],
  tx: null as null | { err: unknown; signers: string[]; changes: Array<{ owner: string; mint: string; decimals: number; delta: string }> },
  signatures: [] as Array<{ signature: string; err: unknown }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/rails/screening", () => ({
  screenAddress: async () => ({ status: state.screening, source: "test list", checkedAt: "2026-11-16T12:00:00.000Z" }),
}));
vi.mock("@/lib/providers/router", () => ({
  routePrices: async (mints: string[]) => ({ ok: true, data: mints.flatMap((id) => (state.prices.has(id) ? [{ id, usdPrice: state.prices.get(id) }] : [])) }),
}));
vi.mock("@/lib/rails/notify", () => ({
  notifyOwner: async (userId: string, title: string) => {
    state.notices.push({ userId, title });
  },
}));
vi.mock("@/lib/autotrade/trade", () => ({
  openMarketTrade: async (userId: string, order: unknown) => {
    state.trades.push({ userId, order });
    return { ok: true, position: { id: "pos-1", mode: "paper", entryPrice: 98_000, size: 0.0005 } };
  },
}));
vi.mock("@/lib/solana/rpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/solana/rpc")>()),
  getTransactionTokenChanges: async () => state.tx,
  getSignaturesForAddress: async () => state.signatures,
}));
vi.mock("@/lib/solana/holdings", () => ({ readHolding: async () => ({ mint: USDC, decimals: 6, amount: "500000000" }) }));
vi.mock("@/lib/solana/transfer", () => ({
  buildTokenTransfer: async (input: Record<string, unknown>) => ({ unsignedTransaction: `built:${JSON.stringify(input)}`, lastValidBlockHeight: 100 }),
}));

const { proposeIntent, approveIntent, declineIntent, confirmIntent, buildPayment, expireIntents } = await import("@/lib/rails/intents");
const { saveMandate, railsState, revokeMandate } = await import("@/lib/rails/console");
const { createRequest, checkRequest } = await import("@/lib/rails/requests");
const { runRailsTool, railsToolsFor, activeMandate } = await import("@/lib/rails/tools");
const { readLedger } = await import("@/lib/rails/store");
const { verifyChain } = await import("@/lib/rails/ledger");

const AUTH = { keyId: KEY, userId: USER, scopes: ["market" as const] };

async function grant(over: Record<string, unknown> = {}) {
  const saved = await saveMandate(USER, { keyId: KEY, kinds: ["swap", "payment", "perp_order", "payment_request"], perIntentUsd: 100, dailyUsd: 250, ...over });
  if (!saved.ok) throw new Error(saved.error);
  return saved.mandate;
}

beforeEach(() => {
  state.db = new FakeSupabase();
  state.db.seed("profiles", [{ id: USER, solana_address: WALLET }, { id: STRANGER, solana_address: PAYEE }]);
  state.db.seed("agent_keys", [{ id: KEY, user_id: USER, name: "Research bot", prefix: "elyra_ak_ab12", revoked_at: null }]);
  state.screening = "clear";
  state.prices = new Map([
    [USDC, 1],
    ["So11111111111111111111111111111111111111112", 180],
  ]);
  state.notices = [];
  state.trades = [];
  state.tx = null;
  state.signatures = [];
});

describe("mandates", () => {
  it("lists no rails tools to a key without one, and only the granted kinds to one with", async () => {
    expect(railsToolsFor(await activeMandate(AUTH))).toEqual([]);
    await grant({ kinds: ["swap"] });
    const names = railsToolsFor(await activeMandate(AUTH)).map((tool) => tool.name);
    expect(names).toContain("rails_propose_swap");
    expect(names).toContain("rails_mandate");
    expect(names).not.toContain("rails_propose_payment");
    expect(await runRailsTool("rails_propose_payment", { to: PAYEE, amount: "5" }, AUTH)).toMatchObject({ kind: "forbidden" });
  });

  it("refuses an ask from a key with no mandate, and records nothing", async () => {
    expect(await proposeIntent(AUTH, "swap", { from: "USDC", to: "SOL", amount: "10" })).toMatchObject({ ok: false, status: 403 });
    expect(state.db.rows("agent_intents")).toHaveLength(0);
  });

  it("can be revoked, after which the key asks for nothing", async () => {
    const mandate = await grant();
    expect(await revokeMandate(USER, mandate.id)).toBe(true);
    expect(await proposeIntent(AUTH, "swap", { from: "USDC", to: "SOL", amount: "10" })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("an agent's swap", () => {
  it("waits for the person, then executes on the chain's proof, with every step in a ledger that verifies", async () => {
    await grant();
    const proposed = await proposeIntent(AUTH, "swap", { from: "usdc", to: "sol", amount: "40", memo: "Rebalance\u0007 toward SOL" });
    if (!proposed.ok) throw new Error(proposed.error);
    const intent = proposed.value;
    expect(intent).toMatchObject({ status: "pending", usdValue: 40, summary: "Swap 40 USDC for SOL", memo: "Rebalance toward SOL", agent: "Research bot" });
    expect(intent.receipt).toMatch(/^[0-9a-f]{64}$/);
    expect(state.notices).toEqual([{ userId: USER, title: "Research bot is asking you to approve" }]);

    /* Another account cannot answer it. */
    expect(await approveIntent(STRANGER, intent.id)).toMatchObject({ ok: false, status: 404 });

    expect(await approveIntent(USER, intent.id)).toMatchObject({ ok: true, value: { status: "approved" } });
    state.tx = { err: null, signers: [WALLET], changes: [{ owner: WALLET, mint: USDC, decimals: 6, delta: "-40000000" }] };
    const confirmed = await confirmIntent(USER, intent.id, SIG, WALLET);
    expect(confirmed).toMatchObject({ ok: true, value: { status: "executed", result: { signature: SIG } } });

    const ledger = await readLedger(USER);
    expect(ledger?.map((event) => event.event)).toEqual(["mandate.granted", "intent.proposed", "intent.approved", "intent.executed"]);
    expect(ledger?.[1].hash).toBe(intent.receipt);
    expect(verifyChain(ledger ?? [])).toMatchObject({ ok: true, count: 4 });
  });

  it("is refused — and recorded — past either cap or outside the asset list", async () => {
    await grant({ assets: ["USDC", "SOL"] });
    expect(await proposeIntent(AUTH, "swap", { from: "USDC", to: "SOL", amount: "150" })).toMatchObject({ ok: true, value: { status: "rejected", reasons: [expect.stringMatching(/per-transaction cap/)] } });
    await proposeIntent(AUTH, "swap", { from: "USDC", to: "SOL", amount: "90" });
    await proposeIntent(AUTH, "swap", { from: "USDC", to: "SOL", amount: "90" });
    expect(await proposeIntent(AUTH, "swap", { from: "USDC", to: "SOL", amount: "90" })).toMatchObject({ value: { status: "rejected", reasons: [expect.stringMatching(/daily cap/)] } });
    expect(await proposeIntent(AUTH, "swap", { from: "USDC", to: "JUP", amount: "5" })).toMatchObject({ value: { status: "rejected", reasons: [expect.stringMatching(/JUP is outside/)] } });
    expect(state.db.rows("agent_intents").filter((row) => row.status === "rejected")).toHaveLength(3);
  });

  it("refuses a token that is not on the swap list, and one it cannot price", async () => {
    await grant();
    expect(await proposeIntent(AUTH, "swap", { from: "USDC", to: "SCAMCOIN", amount: "5" })).toMatchObject({ ok: false, error: expect.stringMatching(/swap list/) });
    state.prices.delete(USDC);
    expect(await proposeIntent(AUTH, "swap", { from: "USDC", to: "SOL", amount: "5" })).toMatchObject({ value: { status: "rejected", reasons: [expect.stringMatching(/could not be priced/)] } });
  });

  it("will not record a transaction it cannot prove", async () => {
    await grant();
    const proposed = await proposeIntent(AUTH, "swap", { from: "USDC", to: "SOL", amount: "10" });
    if (!proposed.ok) throw new Error(proposed.error);
    await approveIntent(USER, proposed.value.id);
    state.tx = { err: null, signers: [PAYEE], changes: [] };
    expect(await confirmIntent(USER, proposed.value.id, SIG, WALLET)).toMatchObject({ ok: false, status: 422, error: expect.stringMatching(/not signed by this account/) });
    state.tx = { err: { InstructionError: [0, "Custom"] }, signers: [WALLET], changes: [] };
    expect(await confirmIntent(USER, proposed.value.id, SIG, WALLET)).toMatchObject({ ok: false, status: 422 });
  });
});

describe("an agent's payment", () => {
  it("screens the payee and fails closed when the screen cannot run", async () => {
    await grant();
    state.screening = "listed";
    expect(await proposeIntent(AUTH, "payment", { to: PAYEE, amount: "20" })).toMatchObject({ value: { status: "rejected", reasons: [expect.stringMatching(/OFAC/)] } });
    state.screening = "unavailable";
    expect(await proposeIntent(AUTH, "payment", { to: PAYEE, amount: "20" })).toMatchObject({ value: { status: "rejected", reasons: [expect.stringMatching(/could not be screened/)] } });
    expect(await proposeIntent(AUTH, "payment", { to: WALLET, amount: "20" })).toMatchObject({ ok: false, error: expect.stringMatching(/own wallet/) });
  });

  it("builds from the intent, not the browser, and settles the request it pays", async () => {
    await grant();
    /* Another Elyra account asks to be paid; this agent pays that request. */
    const created = await createRequest({ userId: STRANGER, keyId: null, recipient: PAYEE, amount: "12.5", label: "Data feed, November", actor: "person" });
    if (!created.ok) throw new Error(created.error);
    const proposed = await proposeIntent(AUTH, "payment", { requestId: created.request.id, to: WALLET, amount: "0.01" });
    if (!proposed.ok) throw new Error(proposed.error);
    /* The request's payee and amount win over whatever the agent passed. */
    expect(proposed.value.params).toMatchObject({ kind: "payment", to: PAYEE, amount: "12.5", amountBase: "12500000", requestId: created.request.id });

    expect(await buildPayment(USER, proposed.value.id, WALLET)).toMatchObject({ ok: false, status: 409 });
    await approveIntent(USER, proposed.value.id);
    const built = await buildPayment(USER, proposed.value.id, WALLET);
    expect(built.ok && built.value.unsignedTransaction).toContain(`"to":"${PAYEE}"`);
    expect(built.ok && built.value.unsignedTransaction).toContain('"amount":"12500000"');

    state.tx = { err: null, signers: [WALLET], changes: [{ owner: PAYEE, mint: USDC, decimals: 6, delta: "12000000" }] };
    expect(await confirmIntent(USER, proposed.value.id, SIG, WALLET)).toMatchObject({ ok: false, status: 422, error: expect.stringMatching(/does not pay/) });
    state.tx = { err: null, signers: [WALLET], changes: [{ owner: PAYEE, mint: USDC, decimals: 6, delta: "12500000" }, { owner: WALLET, mint: USDC, decimals: 6, delta: "-12500000" }] };
    expect(await confirmIntent(USER, proposed.value.id, SIG, WALLET)).toMatchObject({ ok: true, value: { status: "executed" } });

    expect(state.db.rows("payment_requests")[0]).toMatchObject({ status: "paid", paid_signature: SIG, paid_by: WALLET });
    const theirs = await readLedger(STRANGER);
    expect(theirs?.map((event) => event.event)).toEqual(["request.created", "request.settled"]);
    expect(verifyChain(theirs ?? []).ok).toBe(true);
  });
});

describe("an agent's perp order", () => {
  it("runs at once only when the mandate lets perps run, and goes live only when it allows live", async () => {
    await grant();
    const reviewed = await proposeIntent(AUTH, "perp_order", { coin: "btc", side: "long", sizeUsd: 50, leverage: 2, takeProfitPct: 4, stopLossPct: 2 });
    expect(reviewed).toMatchObject({ value: { status: "pending" } });
    expect(state.trades).toHaveLength(0);
    expect(await proposeIntent(AUTH, "perp_order", { coin: "BTC", side: "long", sizeUsd: 50, leverage: 2, takeProfitPct: 4, stopLossPct: 2, mode: "live" })).toMatchObject({ ok: false, status: 403 });

    await grant({ autoPerps: true });
    const auto = await proposeIntent(AUTH, "perp_order", { coin: "BTC", side: "short", sizeUsd: 50, leverage: 2, takeProfitPct: 4, stopLossPct: 2 });
    expect(auto).toMatchObject({ value: { status: "executed", result: { positionId: "pos-1" } } });
    expect(state.trades).toHaveLength(1);
  });
});

describe("payment requests and the five-minute pass", () => {
  it("settle from the chain only on a transaction that pays the recipient enough", async () => {
    await grant();
    const outcome = await runRailsTool("rails_create_payment_request", { amount: "3", label: "Signal subscription" }, AUTH);
    expect(outcome).toMatchObject({ kind: "ok", result: { request: { amount: "3", status: "open", recipient: WALLET } } });
    expect((outcome as { result: { request: { solanaPayUrl: string } } }).result.request.solanaPayUrl).toMatch(/^solana:7xKX.*spl-token=EPjF.*reference=/);
    const row = state.db.rows("payment_requests")[0] as never;

    state.signatures = [{ signature: "short", err: null }];
    state.tx = { err: null, signers: [PAYEE], changes: [{ owner: WALLET, mint: USDC, decimals: 6, delta: "2999999" }] };
    expect((await checkRequest(row)).status).toBe("open");
    state.tx = { err: null, signers: [PAYEE], changes: [{ owner: WALLET, mint: USDC, decimals: 6, delta: "3000000" }] };
    expect(await checkRequest(row)).toMatchObject({ status: "paid", paid_by: PAYEE });
    expect(state.notices.at(-1)?.title).toBe("Payment received · 3 USDC");
  });

  it("lapses intents nobody answered, and records it", async () => {
    await grant();
    const proposed = await proposeIntent(AUTH, "swap", { from: "USDC", to: "SOL", amount: "10" });
    if (!proposed.ok) throw new Error(proposed.error);
    expect(await expireIntents(Date.now() + 31 * 60_000)).toBe(1);
    expect(await approveIntent(USER, proposed.value.id)).toMatchObject({ ok: false, status: 409 });
    expect(await declineIntent(USER, proposed.value.id)).toMatchObject({ ok: false, status: 409 });
    const state_ = await railsState(USER);
    expect(state_.intents[0]).toMatchObject({ status: "expired" });
    expect(state_.ledger.verification).toMatchObject({ ok: true });
    expect(state_.agents[0]).toMatchObject({ name: "Research bot", mandate: { perIntentUsd: 100 } });
  });
});
