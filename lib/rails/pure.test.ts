import { describe, expect, it } from "vitest";
import { canonicalJson, GENESIS_HASH, ledgerCsv, ledgerHash, verifyChain } from "@/lib/rails/ledger";
import { decideIntent, intentSummary, LIMITS, validateMandate } from "@/lib/rails/policy";
import { fromBase, parseSolanaPayUrl, paysAtLeast, solanaPayUrl, USDC_MINT } from "@/lib/rails/solanaPay";
import type { LedgerEvent, Mandate } from "@/lib/rails/types";

/* ---------------------------------------------------------------------------
   Agent rails, the pure half: what a mandate may grant, the decision every
   intent gets, the ledger's hash chain, and Solana Pay settlement.
--------------------------------------------------------------------------- */

const PAYEE = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const OTHER = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const NOW = Date.parse("2026-11-16T12:00:00Z");
const CLEAR = { status: "clear" as const, source: "OFAC SDN", checkedAt: "2026-11-16T11:00:00Z" };

const mandate = (over: Partial<Mandate> = {}): Mandate => ({
  id: "m1",
  keyId: "k1",
  kinds: ["swap", "payment", "perp_order"],
  assets: null,
  perIntentUsd: 100,
  dailyUsd: 300,
  payees: [],
  autoPerps: false,
  livePerps: false,
  expiresAt: null,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  ...over,
});

const decide = (over: Partial<Parameters<typeof decideIntent>[0]> = {}, intent: Partial<Parameters<typeof decideIntent>[0]["intent"]> = {}) =>
  decideIntent({
    mandate: mandate(),
    intent: { kind: "swap", assets: ["USDC", "SOL"], usd: 50, ...intent },
    spentTodayUsd: 0,
    pendingCount: 0,
    now: NOW,
    ...over,
  });

describe("validateMandate", () => {
  it("accepts a mandate and normalises its lists", () => {
    const result = validateMandate({ kinds: ["swap", "payment", "nonsense"], perIntentUsd: 50, dailyUsd: 200, assets: "sol, usdc", payees: [PAYEE], expiresInDays: 30 });
    expect(result).toEqual({
      mandate: { kinds: ["swap", "payment"], assets: ["SOL", "USDC"], perIntentUsd: 50, dailyUsd: 200, payees: [PAYEE], autoPerps: false, livePerps: false, expiresInDays: 30 },
    });
  });

  it("refuses an empty grant, caps out of range, a daily cap below the per-intent cap, and a bad payee", () => {
    expect(validateMandate({ kinds: [], perIntentUsd: 10, dailyUsd: 10 })).toMatchObject({ error: expect.stringMatching(/at least one/) });
    expect(validateMandate({ kinds: ["swap"], perIntentUsd: LIMITS.maxPerIntentUsd + 1, dailyUsd: 60_000 })).toMatchObject({ error: expect.stringMatching(/per-transaction/) });
    expect(validateMandate({ kinds: ["swap"], perIntentUsd: 100, dailyUsd: 50 })).toMatchObject({ error: expect.stringMatching(/daily cap/) });
    expect(validateMandate({ kinds: ["payment"], perIntentUsd: 10, dailyUsd: 10, payees: ["0xabc"] })).toMatchObject({ error: expect.stringMatching(/Solana wallet/) });
    expect(validateMandate({ kinds: ["swap"], perIntentUsd: 10, dailyUsd: 10, expiresInDays: 400 })).toMatchObject({ error: expect.stringMatching(/1 to 90 days/) });
  });

  it("only lets perps run unreviewed or live when perps are granted at all", () => {
    expect(validateMandate({ kinds: ["swap"], perIntentUsd: 10, dailyUsd: 10, autoPerps: true, livePerps: true })).toMatchObject({ mandate: { autoPerps: false, livePerps: false } });
    expect(validateMandate({ kinds: ["perp_order"], perIntentUsd: 10, dailyUsd: 10, autoPerps: true })).toMatchObject({ mandate: { autoPerps: true } });
  });
});

describe("decideIntent", () => {
  it("routes an intent inside the mandate to the person for review", () => {
    expect(decide()).toEqual({ decision: "needs_approval", reasons: [] });
  });

  it("runs a perp order without review only when the mandate allows it", () => {
    expect(decide({}, { kind: "perp_order", assets: ["BTC"] })).toEqual({ decision: "needs_approval", reasons: [] });
    expect(decide({ mandate: mandate({ autoPerps: true }) }, { kind: "perp_order", assets: ["BTC"] })).toEqual({ decision: "auto", reasons: [] });
  });

  it("refuses with no mandate, an expired one, or a kind it does not grant", () => {
    expect(decide({ mandate: null }).decision).toBe("rejected");
    expect(decide({ mandate: mandate({ expiresAt: "2026-11-15T00:00:00Z" }) }).reasons[0]).toMatch(/expired/);
    expect(decide({ mandate: mandate({ kinds: ["swap"] }) }, { kind: "payment", payee: PAYEE, screening: CLEAR }).reasons[0]).toMatch(/does not include payments/);
  });

  it("holds every intent to the asset list and both caps", () => {
    expect(decide({ mandate: mandate({ assets: ["USDC", "JUP"] }) }).reasons[0]).toMatch(/SOL is outside/);
    expect(decide({}, { usd: 101 }).reasons[0]).toMatch(/per-transaction cap/);
    expect(decide({ spentTodayUsd: 260 }).reasons[0]).toMatch(/daily cap/);
    expect(decide({ pendingCount: LIMITS.maxPendingPerKey }).reasons[0]).toMatch(/waiting for review/);
  });

  it("fails closed when it cannot price an intent or screen a payee", () => {
    expect(decide({}, { usd: null }).reasons[0]).toMatch(/could not be priced/);
    expect(decide({}, { kind: "payment", payee: PAYEE, screening: { ...CLEAR, status: "unavailable" } }).reasons[0]).toMatch(/could not be screened/);
    expect(decide({}, { kind: "payment", payee: PAYEE, screening: null }).decision).toBe("rejected");
  });

  it("refuses a sanctioned payee, and one off the mandate's payee list", () => {
    expect(decide({}, { kind: "payment", payee: PAYEE, screening: { ...CLEAR, status: "listed" } }).reasons[0]).toMatch(/OFAC/);
    expect(decide({ mandate: mandate({ payees: [OTHER] }) }, { kind: "payment", payee: PAYEE, screening: CLEAR }).reasons[0]).toMatch(/allowed payees/);
    expect(decide({ mandate: mandate({ payees: [PAYEE] }) }, { kind: "payment", payee: PAYEE, screening: CLEAR }).decision).toBe("needs_approval");
  });

  it("summarises each kind in one line", () => {
    expect(intentSummary({ kind: "swap", from: "USDC", to: "SOL", amount: "50" })).toBe("Swap 50 USDC for SOL");
    expect(intentSummary({ kind: "payment", to: PAYEE, amount: "25", amountBase: "25000000", mint: USDC_MINT, requestId: null, reference: null })).toBe("Pay 25 USDC to 9WzD…AWWM");
  });
});

describe("the ledger chain", () => {
  function chain(bodies: Array<Record<string, unknown>>): LedgerEvent[] {
    const events: LedgerEvent[] = [];
    let prev = GENESIS_HASH;
    bodies.forEach((body, index) => {
      const entry = { prevHash: prev, seq: index + 1, at: `2026-11-16T12:00:0${index}.000Z`, actor: "elyra", event: "test", subjectId: null, body };
      const hash = ledgerHash(entry);
      events.push({ ...entry, hash });
      prev = hash;
    });
    return events;
  }

  it("hashes canonical JSON, so key order and storage do not matter", () => {
    expect(canonicalJson({ b: 1, a: { d: "x", c: [true, null] } })).toBe('{"a":{"c":[true,null],"d":"x"},"b":1}');
    const entry = { prevHash: GENESIS_HASH, seq: 1, at: "2026-11-16T12:00:00.000Z", actor: "elyra", event: "e", subjectId: null };
    expect(ledgerHash({ ...entry, body: { a: "1", b: "2" } })).toBe(ledgerHash({ ...entry, body: { b: "2", a: "1" } }));
    expect(ledgerHash({ ...entry, body: { a: "1" } })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies an intact chain and names where a tampered one breaks", () => {
    const events = chain([{ amount: "10" }, { amount: "20" }, { amount: "30" }]);
    expect(verifyChain(events)).toEqual({ ok: true, count: 3, head: events[2].hash });

    const edited = events.map((event) => ({ ...event, body: { ...event.body } }));
    edited[1].body.amount = "2000";
    expect(verifyChain(edited)).toMatchObject({ ok: false, brokenAt: 2, reason: expect.stringMatching(/contents/) });

    expect(verifyChain([events[0], events[2]])).toMatchObject({ ok: false, brokenAt: 3 });
    expect(verifyChain([])).toEqual({ ok: true, count: 0, head: GENESIS_HASH });
  });

  it("exports CSV that keeps every field needed to re-verify", () => {
    const csv = ledgerCsv(chain([{ memo: 'says "hi", twice' }]));
    expect(csv.split("\n")[0]).toBe("seq,at,actor,event,subject,body,prev_hash,hash");
    expect(csv).toContain('"{""memo"":""says \\""hi\\"", twice""}"');
  });
});

describe("Solana Pay", () => {
  const REFERENCE = "Fc1EwQUZyTEagaDvA1utHXCcZNyG1x2PLt2DfNu1cJdH";

  it("writes a transfer request a wallet reads, and reads one back", () => {
    const url = solanaPayUrl({ recipient: PAYEE, amount: "12.5", mint: USDC_MINT, reference: REFERENCE, label: "Elyra agent", message: "Data feed, November" });
    expect(url).toBe(
      `solana:${PAYEE}?amount=12.5&spl-token=${USDC_MINT}&reference=${REFERENCE}&label=Elyra%20agent&message=Data%20feed%2C%20November`,
    );
    expect(parseSolanaPayUrl(url)).toEqual({ recipient: PAYEE, amount: "12.5", mint: USDC_MINT, reference: REFERENCE });
    expect(parseSolanaPayUrl("solana:not-an-address")).toBeNull();
    expect(parseSolanaPayUrl(`solana:${PAYEE}?amount=-1`)).toBeNull();
  });

  it("settles only on the chain's record of the recipient's balance rising by the amount", () => {
    const want = { recipient: PAYEE, mint: USDC_MINT, amountBase: "12500000" };
    expect(paysAtLeast([{ owner: PAYEE, mint: USDC_MINT, delta: "12500000" }], want)).toBe(true);
    expect(paysAtLeast([{ owner: PAYEE, mint: USDC_MINT, delta: "12499999" }], want)).toBe(false);
    /* The right amount to someone else, or of another token, is not this payment. */
    expect(paysAtLeast([{ owner: OTHER, mint: USDC_MINT, delta: "99000000" }], want)).toBe(false);
    expect(paysAtLeast([{ owner: PAYEE, mint: "So11111111111111111111111111111111111111112", delta: "99000000000" }], want)).toBe(false);
  });

  it("writes base units as exact decimals", () => {
    expect(fromBase("12500000", 6)).toBe("12.5");
    expect(fromBase("1", 6)).toBe("0.000001");
    expect(fromBase("3000000", 6)).toBe("3");
  });
});
