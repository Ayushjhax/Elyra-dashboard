import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   Linking a prediction-market account.

   The address cannot be derived: Polymarket holds positions in a contract
   wallet, and for legacy accounts there is no public mapping from the EOA
   that controls it. So it is supplied — and the risk that creates is a typo,
   or worse, a valid address belonging to someone else.

   These tests guard the two things that make that safe: the address is
   validated before it is stored, and a failed read never masquerades as a
   linked account.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({ db: null as unknown as FakeSupabase }));

vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));

const USER_A = "user-a";
const USER_B = "user-b";
const ADDRESS = "0xf28e42d20e4826f2b10a24bc952001697947cab2";

beforeEach(async () => {
  state.db = new FakeSupabase();
  state.db.seed("profiles", [
    { id: USER_A, privy_did: "did:privy:a", polymarket_address: null },
    { id: USER_B, privy_did: "did:privy:b", polymarket_address: null },
  ]);
  const { clearPredictionAccountCache } = await import("@/lib/prediction/account");
  clearPredictionAccountCache();
});

describe("address validation", () => {
  it("accepts an EVM address and rejects everything else", async () => {
    const { isPredictionAddress } = await import("@/lib/prediction/account");

    expect(isPredictionAddress(ADDRESS)).toBe(true);
    expect(isPredictionAddress(ADDRESS.toUpperCase().replace("0X", "0x"))).toBe(true);

    /* A Solana address is the likeliest wrong paste in this product, and it
       would query the Data API for an address that cannot exist there. */
    expect(isPredictionAddress("AxqtG9SHDkZTLSWg81Sp7VqAzQpRqXtR9ziJ3VQAS8As")).toBe(false);
    expect(isPredictionAddress("0x123")).toBe(false);
    expect(isPredictionAddress("")).toBe(false);
    expect(isPredictionAddress(`${ADDRESS}0`)).toBe(false);
  });

  it("refuses to store an address that is not one", async () => {
    const { linkPredictionAccount, predictionAccount } = await import(
      "@/lib/prediction/account"
    );

    expect(await linkPredictionAccount(USER_A, "not-an-address", true)).toBe(false);
    expect(await predictionAccount(USER_A)).toBeNull();
  });
});

describe("linking", () => {
  it("stores and reads back a linked account", async () => {
    const { linkPredictionAccount, predictionAccount } = await import(
      "@/lib/prediction/account"
    );

    expect(await linkPredictionAccount(USER_A, ADDRESS, true)).toBe(true);

    const account = await predictionAccount(USER_A);
    expect(account?.address).toBe(ADDRESS);
    expect(account?.verifiedAt).not.toBeNull();
  });

  it("normalises case, so the same wallet is one account", async () => {
    const { linkPredictionAccount, predictionAccount } = await import(
      "@/lib/prediction/account"
    );

    await linkPredictionAccount(USER_A, ADDRESS.toUpperCase().replace("0X", "0x"), true);
    expect((await predictionAccount(USER_A))?.address).toBe(ADDRESS);
  });

  it("links an empty account without marking it verified", async () => {
    /* A brand-new Polymarket account legitimately has nothing in it. Storing
       it unverified keeps "you have no positions" distinguishable from "that
       address is probably a typo". */
    const { linkPredictionAccount, predictionAccount } = await import(
      "@/lib/prediction/account"
    );

    await linkPredictionAccount(USER_A, ADDRESS, false);
    const account = await predictionAccount(USER_A);

    expect(account?.address).toBe(ADDRESS);
    expect(account?.verifiedAt).toBeNull();
  });

  it("scopes the account to its own user", async () => {
    const { linkPredictionAccount, predictionAccount } = await import(
      "@/lib/prediction/account"
    );

    await linkPredictionAccount(USER_A, ADDRESS, true);

    /* The service-role client bypasses RLS, so the user filter in the query
       IS the tenant boundary. */
    expect(await predictionAccount(USER_B)).toBeNull();
  });

  it("returns null for an anonymous caller without querying", async () => {
    const { predictionAccount } = await import("@/lib/prediction/account");
    const before = state.db.queries.length;

    expect(await predictionAccount(null)).toBeNull();
    expect(state.db.queries.length).toBe(before);
  });
});

describe("unlinking", () => {
  it("clears the address and the cache together", async () => {
    const { linkPredictionAccount, predictionAccount, unlinkPredictionAccount } =
      await import("@/lib/prediction/account");

    await linkPredictionAccount(USER_A, ADDRESS, true);
    expect(await predictionAccount(USER_A)).not.toBeNull();

    await unlinkPredictionAccount(USER_A);

    /* A stale cache here would keep reading a stranger's positions after the
       operator explicitly disconnected them. */
    expect(await predictionAccount(USER_A)).toBeNull();
  });
});

describe("address derivation", () => {
  it("derives a Polymarket proxy address from a signer", async () => {
    const { candidatesFor } = await import("@/lib/prediction/derive");
    const rows = candidatesFor("0x0000000000000000000000000000000000000001");

    /* Deterministic CREATE2 against Polymarket's published Proxy Factory
       (0xaB45…4052, from their contract list — not from memory). */
    expect(rows[0].kind).toBe("proxy");
    expect(rows[0].address).toBe("0x7754536ecd85c00b2e0cf9c1aa679340d8550756");
  });

  it("is stable — the same signer always derives the same address", async () => {
    const { candidatesFor } = await import("@/lib/prediction/derive");
    const a = candidatesFor("0xf28e42d20e4826f2b10a24bc952001697947cab2");
    const b = candidatesFor("0xF28E42D20E4826F2B10A24BC952001697947CAB2");

    /* Case must not change the derivation, or the same wallet would produce
       two different "accounts" depending on how it was typed. */
    expect(a[0].address).toBe(b[0].address);
  });

  it("also offers the signer itself, for someone who traded directly", async () => {
    const { candidatesFor } = await import("@/lib/prediction/derive");
    const rows = candidatesFor("0x0000000000000000000000000000000000000001");

    expect(rows.some((r) => r.kind === "signer")).toBe(true);
    expect(rows.find((r) => r.kind === "signer")?.address).toBe(
      "0x0000000000000000000000000000000000000001",
    );
  });

  it("never returns the same address twice", async () => {
    const { candidatesFor } = await import("@/lib/prediction/derive");
    const rows = candidatesFor("0xf28e42d20e4826f2b10a24bc952001697947cab2");
    expect(new Set(rows.map((r) => r.address)).size).toBe(rows.length);
  });

  it("returns nothing for something that is not an address", async () => {
    const { candidatesFor } = await import("@/lib/prediction/derive");

    /* A Solana address is the likeliest wrong input in this product. */
    expect(candidatesFor("AxqtG9SHDkZTLSWg81Sp7VqAzQpRqXtR9ziJ3VQAS8As")).toEqual([]);
    expect(candidatesFor("")).toEqual([]);
    expect(candidatesFor("0x123")).toEqual([]);
  });
});
