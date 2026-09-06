import { describe, expect, it } from "vitest";
import { foldAccounts, type RawTokenAccount } from "./fold";
import { activityStatus } from "./types";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

/** The shape `getTokenAccountsByOwner` returns under jsonParsed encoding. */
function account(
  mint: string,
  uiAmount: number | null,
  decimals: number,
  amount?: string,
): RawTokenAccount {
  return {
    account: {
      data: { parsed: { info: { mint, tokenAmount: { amount, decimals, uiAmount } } } },
    },
  };
}

describe("foldAccounts", () => {
  it("sums several accounts for the same mint", () => {
    /* The bug this exists to prevent. One owner can hold an associated token
       account plus any number of auxiliary ones, and reading only the first
       understates the balance silently — the number still looks plausible. */
    const held = foldAccounts([
      account(USDC, 100, 6),
      account(USDC, 250.5, 6),
      account(USDC, 0.25, 6),
    ]);

    expect(held.size).toBe(1);
    expect(held.get(USDC)!.amount).toBeCloseTo(350.75, 10);
  });

  it("keeps different mints apart", () => {
    const held = foldAccounts([account(USDC, 10, 6), account(BONK, 5_000_000, 5)]);
    expect(held.get(USDC)!.amount).toBe(10);
    expect(held.get(BONK)!.amount).toBe(5_000_000);
  });

  it("scales from the raw amount when uiAmount is null", () => {
    /* uiAmount is documented as nullable, so the raw string and the decimals
       are the pair that can always be trusted. */
    const held = foldAccounts([account(USDC, null, 6, "1234567")]);
    expect(held.get(USDC)!.amount).toBeCloseTo(1.234567, 10);
  });

  it("drops zero-balance accounts", () => {
    /* Left behind by every closed position and every swept airdrop. They are
       not holdings, and a wallet accumulates dozens. */
    const held = foldAccounts([account(USDC, 0, 6), account(BONK, 0, 5, "0")]);
    expect(held.size).toBe(0);
  });

  it("keeps a real balance in a mint that also has an empty account", () => {
    const held = foldAccounts([account(USDC, 0, 6), account(USDC, 42, 6)]);
    expect(held.get(USDC)!.amount).toBe(42);
  });

  it("skips malformed entries instead of throwing", () => {
    /* Someone else's API. A single bad row must not lose the whole wallet. */
    const held = foldAccounts([
      {},
      { account: {} },
      { account: { data: { parsed: { info: {} } } } },
      account(USDC, null, 6, "not-a-number"),
      account(USDC, 7, 6),
    ]);
    expect(held.size).toBe(1);
    expect(held.get(USDC)!.amount).toBe(7);
  });

  it("returns an empty map for no accounts", () => {
    expect(foldAccounts([]).size).toBe(0);
  });
});

describe("activityStatus", () => {
  it("calls a transaction with an error failed, whatever its confirmation", () => {
    /* `err` is an object of unspecified shape on failure. A finalized
       transaction that reverted is still a failure. */
    expect(activityStatus({ InstructionError: [0, "x"] }, "finalized")).toBe("failed");
    expect(activityStatus({}, "confirmed")).toBe("failed");
  });

  it("treats processed as pending", () => {
    expect(activityStatus(null, "processed")).toBe("pending");
  });

  it("treats confirmed and finalized as confirmed", () => {
    expect(activityStatus(null, "confirmed")).toBe("confirmed");
    expect(activityStatus(null, "finalized")).toBe("confirmed");
  });

  it("treats an absent confirmation status as confirmed", () => {
    /* Older nodes omit the field. A signature returned at confirmed
       commitment has landed, so confirmed is the safe reading — and it is a
       reading, not a guess, which is why it is written down here. */
    expect(activityStatus(null, null)).toBe("confirmed");
  });

  it("does not mistake undefined err for a failure", () => {
    /* A node that omits the key entirely means success, same as null. */
    expect(activityStatus(undefined, "finalized")).toBe("confirmed");
  });
});
