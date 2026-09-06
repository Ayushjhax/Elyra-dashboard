import { describe, expect, it } from "vitest";
import { MAX_TOKENS, composeSnapshot, type ComposeInput } from "./compose";
import type { TokenMeta } from "@/lib/solana/tokens";
import type { HeldToken } from "./fold";
import { LAMPORTS_PER_SOL } from "./types";

const SOL_PRICE = 100;

function meta(mint: string, symbol: string, usdPrice: number | null): TokenMeta {
  return {
    mint,
    symbol,
    name: symbol,
    decimals: 6,
    usdPrice,
    icon: null,
    /* `resolveTokens` only ever returns verified mints — an unverified one is
       absent from the map, which is what the composer keys off. */
    verified: true,
  };
}

function input(over: Partial<ComposeInput> = {}): ComposeInput {
  const base: ComposeInput = {
    address: "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
    cluster: "mainnet-beta",
    lamports: 2 * LAMPORTS_PER_SOL,
    slot: 444_882_697,
    held: new Map<string, HeldToken>(),
    meta: new Map<string, TokenMeta>(),
    solUsd: SOL_PRICE,
    fetchedAt: "2026-09-07T00:00:00.000Z",
  };
  return Object.assign(base, over);
}

describe("the total", () => {
  it("adds SOL to every priced, verified token", () => {
    const snapshot = composeSnapshot(
      input({
        held: new Map([
          ["usdc", { amount: 30, decimals: 6 }],
          ["usdt", { amount: 1, decimals: 6 }],
        ]),
        meta: new Map([
          ["usdc", meta("usdc", "USDC", 1)],
          ["usdt", meta("usdt", "USDT", 1)],
        ]),
      }),
    );
    /* 2 SOL @ 100 = 200, plus 31 of stablecoins. */
    expect(snapshot.usdValue).toBeCloseTo(231, 10);
  });

  it("is null, not partial, when the SOL price is unknown", () => {
    /* Showing the token value alone under a heading that says "total" would
       understate the wallet by its largest holding. */
    const snapshot = composeSnapshot(
      input({
        solUsd: null,
        held: new Map([["usdc", { amount: 30, decimals: 6 }]]),
        meta: new Map([["usdc", meta("usdc", "USDC", 1)]]),
      }),
    );
    expect(snapshot.usdValue).toBeNull();
    expect(snapshot.tokens[0]!.usdValue).toBe(30);
  });

  it("counts every token even when only some are shown", () => {
    /* The bug this file was extracted for. A live wallet held 127 priced
       tokens against a display cap of 100; summing the capped list
       understated it by the remaining 27, silently. */
    const held = new Map<string, HeldToken>();
    const metas = new Map<string, TokenMeta>();
    const count = MAX_TOKENS + 27;
    for (let i = 0; i < count; i += 1) {
      const mint = `mint${String(i).padStart(3, "0")}`;
      held.set(mint, { amount: 1, decimals: 6 });
      metas.set(mint, meta(mint, `T${i}`, 1));
    }

    const snapshot = composeSnapshot(input({ held, meta: metas }));

    expect(snapshot.tokens).toHaveLength(MAX_TOKENS);
    expect(snapshot.tokenCount).toBe(count);
    /* 200 of SOL plus one dollar per token — all 127 of them. */
    expect(snapshot.usdValue).toBeCloseTo(200 + count, 10);
  });
});

describe("what does not count", () => {
  it("excludes an unverified mint from the total but still lists it", () => {
    /* Airdropping a token named USDC costs a few cents. If it counted, an
       attacker could set the figure this dashboard displays. */
    const snapshot = composeSnapshot(
      input({
        held: new Map([
          ["real", { amount: 30, decimals: 6 }],
          ["fake", { amount: 1_000_000, decimals: 6 }],
        ]),
        meta: new Map([["real", meta("real", "USDC", 1)]]),
      }),
    );

    expect(snapshot.usdValue).toBeCloseTo(230, 10);
    expect(snapshot.tokenCount).toBe(2);
    expect(snapshot.uncounted).toEqual({ unpriced: 0, unverified: 1 });

    const fake = snapshot.tokens.find((t) => t.mint === "fake");
    expect(fake).toBeDefined();
    expect(fake!.verified).toBe(false);
    expect(fake!.symbol).toBeNull();
    expect(fake!.usdValue).toBeNull();
  });

  it("separates a verified token with no price from an unverified one", () => {
    const snapshot = composeSnapshot(
      input({
        held: new Map([
          ["nomarket", { amount: 5, decimals: 6 }],
          ["fake", { amount: 5, decimals: 6 }],
        ]),
        meta: new Map([["nomarket", meta("nomarket", "OBSCURE", null)]]),
      }),
    );
    expect(snapshot.uncounted).toEqual({ unpriced: 1, unverified: 1 });
    /* Neither reaches the total; only SOL does. */
    expect(snapshot.usdValue).toBeCloseTo(200, 10);
  });
});

describe("ordering and shape", () => {
  it("puts the most valuable first so a cap drops dust, not holdings", () => {
    const snapshot = composeSnapshot(
      input({
        held: new Map([
          ["dust", { amount: 1_000_000_000, decimals: 6 }],
          ["big", { amount: 10, decimals: 6 }],
          ["mid", { amount: 5, decimals: 6 }],
        ]),
        meta: new Map([
          /* Genuinely dust: 1e9 units at 1e-10 is ten cents. My first
             fixture priced this at 1e-7, which made it $100 — more than
             "MID" — and the assertion failed against correct code. */
          ["dust", meta("dust", "DUST", 0.0000000001)],
          ["big", meta("big", "BIG", 100)],
          ["mid", meta("mid", "MID", 10)],
        ]),
      }),
    );
    expect(snapshot.tokens.map((t) => t.symbol)).toEqual(["BIG", "MID", "DUST"]);
  });

  it("scales lamports to SOL and carries the slot through", () => {
    const snapshot = composeSnapshot(input({ lamports: 5_359_423_060 }));
    expect(snapshot.sol).toBeCloseTo(5.35942306, 9);
    expect(snapshot.lamports).toBe(5_359_423_060);
    expect(snapshot.slot).toBe(444_882_697);
  });

  it("reports an empty wallet as empty rather than as an error", () => {
    const snapshot = composeSnapshot(input({ lamports: 0 }));
    expect(snapshot.sol).toBe(0);
    expect(snapshot.tokens).toEqual([]);
    expect(snapshot.tokenCount).toBe(0);
    /* Zero is a real answer here: the price is known and the balance is nil. */
    expect(snapshot.usdValue).toBe(0);
    expect(snapshot.uncounted).toEqual({ unpriced: 0, unverified: 0 });
  });
});
