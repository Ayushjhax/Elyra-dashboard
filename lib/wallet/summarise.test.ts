import { describe, expect, it } from "vitest";
import { formatAmount, summarise, type HeliusTransaction } from "@/lib/wallet/summarise";

const ME = "Me1111111111111111111111111111111111111111";
const THEM = "Them111111111111111111111111111111111111111";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL = "So11111111111111111111111111111111111111112";
const SPAM = "Spam111111111111111111111111111111111111111";
const tokens = new Map([[USDC, { symbol: "USDC", icon: "https://icons/usdc.png" }]]);

const tx = (overrides: Partial<HeliusTransaction>): HeliusTransaction => ({
  signature: "sig",
  type: "TRANSFER",
  source: "SYSTEM_PROGRAM",
  fee: 5_000,
  feePayer: ME,
  ...overrides,
});

describe("summarise", () => {
  it("nets a Jupiter swap to one asset out and one in, wrapped SOL counted as SOL", () => {
    const summary = summarise(
      tx({
        type: "SWAP",
        source: "JUPITER",
        accountData: [
          /* 2 SOL wrapped and spent, rent for the temporary account refunded. */
          { account: ME, nativeBalanceChange: -2_000_005_000, tokenBalanceChanges: [] },
          {
            account: "ata",
            nativeBalanceChange: 0,
            tokenBalanceChanges: [
              { userAccount: ME, mint: USDC, rawTokenAmount: { tokenAmount: "290410000", decimals: 6 } },
              /* A routing hop that nets to nothing. */
              { userAccount: ME, mint: WSOL, rawTokenAmount: { tokenAmount: "0", decimals: 9 } },
            ],
          },
        ],
      }),
      ME,
      tokens,
    )!;
    expect(summary.kind).toBe("swap");
    expect(summary.title).toBe("Swapped 2 SOL for 290.41 USDC");
    expect(summary.via).toBe("Jupiter");
    expect(summary.feeSol).toBeCloseTo(0.000005, 9);
  });

  it("names the recipient of a send, with the fee added back", () => {
    const summary = summarise(
      tx({
        accountData: [{ account: ME, nativeBalanceChange: -1_000_005_000 }],
        nativeTransfers: [{ fromUserAccount: ME, toUserAccount: THEM, amount: 1_000_000_000 }],
      }),
      ME,
      tokens,
    )!;
    expect(summary.title).toBe("Sent 1 SOL to Them…1111");
    expect(summary.counterparty).toBe(THEM);
    expect(summary.amounts[0].amount).toBeCloseTo(-1, 9);
  });

  it("never repeats an unverified token's claimed name", () => {
    const summary = summarise(
      tx({
        feePayer: THEM,
        accountData: [
          { account: "ata", tokenBalanceChanges: [{ userAccount: ME, mint: SPAM, rawTokenAmount: { tokenAmount: "1000", decimals: 0 } }] },
        ],
        tokenTransfers: [{ fromUserAccount: THEM, toUserAccount: ME, mint: SPAM, tokenAmount: 1000 }],
      }),
      ME,
      tokens,
    )!;
    expect(summary).toMatchObject({ kind: "receive", title: "Received an unverified token", unverifiedOnly: true, feeSol: null });
  });

  it("names a transaction that moved nothing by what it was", () => {
    expect(summarise(tx({ type: "CLOSE_ACCOUNT", accountData: [{ account: ME, nativeBalanceChange: -5_000 }] }), ME, tokens)!.title).toBe(
      "Closed a token account",
    );
    expect(summarise(tx({ type: "UNKNOWN", source: "UNKNOWN", accountData: [] }), ME, tokens)!.title).toBe("Program interaction");
  });
});

describe("formatAmount", () => {
  it("reads at a glance across magnitudes", () => {
    expect(formatAmount(1711467.95)).toBe("1.71M");
    expect(formatAmount(12_345.6)).toBe("12,346");
    expect(formatAmount(1.23456)).toBe("1.2346");
    expect(formatAmount(0.0000421)).toBe("0.0000421");
  });
});
