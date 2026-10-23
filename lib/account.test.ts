import { describe, expect, it } from "vitest";
import { accountKey, summariseUser, toIso } from "@/lib/account";

/* The same Privy user, in the website SDK's shape and in the Expo SDK's. */
const SOL = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const EVM = "0x8f3c2a91b7d4e6f0a1c2b3d4e5f60718293a4b5c";

const web = {
  id: "did:privy:abc",
  createdAt: new Date("2026-09-02T10:00:00Z"),
  linkedAccounts: [
    { type: "email", address: "a@example.com", latestVerifiedAt: new Date("2026-10-16T09:00:00Z"), verifiedAt: new Date("2026-09-02T10:00:00Z") },
    { type: "wallet", address: SOL, chainType: "solana", walletClientType: "privy", latestVerifiedAt: null, verifiedAt: new Date("2026-09-02T10:00:00Z") },
    { type: "wallet", address: EVM, chainType: "ethereum", walletClientType: "metamask", latestVerifiedAt: null, verifiedAt: null },
  ],
};

const expo = {
  id: "did:privy:abc",
  created_at: 1788343200,
  linked_accounts: [
    { type: "email", address: "a@example.com", latest_verified_at: 1792141200, verified_at: 1788343200 },
    { type: "wallet", address: SOL, chain_type: "solana", wallet_client_type: "privy", latest_verified_at: null, verified_at: 1788343200 },
    { type: "wallet", address: EVM, chain_type: "ethereum", wallet_client_type: "metamask", latest_verified_at: null, verified_at: null },
  ],
};

describe("summariseUser", () => {
  it("reads both SDK shapes identically", () => {
    expect(summariseUser(expo)).toEqual(summariseUser(web));
  });

  it("picks each chain's wallet explicitly, and the latest login as the method", () => {
    const summary = summariseUser(expo);
    expect(summary.solanaAddress).toBe(SOL);
    expect(summary.walletAddress).toBe(EVM);
    expect(summary.account.loginMethod?.type).toBe("email");
    expect(summary.account.solanaIsEmbedded).toBe(true);
    expect(summary.account.createdAt).toBe("2026-09-02T10:00:00.000Z");
  });

  it("does not call an external Solana wallet embedded", () => {
    const external = {
      id: "did:privy:x",
      linked_accounts: [{ type: "wallet", address: SOL, chain_type: "solana", wallet_client_type: "phantom" }],
    };
    expect(summariseUser(external).account.solanaIsEmbedded).toBe(false);
  });
});

describe("toIso", () => {
  it("reads seconds, milliseconds, Dates and ISO strings — and nothing else", () => {
    expect(toIso(1788343200)).toBe("2026-09-02T10:00:00.000Z");
    expect(toIso(1788343200000)).toBe("2026-09-02T10:00:00.000Z");
    expect(toIso(new Date("2026-09-02T10:00:00Z"))).toBe("2026-09-02T10:00:00.000Z");
    expect(toIso("2026-09-02T10:00:00Z")).toBe("2026-09-02T10:00:00.000Z");
    expect(toIso(null)).toBeNull();
    expect(toIso("soon")).toBeNull();
  });
});

describe("accountKey", () => {
  it("is null until ready and signed in", () => {
    expect(accountKey({ ready: false, authenticated: true, account: { id: "x" }, solanaAddress: null })).toBeNull();
    expect(accountKey({ ready: true, authenticated: false, account: null, solanaAddress: null })).toBeNull();
    expect(accountKey({ ready: true, authenticated: true, account: { id: "did:1" }, solanaAddress: SOL })).toBe("did:1");
  });
});
