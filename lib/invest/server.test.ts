import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";
import type { TransactionTokenChanges } from "@/lib/solana/rpc";

/* ---------------------------------------------------------------------------
   A position is only ever what the chain says a proven swap moved. These hold
   the ledger to that: the right wallet, the right portfolio, the real delta,
   once.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({ db: null as unknown as FakeSupabase }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));

import { readPositions, recordFill } from "@/lib/invest/server";
import { tokenChangesFrom } from "@/lib/solana/rpc";
import { assetFor } from "@/lib/trade";

const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const OTHER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const SIG = "5".repeat(88);
const NVDA = assetFor("NVDAON")!.mint;
const USDC = assetFor("USDC")!.mint;

function landed(changes: TransactionTokenChanges["changes"], overrides: Partial<TransactionTokenChanges> = {}) {
  return async (): Promise<TransactionTokenChanges> => ({ err: null, signers: [WALLET], changes, ...overrides });
}

const noWait = async () => {};

beforeEach(() => {
  state.db = new FakeSupabase();
});

describe("tokenChangesFrom", () => {
  it("nets pre and post balances per owner and mint, counting created and closed accounts from zero", () => {
    const changes = tokenChangesFrom(
      [{ mint: USDC, owner: WALLET, uiTokenAmount: { amount: "250000000", decimals: 6 } }],
      [
        { mint: USDC, owner: WALLET, uiTokenAmount: { amount: "150000000", decimals: 6 } },
        /* A token account the swap created: no `pre` entry. */
        { mint: NVDA, owner: WALLET, uiTokenAmount: { amount: "560000000", decimals: 9 } },
        /* Someone else's account, and an unchanged balance, are reported but not ours. */
        { mint: USDC, owner: OTHER, uiTokenAmount: { amount: "1", decimals: 6 } },
      ],
    );
    expect(changes).toContainEqual({ owner: WALLET, mint: USDC, decimals: 6, delta: "-100000000" });
    expect(changes).toContainEqual({ owner: WALLET, mint: NVDA, decimals: 9, delta: "560000000" });
  });
});

describe("recordFill", () => {
  it("records the wallet's real change in the portfolio's holding, and ignores the USDC side", async () => {
    const result = await recordFill(
      { userId: "user-1", wallet: WALLET, portfolioId: "ai-leaders", signature: SIG },
      landed([
        { owner: WALLET, mint: USDC, decimals: 6, delta: "-100000000" },
        { owner: WALLET, mint: NVDA, decimals: 9, delta: "560000000" },
      ]),
      noWait,
    );
    expect(result).toEqual({ outcome: "recorded", moved: { NVDAON: 0.56 } });
    expect(state.db.rows("portfolio_fills")).toHaveLength(1);
    expect(await readPositions("user-1")).toEqual({ "ai-leaders": { NVDAON: 0.56 } });
  });

  it("counts a signature once, and refuses to count it toward a second portfolio", async () => {
    const read = landed([{ owner: WALLET, mint: NVDA, decimals: 9, delta: "1000000000" }]);
    await recordFill({ userId: "user-1", wallet: WALLET, portfolioId: "ai-leaders", signature: SIG }, read, noWait);

    const again = await recordFill({ userId: "user-1", wallet: WALLET, portfolioId: "ai-leaders", signature: SIG }, read, noWait);
    expect(again.outcome).toBe("already-recorded");

    const elsewhere = await recordFill({ userId: "user-1", wallet: WALLET, portfolioId: "mag7-crypto", signature: SIG }, read, noWait);
    expect(elsewhere).toMatchObject({ outcome: "rejected" });
    expect(elsewhere.reason).toMatch(/AI leaders/);

    const stolen = await recordFill({ userId: "user-2", wallet: WALLET, portfolioId: "ai-leaders", signature: SIG }, read, noWait);
    expect(stolen).toMatchObject({ outcome: "rejected" });
    expect(state.db.rows("portfolio_fills")).toHaveLength(1);
  });

  it("refuses a transaction this wallet did not sign, or one that failed", async () => {
    const notOurs = await recordFill(
      { userId: "user-1", wallet: WALLET, portfolioId: "ai-leaders", signature: SIG },
      landed([{ owner: WALLET, mint: NVDA, decimals: 9, delta: "1" }], { signers: [OTHER] }),
      noWait,
    );
    expect(notOurs.outcome).toBe("rejected");

    const failed = await recordFill(
      { userId: "user-1", wallet: WALLET, portfolioId: "ai-leaders", signature: SIG },
      landed([], { err: { InstructionError: [0, "Custom"] } }),
      noWait,
    );
    expect(failed.outcome).toBe("rejected");
    expect(state.db.rows("portfolio_fills")).toHaveLength(0);
  });

  it("refuses a swap that moved none of the portfolio's holdings", async () => {
    const result = await recordFill(
      { userId: "user-1", wallet: WALLET, portfolioId: "income-treasury", signature: SIG },
      landed([{ owner: WALLET, mint: NVDA, decimals: 9, delta: "1000000000" }]),
      noWait,
    );
    expect(result.outcome).toBe("rejected");
  });

  it("says pending, not rejected, while the node has not seen the swap", async () => {
    const result = await recordFill(
      { userId: "user-1", wallet: WALLET, portfolioId: "ai-leaders", signature: SIG },
      async () => null,
      noWait,
    );
    expect(result.outcome).toBe("pending");
  });

  it("refuses an unknown portfolio and a malformed signature before reading the chain", async () => {
    const read = vi.fn(landed([]));
    expect((await recordFill({ userId: "u", wallet: WALLET, portfolioId: "nope", signature: SIG }, read, noWait)).outcome).toBe("rejected");
    expect((await recordFill({ userId: "u", wallet: WALLET, portfolioId: "ai-leaders", signature: "abc" }, read, noWait)).outcome).toBe("rejected");
    expect(read).not.toHaveBeenCalled();
  });
});

describe("readPositions", () => {
  it("sums buys and sells, and drops a holding sold to zero", async () => {
    state.db.seed("portfolio_fills", [
      { user_id: "user-1", portfolio_id: "ai-leaders", signature: "a", mint: NVDA, delta_units: "2000000000", decimals: 9 },
      { user_id: "user-1", portfolio_id: "ai-leaders", signature: "b", mint: NVDA, delta_units: "-500000000", decimals: 9 },
      { user_id: "user-1", portfolio_id: "mag7-crypto", signature: "c", mint: NVDA, delta_units: "1000000000", decimals: 9 },
      { user_id: "user-1", portfolio_id: "mag7-crypto", signature: "d", mint: NVDA, delta_units: "-1000000000", decimals: 9 },
      { user_id: "user-2", portfolio_id: "ai-leaders", signature: "e", mint: NVDA, delta_units: "9000000000", decimals: 9 },
    ]);
    expect(await readPositions("user-1")).toEqual({ "ai-leaders": { NVDAON: 1.5 } });
  });
});
