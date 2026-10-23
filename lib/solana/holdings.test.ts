import { beforeEach, describe, expect, it, vi } from "vitest";
import { toBaseUnits } from "@/lib/trade";

/* The module reaches the RPC on import-time-free paths only, but `readHolding`
   does — and these tests are about the arithmetic, which is what can silently
   send the wrong amount. Mocked so nothing here needs a node. */
vi.mock("@/lib/solana/rpc", () => ({
  TOKEN_PROGRAM_ID: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  TOKEN_2022_PROGRAM_ID: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  getBalance: vi.fn(),
  getTokenAccountsByOwner: vi.fn(),
  getMinimumBalanceForRentExemption: vi.fn(),
}));

const {
  SOL_TRANSFER_FEE_LAMPORTS,
  fromBaseUnits,
  leavesSendableBalance,
  readSolHolding,
} = await import("@/lib/solana/holdings");
const { getBalance, getMinimumBalanceForRentExemption } = await import("@/lib/solana/rpc");

/** Mainnet's actual figure for a 0-byte account, stable for years — used as
    test data, not trusted as a constant anywhere in the module under test. */
const RENT_EXEMPT_LAMPORTS = 890_880;

/* ---------------------------------------------------------------------------
   Turning base units back into a figure a person reads before they send it.

   This is the number on the confirm screen of a transfer that cannot be
   recalled, and on a "send everything" the operator never typed it — so it
   has to be exactly what will move, not approximately.
--------------------------------------------------------------------------- */

describe("fromBaseUnits", () => {
  it("places the decimal point", () => {
    expect(fromBaseUnits("1500000000", 9)).toBe("1.5");
    expect(fromBaseUnits("1000000", 6)).toBe("1");
  });

  it("pads a balance smaller than one whole unit", () => {
    expect(fromBaseUnits("5000", 9)).toBe("0.000005");
    expect(fromBaseUnits("1", 9)).toBe("0.000000001");
  });

  it("handles zero decimals", () => {
    expect(fromBaseUnits("42", 0)).toBe("42");
  });

  it("drops trailing zeros but never significant ones", () => {
    expect(fromBaseUnits("1200000000", 9)).toBe("1.2");
    expect(fromBaseUnits("1000000001", 9)).toBe("1.000000001");
  });

  it("is exact past the safe integer range", () => {
    /* ~18.4 billion tokens at nine decimals — past 2^53, which is where the
       obvious `Number(amount) / 10 ** decimals` starts inventing digits. A
       balance is allowed to be displayed approximately; an amount about to
       leave the wallet is not. */
    expect(fromBaseUnits("18446744073709551615", 9)).toBe("18446744073.709551615");
  });

  it("round-trips through toBaseUnits", () => {
    for (const [amount, decimals] of [
      ["1.5", 9],
      ["0.000000001", 9],
      ["1234.56789", 6],
      ["7", 0],
    ] as const) {
      const base = toBaseUnits(amount, decimals);
      expect(base).not.toBeNull();
      expect(fromBaseUnits(base!, decimals)).toBe(amount);
    }
  });
});

/* ---------------------------------------------------------------------------
   Native SOL can never send its whole balance: the fee comes out of it.

   Getting this wrong is not a rounding error, it is a max-send that fails
   simulation over a wallet that plainly has the money — which is exactly the
   dead end this whole path exists to remove.
--------------------------------------------------------------------------- */

describe("readSolHolding", () => {
  const OWNER = "AxqtG9SHDkZTLSWg81Sp7VqAzQpRqXtR9ziJ3VQAS8As";

  beforeEach(() => {
    vi.mocked(getMinimumBalanceForRentExemption).mockResolvedValue(RENT_EXEMPT_LAMPORTS);
  });

  it("makes the sendable figure an exact drain to zero", async () => {
    vi.mocked(getBalance).mockResolvedValue({ context: { slot: 1 }, value: 1_000_000_000 });

    const holding = await readSolHolding(OWNER);
    expect(holding.amount).toBe("1000000000");
    expect(holding.sendable).toBe(String(1_000_000_000 - SOL_TRANSFER_FEE_LAMPORTS));
    expect(holding.decimals).toBe(9);
    expect(holding.tokenProgram).toBeNull();
    expect(holding.rentExemptLamports).toBe(String(RENT_EXEMPT_LAMPORTS));
  });

  it("reports nothing sendable when the balance cannot cover the fee", async () => {
    /* Not negative, and not the balance either. A dust wallet has a balance
       and can still send none of it, and saying so is the honest answer. */
    vi.mocked(getBalance).mockResolvedValue({ context: { slot: 1 }, value: 900 });

    const holding = await readSolHolding(OWNER);
    expect(holding.amount).toBe("900");
    expect(holding.sendable).toBe("0");
  });

  it("reports nothing sendable for an empty wallet", async () => {
    vi.mocked(getBalance).mockResolvedValue({ context: { slot: 1 }, value: 0 });

    const holding = await readSolHolding(OWNER);
    expect(holding.sendable).toBe("0");
  });
});

/* ---------------------------------------------------------------------------
   The rule this whole fix exists for: Solana's runtime rejects a transaction
   outright if it leaves ANY touched account non-zero and short of the
   rent-exempt minimum — not sent-but-owing-rent, refused. This is what
   turned "Send 0.0008 SOL" from a wallet holding 0.001 SOL into
   "[solana-rpc] sendTransaction failed (-32002): ... insufficient funds for
   rent" instead of a completed transfer.
--------------------------------------------------------------------------- */

describe("leavesSendableBalance", () => {
  const holding = (amount: string, rentExemptLamports: string | null) => ({
    mint: "SOL",
    decimals: 9,
    amount,
    sendable: (BigInt(amount) - BigInt(SOL_TRANSFER_FEE_LAMPORTS)).toString(),
    tokenProgram: null,
    rentExemptLamports,
  });

  it("allows a full drain to exactly zero", () => {
    const h = holding("1000000", String(RENT_EXEMPT_LAMPORTS));
    expect(leavesSendableBalance(h, h.sendable)).toBe(true);
  });

  it("allows a partial send that leaves at least the rent-exempt minimum", () => {
    /* A generously funded wallet: sending a small amount still leaves the
       remainder comfortably above the floor. */
    const h = holding("10000000000", String(RENT_EXEMPT_LAMPORTS));
    expect(leavesSendableBalance(h, "1000000000")).toBe(true);
  });

  it("refuses a partial send that leaves dust below the rent-exempt minimum", () => {
    /* The reported failure, reproduced: a 0.001 SOL wallet sending 0.0008
       SOL leaves ~0.0002 SOL behind — non-zero and far short of the ~0.00089
       SOL floor. */
    const h = holding("1000000", String(RENT_EXEMPT_LAMPORTS));
    expect(leavesSendableBalance(h, "800000")).toBe(false);
  });

  it("is not fooled by the old flat-reserve logic this replaced", () => {
    /* The previous implementation held back a flat 15,000 lamports and
       called a send safe if it left that much or less. That reserve is
       itself dust — nowhere near the ~890,880 lamport floor — so the same
       "safe" max-send this file used to produce is exactly the case this
       test pins down as refused. */
    const h = holding("1000000", String(RENT_EXEMPT_LAMPORTS));
    expect(leavesSendableBalance(h, "985000")).toBe(false);
  });

  it("has no opinion on a token holding", () => {
    const h = holding("1000000", null);
    expect(leavesSendableBalance(h, "1")).toBe(true);
  });
});
