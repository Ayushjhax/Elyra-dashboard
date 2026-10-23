import { describe, expect, it } from "vitest";
import { addressFromScan, CANCELLED, looksLikeAddress, sendablesFrom, signingFailure } from "@/lib/wallet/flows";
import type { WalletSnapshot } from "@/lib/wallet/types";

const ADDRESS = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

function snapshot(tokens: WalletSnapshot["tokens"]): WalletSnapshot {
  return {
    address: ADDRESS,
    cluster: "mainnet-beta",
    sol: 0.5,
    lamports: 500_000_000,
    solUsd: 150,
    tokens,
    tokenCount: tokens.length,
    usdValue: 75,
    uncounted: { unpriced: 0, unverified: 0 },
    slot: 1,
    fetchedAt: "2026-10-22T00:00:00.000Z",
  };
}

describe("sendablesFrom", () => {
  it("is empty before the first read", () => {
    expect(sendablesFrom(null)).toEqual([]);
  });

  it("puts native SOL first, then held tokens, and names an unresolved mint by its address", () => {
    const list = sendablesFrom(
      snapshot([
        { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin", amount: 2, decimals: 6, usdValue: 2, icon: null, verified: true },
        { mint: "So1idSpam1111111111111111111111111111111111", symbol: null, name: null, amount: 9, decimals: 0, usdValue: null, icon: null, verified: false },
        { mint: "Empty111111111111111111111111111111111111111", symbol: "ZERO", name: null, amount: 0, decimals: 6, usdValue: null, icon: null, verified: true },
      ]),
    );
    expect(list.map((entry) => entry.label)).toEqual(["SOL", "USDC", "So1i…1111"]);
    expect(list[2]?.verified).toBe(false);
  });
});

describe("addressFromScan", () => {
  it("reads a bare address and a Solana Pay URI, and nothing else", () => {
    expect(addressFromScan(` ${ADDRESS} `)).toBe(ADDRESS);
    expect(addressFromScan(`solana:${ADDRESS}?amount=1&label=Shop`)).toBe(ADDRESS);
    expect(addressFromScan("https://getelyra.xyz")).toBeNull();
    expect(addressFromScan("0x52908400098527886E0F7030069857D2E4169EE7")).toBeNull();
  });
});

describe("looksLikeAddress", () => {
  it("accepts base58 of the right length and refuses the rest", () => {
    expect(looksLikeAddress(ADDRESS)).toBe(true);
    expect(looksLikeAddress("0OIl")).toBe(false);
  });
});

describe("signingFailure", () => {
  it("reads a wallet rejection as cancelled, and keeps any other reason", () => {
    expect(signingFailure(new Error("User rejected the request"), "x")).toBe(CANCELLED);
    expect(signingFailure(new Error("Blockhash not found"), "x")).toBe("Blockhash not found");
    expect(signingFailure(undefined, "The swap could not be completed.")).toBe("The swap could not be completed.");
  });
});
