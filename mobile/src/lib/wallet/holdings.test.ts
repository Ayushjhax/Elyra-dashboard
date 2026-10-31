import type { TokenBalance, WalletSnapshot } from "@/lib/wallet/types";
import { excludedLine, holdingsOf } from "~/lib/wallet/holdings";

const token = (mint: string, verified: boolean, usdValue: number | null): TokenBalance => ({
  mint,
  symbol: verified ? mint.toUpperCase() : null,
  name: null,
  amount: 1,
  decimals: 6,
  usdValue,
  icon: null,
  verified,
});

const snapshot = (tokens: TokenBalance[], sol = 0.5): WalletSnapshot => ({
  address: "addr",
  cluster: "mainnet-beta",
  sol,
  lamports: sol * 1e9,
  solUsd: 100,
  tokens,
  tokenCount: tokens.length,
  usdValue: 50,
  uncounted: { unpriced: 0, unverified: 0 },
  slot: 1,
  fetchedAt: "2026-11-01T00:00:00Z",
});

describe("wallet holdings", () => {
  it("lists verified tokens under assets, priced or not, and unverified mints apart", () => {
    const read = holdingsOf(snapshot([token("usdc", true, 10), token("bonk", true, null), token("fake", false, null)]));
    expect(read.verified.map((entry) => entry.mint)).toEqual(["usdc", "bonk"]);
    expect(read.unverified.map((entry) => entry.mint)).toEqual(["fake"]);
    expect(read.held).toBe(4);
  });

  it("does not count native SOL as a holding at zero", () => {
    expect(holdingsOf(snapshot([], 0)).held).toBe(0);
  });

  it("names what the total leaves out by kind, never calling an unpriced token unverified", () => {
    expect(excludedLine({ unverified: 0, unpriced: 0 })).toBeNull();
    expect(excludedLine({ unverified: 3, unpriced: 0 })).toBe("3 unverified holdings excluded from total balance.");
    expect(excludedLine({ unverified: 1, unpriced: 0 })).toBe("1 unverified holding excluded from total balance.");
    expect(excludedLine({ unverified: 0, unpriced: 1 })).toBe("1 holding with no price excluded from total balance.");
    expect(excludedLine({ unverified: 2, unpriced: 1 })).toBe("3 holdings excluded from total balance — 2 unverified, 1 with no price.");
  });
});
