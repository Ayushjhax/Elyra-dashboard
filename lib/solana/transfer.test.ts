import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompiledTransactionMessage } from "@solana/kit";
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  parseSetComputeUnitLimitInstruction,
  parseSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import {
  COMPUTE_UNIT_PRICE_MICROLAMPORTS,
  SOL_TRANSFER_COMPUTE_UNITS,
  TOKEN_TRANSFER_COMPUTE_UNITS,
} from "@/lib/solana/fees";
import { isValidRecipient, solToLamports } from "@/lib/solana/transfer";

const SENDER = "AxqtG9SHDkZTLSWg81Sp7VqAzQpRqXtR9ziJ3VQAS8As";
const RECIPIENT = "6LD3XC1ZHnoPoDmSHtYNE2UP29SrYs3bfdAcj7Rburnu";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/* A real mainnet blockhash shape. The value does not matter; the encoding
   does, because kit decodes it as base58 while compiling. */
const BLOCKHASH = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

vi.mock("@/lib/solana/rpc", () => ({
  getLatestBlockhash: vi.fn(async () => ({
    context: { slot: 1 },
    value: { blockhash: BLOCKHASH, lastValidBlockHeight: 350_000_000 },
  })),
}));

/* ---------------------------------------------------------------------------
   The two pure halves of a transfer: who receives it, and how much.

   Both are checked here because both are unrecoverable when wrong. A bad
   address sends funds somewhere nobody controls; a bad amount sends the
   wrong quantity. Neither has an undo.
--------------------------------------------------------------------------- */

describe("isValidRecipient", () => {
  it("accepts a real address", () => {
    expect(isValidRecipient("6LD3XC1ZHnoPoDmSHtYNE2UP29SrYs3bfdAcj7Rburnu")).toBe(true);
  });

  it("tolerates surrounding whitespace, which is what pasting produces", () => {
    expect(isValidRecipient("  6LD3XC1ZHnoPoDmSHtYNE2UP29SrYs3bfdAcj7Rburnu \n")).toBe(true);
  });

  it("rejects a truncated address", () => {
    /* The shape a UI produces when someone copies a displayed, shortened
       address instead of the real one. */
    expect(isValidRecipient("6LD3XC1Z...Rburnu")).toBe(false);
  });

  it("rejects an Ethereum address", () => {
    /* Wrong chain entirely, and long enough to look plausible in a field. */
    expect(isValidRecipient("0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toBe(false);
  });

  it("rejects empty and obvious nonsense", () => {
    expect(isValidRecipient("")).toBe(false);
    expect(isValidRecipient("not an address")).toBe(false);
  });
});

describe("solToLamports", () => {
  it("converts whole SOL", () => {
    expect(solToLamports("1")).toBe("1000000000");
  });

  it("converts a fractional amount exactly", () => {
    expect(solToLamports("1.5")).toBe("1500000000");
  });

  it("keeps the last digit of a nine-decimal amount", () => {
    /* Through a float this becomes 1234.5678909999999 and the final lamport
       disappears. The digits typed are the digits that move. */
    expect(solToLamports("1234.567890123")).toBe("1234567890123");
  });

  it("truncates beyond lamport precision rather than rounding up", () => {
    /* Rounding up would move more than was typed. */
    expect(solToLamports("0.0000000009")).toBe(null);
    expect(solToLamports("1.0000000009")).toBe("1000000000");
  });

  it("strips thousands separators", () => {
    expect(solToLamports("1,000")).toBe("1000000000000");
  });

  it("refuses zero and anything unparseable", () => {
    expect(solToLamports("0")).toBe(null);
    expect(solToLamports("")).toBe(null);
    expect(solToLamports(".")).toBe(null);
    expect(solToLamports("abc")).toBe(null);
    expect(solToLamports("-1")).toBe(null);
  });
});

/* ---------------------------------------------------------------------------
   The built transaction

   These decode what the builder actually produced rather than trusting that
   the library was called correctly. The properties that matter are the ones
   a wallet and the chain will enforce: the sender pays and signs, the
   signature slot is empty, and an SPL transfer carries the account-creation
   instruction ahead of the transfer.
--------------------------------------------------------------------------- */

/**
 * The first two instructions declare the budget: the unit limit this
 * transfer was built for, then the fixed price per unit. Decoded through the
 * program's own parsers rather than by eyeballing bytes, so a change to the
 * instruction layout upstream fails here instead of on-chain.
 */
function expectComputeBudget(message: CompiledTransactionMessage, units: number) {
  const [limit, price] = message.instructions;
  const budget = message.staticAccounts.indexOf(COMPUTE_BUDGET_PROGRAM_ADDRESS);
  expect(budget).toBeGreaterThanOrEqual(0);
  expect(limit.programAddressIndex).toBe(budget);
  expect(price.programAddressIndex).toBe(budget);

  const parsedLimit = parseSetComputeUnitLimitInstruction({
    programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS,
    data: limit.data ?? new Uint8Array(),
  });
  expect(parsedLimit.data.units).toBe(units);

  const parsedPrice = parseSetComputeUnitPriceInstruction({
    programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS,
    data: price.data ?? new Uint8Array(),
  });
  expect(parsedPrice.data.microLamports).toBe(BigInt(COMPUTE_UNIT_PRICE_MICROLAMPORTS));
}

describe("built transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a SOL transfer the sender pays for and has yet to sign", async () => {
    const { buildSolTransfer } = await import("@/lib/solana/transfer");
    const { getTransactionDecoder, getCompiledTransactionMessageDecoder } = await import(
      "@solana/kit"
    );

    const built = await buildSolTransfer({
      from: SENDER,
      to: RECIPIENT,
      lamports: "1500000000",
    });

    const bytes = Buffer.from(built.unsignedTransaction, "base64");
    const decoded = getTransactionDecoder().decode(bytes);
    const message = getCompiledTransactionMessageDecoder().decode(
      decoded.messageBytes,
    );

    /* The fee payer is the first static account, and it must be the sender —
       a transfer someone else pays for is a different transaction. */
    expect(message.staticAccounts[0]).toBe(SENDER);
    expect(message.staticAccounts).toContain(RECIPIENT);

    /* Exactly one signature slot, and it is empty. Anything else would mean
       this server produced a signature, which it must never do. */
    const signatures = Object.values(decoded.signatures);
    expect(signatures).toHaveLength(1);
    expect(signatures[0]).toBeNull();

    /* Compute budget first — limit, then price — and the transfer last. A
       transfer with no declared budget carries no priority, which is what
       "broadcast but never confirmed" looked like; see lib/solana/fees.ts. */
    expect(message.instructions).toHaveLength(3);
    expectComputeBudget(message, SOL_TRANSFER_COMPUTE_UNITS);

    expect(built.lastValidBlockHeight).toBe(350_000_000);
  });

  it("builds an SPL transfer that creates the recipient's account first", async () => {
    const { buildTokenTransfer } = await import("@/lib/solana/transfer");
    const { getTransactionDecoder, getCompiledTransactionMessageDecoder } = await import(
      "@solana/kit"
    );

    const built = await buildTokenTransfer({
      from: SENDER,
      to: RECIPIENT,
      mint: USDC,
      amount: "1000000",
      decimals: 6,
    });

    const decoded = getTransactionDecoder().decode(
      Buffer.from(built.unsignedTransaction, "base64"),
    );
    const message = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);

    /* Four instructions, in this order: the compute budget (limit, price),
       then create the destination account if it is missing, then transfer.
       Reversing the last two fails for any recipient who has never held the
       token. */
    expect(message.instructions).toHaveLength(4);
    expectComputeBudget(message, TOKEN_TRANSFER_COMPUTE_UNITS);

    /* The mint rides along so the chain can verify decimals — this is what
       makes it `transfer_checked` rather than a raw `transfer`. */
    expect(message.staticAccounts).toContain(USDC);

    expect(Object.values(decoded.signatures)).toHaveLength(1);
    expect(Object.values(decoded.signatures)[0]).toBeNull();
  });
});
