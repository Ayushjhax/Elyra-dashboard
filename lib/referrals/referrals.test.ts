import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  isWellFormedCode,
  referralConfig,
  referralUrlFor,
} from "@/lib/referrals/config";
import {
  activationsToNextBonus,
  completedPoolCount,
  currentPoolProgress,
  unsettledPools,
} from "@/lib/referrals/pool";
import { activationKey, poolKey } from "@/lib/referrals/rewards";

/* ---------------------------------------------------------------------------
   The referral programme pays people, so every test here is about a way it
   could pay the wrong person, the wrong amount, or the same amount twice.
--------------------------------------------------------------------------- */

describe("referral codes", () => {
  it("excludes the characters people misread", () => {
    /* 0/O and 1/I/L are the pairs that get retyped wrong, and a referral code
       exists to be retyped. */
    for (const character of ["0", "O", "1", "I", "L"]) {
      expect(CODE_ALPHABET).not.toContain(character);
    }
  });

  it("accepts a well-formed code and rejects anything else", () => {
    expect(isWellFormedCode("AYUSH7P")).toBe(true);
    expect(isWellFormedCode("ayush7p")).toBe(true);

    expect(isWellFormedCode("SHORT")).toBe(false);
    expect(isWellFormedCode("WAYTOOLONGCODE")).toBe(false);
    expect(isWellFormedCode("ABCDE0F")).toBe(false);
    expect(isWellFormedCode("ABC-DEF")).toBe(false);
    expect(isWellFormedCode("")).toBe(false);
  });

  it("has enough room that collisions stay rare", () => {
    /* 31^7 ≈ 2.7e10. The generator retries on collision regardless, but the
       space has to be large enough that retries are exceptional. */
    expect(CODE_ALPHABET.length ** CODE_LENGTH).toBeGreaterThan(1e10);
  });

  it("builds a scoped link, never a bare root URL", () => {
    expect(referralUrlFor("AYUSH7P")).toMatch(/\/r\/AYUSH7P$/);
  });
});

describe("idempotency keys", () => {
  it("keys an activation to the referred account, so it can pay only once", () => {
    expect(activationKey("user-1")).toBe("referral_activation:user-1");
    expect(activationKey("user-1")).toBe(activationKey("user-1"));
  });

  it("keys a pool bonus to the referrer and the pool number", () => {
    expect(poolKey("user-1", 3)).toBe("referral_pool:user-1:3");
    /* Different pools are different keys; the same pool never is. */
    expect(poolKey("user-1", 3)).not.toBe(poolKey("user-1", 4));
    expect(poolKey("user-1", 3)).not.toBe(poolKey("user-2", 3));
  });
});

describe("activation pool arithmetic", () => {
  it("fills, completes and rolls over", () => {
    expect(currentPoolProgress(3, 5)).toBe(3);
    expect(completedPoolCount(3, 5)).toBe(0);

    expect(completedPoolCount(5, 5)).toBe(1);
    /* At the boundary the NEXT pool is empty, not full. */
    expect(currentPoolProgress(5, 5)).toBe(0);

    /* The spec's worked example: 13 lifetime, target 5. */
    expect(completedPoolCount(13, 5)).toBe(2);
    expect(currentPoolProgress(13, 5)).toBe(3);
  });

  it("never says zero activations are needed", () => {
    /* At an exact multiple the bonus for that boundary is already paid, so
       "0 more" would read as a bonus waiting to be claimed. */
    expect(activationsToNextBonus(5, 5)).toBe(5);
    expect(activationsToNextBonus(0, 5)).toBe(5);
    expect(activationsToNextBonus(3, 5)).toBe(2);
    expect(activationsToNextBonus(4, 5)).toBe(1);
  });

  it("honours a target other than five", () => {
    /* The target is configuration. Nothing may assume 5. */
    expect(completedPoolCount(9, 3)).toBe(3);
    expect(currentPoolProgress(9, 3)).toBe(0);
    expect(activationsToNextBonus(10, 3)).toBe(2);
  });

  it("owes nothing that has already been settled", () => {
    expect(unsettledPools(13, 5, 0)).toEqual([1, 2]);
    expect(unsettledPools(13, 5, 1)).toEqual([2]);
    /* The duplicate-bonus guard, in arithmetic form. */
    expect(unsettledPools(13, 5, 2)).toEqual([]);
    expect(unsettledPools(13, 5, 9)).toEqual([]);
  });

  it("settles several pools at once after a backfill", () => {
    expect(unsettledPools(20, 5, 0)).toEqual([1, 2, 3, 4]);
  });

  it("treats a nonsensical target as no pool rather than dividing by zero", () => {
    expect(completedPoolCount(10, 0)).toBe(0);
    expect(currentPoolProgress(10, 0)).toBe(0);
  });

  it("ignores a negative count", () => {
    expect(completedPoolCount(-5, 5)).toBe(0);
    expect(currentPoolProgress(-5, 5)).toBe(0);
  });
});

describe("reward configuration", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.ELYRA_REFERRAL_ACTIVATION_POINTS;
    delete process.env.ELYRA_ACTIVATION_POOL_TARGET;
    delete process.env.ELYRA_POOL_BONUS_POINTS;
    delete process.env.ELYRA_ACTIVATION_RULE;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("has one source for every reward number", () => {
    const config = referralConfig();
    expect(config.activationPoints).toBe(100);
    expect(config.activationPoolTarget).toBe(5);
    expect(config.poolCompletionBonusPoints).toBe(500);
  });

  it("is overridable without a code change", () => {
    process.env.ELYRA_ACTIVATION_POOL_TARGET = "3";
    process.env.ELYRA_POOL_BONUS_POINTS = "250";
    const config = referralConfig();
    expect(config.activationPoolTarget).toBe(3);
    expect(config.poolCompletionBonusPoints).toBe(250);
  });

  it("defaults activation to the rule that costs an attacker money", () => {
    /* "Connected a wallet" is free to farm; holding value is not. */
    expect(referralConfig().activationRule).toBe("wallet_funded");
  });

  it("accepts a different activation rule and ignores an unknown one", () => {
    process.env.ELYRA_ACTIVATION_RULE = "wallet_connected";
    expect(referralConfig().activationRule).toBe("wallet_connected");

    process.env.ELYRA_ACTIVATION_RULE = "vibes";
    expect(referralConfig().activationRule).toBe("wallet_funded");
  });

  it("refuses a target of zero, which would make every pool complete", () => {
    process.env.ELYRA_ACTIVATION_POOL_TARGET = "0";
    expect(referralConfig().activationPoolTarget).toBeGreaterThanOrEqual(1);
  });
});

/* ---------------------------------------------------------------------------
   Attribution and rewards, against a fake database.

   The Supabase client is mocked at the module boundary so the rules can be
   exercised without a live project: what is under test is the decision each
   function makes, not PostgREST.
--------------------------------------------------------------------------- */

const UNIQUE_VIOLATION = "23505";

interface FakeState {
  profiles: Array<{ id: string; referral_code: string | null; display_name: string | null }>;
  referrals: Array<Record<string, unknown>>;
  ledger: Array<Record<string, unknown>>;
}

const state: FakeState = { profiles: [], referrals: [], ledger: [] };

vi.mock("@/lib/supabase/server", () => ({
  serviceClient: () => ({
    from(table: string) {
      const filters: Array<[string, unknown]> = [];

      const rows = (): Array<Record<string, unknown>> => {
        const source =
          table === "profiles"
            ? (state.profiles as unknown as Array<Record<string, unknown>>)
            : table === "referrals"
              ? state.referrals
              : state.ledger;
        return source.filter((row) =>
          filters.every(([column, value]) => row[column] === value),
        );
      };

      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        is(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        single: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        insert(payload: Record<string, unknown>) {
          if (table === "referrals") {
            const clash = state.referrals.some(
              (row) => row.referred_user_id === payload.referred_user_id,
            );
            if (clash) {
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({ data: null, error: { code: UNIQUE_VIOLATION } }),
                }),
                then: (resolve: (value: unknown) => void) =>
                  resolve({ data: null, error: { code: UNIQUE_VIOLATION } }),
              };
            }
            state.referrals.push({ id: `r${state.referrals.length + 1}`, status: "pending", ...payload });
          }
          if (table === "points_ledger") {
            const clash = state.ledger.some((row) => row.source_id === payload.source_id);
            if (clash) {
              return {
                select: () => ({
                  single: () =>
                    Promise.resolve({ data: null, error: { code: UNIQUE_VIOLATION } }),
                }),
              };
            }
            state.ledger.push({ id: `l${state.ledger.length + 1}`, ...payload });
          }
          const created = { id: "new" };
          return {
            select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
            then: (resolve: (value: unknown) => void) =>
              resolve({ data: created, error: null }),
          };
        },
      };
      return builder;
    },
  }),
}));

const { bindReferral } = await import("@/lib/referrals/attribution");
const { credit } = await import("@/lib/referrals/rewards");

beforeEach(() => {
  state.profiles = [
    { id: "alice", referral_code: "AYUSH7P", display_name: "Alice" },
    { id: "bob", referral_code: "MEGA234", display_name: null },
    { id: "carol", referral_code: "ZEBRA79", display_name: "Carol Diaz" },
  ];
  state.referrals = [];
  state.ledger = [];
});

describe("bindReferral", () => {
  it("binds a valid code to a new account", async () => {
    const result = await bindReferral("bob", "AYUSH7P");
    expect(result).toEqual({ bound: true, referrerUserId: "alice" });
    expect(state.referrals).toHaveLength(1);
  });

  it("is case-insensitive, because links get retyped", async () => {
    expect(await bindReferral("bob", "ayush7p")).toEqual({
      bound: true,
      referrerUserId: "alice",
    });
  });

  it("refuses self-referral", async () => {
    expect(await bindReferral("alice", "AYUSH7P")).toEqual({
      bound: false,
      reason: "self",
    });
    expect(state.referrals).toHaveLength(0);
  });

  it("refuses an unknown code", async () => {
    expect(await bindReferral("bob", "ZZZZZZZ")).toEqual({
      bound: false,
      reason: "unknown_code",
    });
  });

  it("refuses a malformed code without touching the database", async () => {
    expect(await bindReferral("bob", "no")).toEqual({
      bound: false,
      reason: "unknown_code",
    });
  });

  it("does nothing when there is no code", async () => {
    expect(await bindReferral("bob", null)).toEqual({ bound: false, reason: "no_code" });
    expect(await bindReferral("bob", "  ")).toEqual({ bound: false, reason: "no_code" });
  });

  it("keeps the first referrer — a later link cannot overwrite it", async () => {
    await bindReferral("bob", "AYUSH7P");
    /* Carol's code, not bob's own — using his own would be rejected as a
       self-referral and would not exercise first touch at all. */
    const second = await bindReferral("bob", "ZEBRA79");
    expect(second).toEqual({ bound: false, reason: "already_referred" });
    expect(state.referrals).toHaveLength(1);
    expect(state.referrals[0].referrer_user_id).toBe("alice");
  });
});

describe("credit", () => {
  it("writes one ledger row", async () => {
    const result = await credit({
      userId: "alice",
      eventType: "REFERRAL_ACTIVATED",
      points: 100,
      sourceId: activationKey("bob"),
    });
    expect(result.credited).toBe(true);
    expect(state.ledger).toHaveLength(1);
  });

  it("refuses to pay the same key twice", async () => {
    /* The duplicate-reward guard. A retried webhook, a double-click and two
       tabs all land here, and none of them may pay again. */
    const input = {
      userId: "alice",
      eventType: "REFERRAL_ACTIVATED" as const,
      points: 100,
      sourceId: activationKey("bob"),
    };
    expect((await credit(input)).credited).toBe(true);
    expect((await credit(input)).credited).toBe(false);
    expect(state.ledger).toHaveLength(1);
  });

  it("pays different referrals separately", async () => {
    await credit({
      userId: "alice",
      eventType: "REFERRAL_ACTIVATED",
      points: 100,
      sourceId: activationKey("bob"),
    });
    await credit({
      userId: "alice",
      eventType: "REFERRAL_ACTIVATED",
      points: 100,
      sourceId: activationKey("carol"),
    });
    expect(state.ledger).toHaveLength(2);
  });

  it("pays a pool bonus once per pool", async () => {
    const bonus = {
      userId: "alice",
      eventType: "REFERRAL_POOL_BONUS" as const,
      points: 500,
      sourceId: poolKey("alice", 1),
    };
    expect((await credit(bonus)).credited).toBe(true);
    expect((await credit(bonus)).credited).toBe(false);

    expect(
      (await credit({ ...bonus, sourceId: poolKey("alice", 2) })).credited,
    ).toBe(true);
    expect(state.ledger).toHaveLength(2);
  });
});
