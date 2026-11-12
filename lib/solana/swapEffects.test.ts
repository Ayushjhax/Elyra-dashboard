import { describe, expect, it } from "vitest";
import { getAddressEncoder } from "@solana/kit";
import {
  decodeTokenAccount,
  judgeSwapEffects,
  decodeLookupTable,
  SOL_HEADROOM_LAMPORTS,
  SYSTEM_PROGRAM,
  WSOL_MINT,
  type TokenAccountView,
} from "@/lib/solana/swapEffects";

/* ---------------------------------------------------------------------------
   The swap guard's rules: a simulated swap may only exchange what was asked.
   Each refusal below is a shape a tampered route could take.
--------------------------------------------------------------------------- */

const OWNER = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const STRANGER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

const encoder = getAddressEncoder();

/** A 165-byte SPL token account, as the chain stores it. */
function rawAccount(view: Omit<TokenAccountView, "address">): Uint8Array {
  const bytes = new Uint8Array(165);
  bytes.set(encoder.encode(view.mint as never), 0);
  bytes.set(encoder.encode(view.owner as never), 32);
  let amount = view.amount;
  for (let index = 0; index < 8; index += 1) {
    bytes[64 + index] = Number(amount & BigInt(0xff));
    amount >>= BigInt(8);
  }
  if (view.delegate !== null) {
    bytes[72] = 1;
    bytes.set(encoder.encode(view.delegate as never), 76);
  }
  bytes[108] = 1;
  if (view.closeAuthority !== null) {
    bytes[129] = 1;
    bytes.set(encoder.encode(view.closeAuthority as never), 133);
  }
  return bytes;
}

const account = (address: string, mint: string, amount: number, over: Partial<TokenAccountView> = {}): TokenAccountView => ({
  address,
  mint,
  owner: OWNER,
  amount: BigInt(amount),
  delegate: null,
  closeAuthority: null,
  ...over,
});

const LAMPORTS = BigInt(2_000_000_000);
const usdcBefore = account("UsdcAccount1111111111111111111111111111111", USDC, 500_000_000);
const jupBefore = account("JupAccount11111111111111111111111111111111", JUP, 9_000_000);

function judge(
  sell: { mint: string; amount: number },
  after: Array<[TokenAccountView, TokenAccountView | null]>,
  lamportsAfter: bigint | null = LAMPORTS - BigInt(10_000),
) {
  return judgeSwapEffects({
    owner: OWNER,
    sellMint: sell.mint,
    sellAmount: BigInt(sell.amount),
    pre: { lamports: LAMPORTS, accounts: after.map(([before]) => before) },
    post: { lamports: lamportsAfter, program: SYSTEM_PROGRAM, accounts: new Map(after.map(([before, next]) => [before.address, next])) },
    label: (mint) => (mint === USDC ? "USDC" : mint === JUP ? "JUP" : "SOL"),
  });
}

describe("decodeTokenAccount", () => {
  it("reads mint, owner, amount, delegate and close authority from the account's bytes", () => {
    const view = account("Acc1111111111111111111111111111111111111111", USDC, 1_234_567, { delegate: STRANGER, closeAuthority: STRANGER });
    expect(decodeTokenAccount(view.address, rawAccount(view))).toEqual(view);
    expect(decodeTokenAccount(view.address, new Uint8Array(100))).toBeNull();
  });
});

describe("decodeLookupTable", () => {
  it("reads the addresses after the 56-byte header, in index order", () => {
    const data = new Uint8Array(56 + 64);
    data.set(encoder.encode(USDC as never), 56);
    data.set(encoder.encode(JUP as never), 88);
    expect(decodeLookupTable(data)).toEqual([USDC, JUP]);
  });
});

describe("judgeSwapEffects", () => {
  it("passes a swap that sells what was asked and pays only fees in SOL", () => {
    expect(
      judge({ mint: USDC, amount: 100_000_000 }, [
        [usdcBefore, { ...usdcBefore, amount: BigInt(400_000_000) }],
        [jupBefore, { ...jupBefore, amount: BigInt(12_000_000) }],
      ]),
    ).toEqual({ ok: true });
  });

  it("passes a sale of SOL within the amount plus fees", () => {
    expect(judge({ mint: WSOL_MINT, amount: 1_000_000_000 }, [[usdcBefore, { ...usdcBefore, amount: BigInt(650_000_000) }]], LAMPORTS - BigInt(1_005_000_000))).toEqual({
      ok: true,
    });
  });

  it("refuses a swap that also takes a token that was not sold", () => {
    const verdict = judge({ mint: USDC, amount: 100_000_000 }, [
      [usdcBefore, { ...usdcBefore, amount: BigInt(400_000_000) }],
      [jupBefore, { ...jupBefore, amount: BigInt(0) }],
    ]);
    expect(verdict).toMatchObject({ ok: false, error: expect.stringMatching(/would take JUP/) });
  });

  it("refuses a swap that takes more of the sold token than asked", () => {
    expect(judge({ mint: USDC, amount: 100_000_000 }, [[usdcBefore, { ...usdcBefore, amount: BigInt(0) }]])).toMatchObject({
      ok: false,
      error: expect.stringMatching(/more USDC than/),
    });
  });

  it("refuses a delegate, a new owner or a new close authority — a drain that waits", () => {
    const sell = { mint: USDC, amount: 100_000_000 };
    expect(judge(sell, [[jupBefore, { ...jupBefore, delegate: STRANGER }]])).toMatchObject({ ok: false, error: expect.stringMatching(/spend your JUP/) });
    expect(judge(sell, [[jupBefore, { ...jupBefore, owner: STRANGER }]])).toMatchObject({ ok: false, error: expect.stringMatching(/another owner/) });
    expect(judge(sell, [[jupBefore, { ...jupBefore, closeAuthority: STRANGER }]])).toMatchObject({ ok: false, error: expect.stringMatching(/close your JUP/) });
  });

  it("refuses SOL leaving beyond fees when SOL was not sold", () => {
    const lamportsAfter = LAMPORTS - SOL_HEADROOM_LAMPORTS - BigInt(1);
    expect(judge({ mint: USDC, amount: 100_000_000 }, [[usdcBefore, { ...usdcBefore, amount: BigInt(400_000_000) }]], lamportsAfter)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/SOL beyond network fees/),
    });
  });

  it("counts a closed wrapped-SOL account as SOL out, and refuses closing an account that holds a balance", () => {
    const wsol = account("WsolAccount1111111111111111111111111111111", WSOL_MINT, 3_000_000_000);
    expect(judge({ mint: USDC, amount: 1 }, [[wsol, null]], LAMPORTS)).toMatchObject({ ok: false });
    expect(judge({ mint: USDC, amount: 1 }, [[jupBefore, null]])).toMatchObject({ ok: false, error: expect.stringMatching(/close your JUP account/) });
  });

  it("refuses when the wallet itself cannot be read after simulation", () => {
    expect(judge({ mint: USDC, amount: 1 }, [], null)).toMatchObject({ ok: false });
  });

  it("refuses a swap that hands the wallet itself to a program", () => {
    expect(
      judgeSwapEffects({
        owner: OWNER,
        sellMint: USDC,
        sellAmount: BigInt(1),
        pre: { lamports: LAMPORTS, accounts: [] },
        post: { lamports: LAMPORTS, program: STRANGER, accounts: new Map() },
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/control of your wallet/) });
  });
});
