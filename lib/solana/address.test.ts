import { describe, expect, it } from "vitest";
import { clusterOf, EXPECTED_CLUSTER, GENESIS_HASH } from "./cluster";
import { isSolanaAddress, isSolanaSignature, truncateAddress } from "./address";

/* Real mainnet values, not invented ones. The two addresses are the SPL Token
   and Token-2022 program ids, which are fixed by the protocol and are the
   same strings this app sends in every getTokenAccountsByOwner call. */
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

describe("isSolanaAddress", () => {
  it("accepts real mainnet addresses", () => {
    expect(isSolanaAddress(TOKEN_PROGRAM)).toBe(true);
    expect(isSolanaAddress(USDC_MINT)).toBe(true);
  });

  it("accepts a short address produced by leading zero bytes", () => {
    /* The system program is 32 zero bytes, which base58 encodes as a run of
       '1's — far shorter than the usual 44 characters. A fixed-width check
       would reject it, which is why the check is a range. */
    expect(isSolanaAddress("11111111111111111111111111111111")).toBe(true);
  });

  it("rejects the base58 characters that exist to prevent misreading", () => {
    /* 0, O, I and l are excluded from the alphabet precisely because they
       are confusable, so a string containing one was mistyped. */
    for (const bad of ["0", "O", "I", "l"]) {
      expect(isSolanaAddress(USDC_MINT.slice(0, 43) + bad)).toBe(false);
    }
  });

  it("rejects an EVM address", () => {
    /* The likeliest wrong value to arrive here, since accounts carry both. */
    expect(isSolanaAddress("0x71C7656EC7ab88b098defB751B7401B5f6d8976F")).toBe(false);
  });

  it("rejects strings outside the length range", () => {
    expect(isSolanaAddress("")).toBe(false);
    expect(isSolanaAddress("abc")).toBe(false);
    expect(isSolanaAddress("1".repeat(45))).toBe(false);
  });
});

describe("isSolanaSignature", () => {
  it("separates a signature from an address by length", () => {
    /* 64 bytes rather than 32, so the encoded form is roughly twice as long.
       An address must not pass as a signature. */
    expect(isSolanaSignature(USDC_MINT)).toBe(false);
    expect(isSolanaSignature("1".repeat(64))).toBe(true);
  });
});

describe("truncateAddress", () => {
  it("keeps both ends, which is what makes an address recognisable", () => {
    expect(truncateAddress(USDC_MINT)).toBe("EPjF…Dt1v");
  });

  it("uses one ellipsis character, not three periods", () => {
    /* So it cannot be mistaken for part of the address when copied out of
       a screenshot. */
    expect(truncateAddress(USDC_MINT)).toContain("…");
    expect(truncateAddress(USDC_MINT)).not.toContain("...");
  });

  it("leaves a string too short to truncate alone", () => {
    expect(truncateAddress("abcdef")).toBe("abcdef");
  });
});

describe("clusterOf", () => {
  /* These hashes were read from api.mainnet-beta, api.devnet and api.testnet
     rather than recalled. A wrong constant here would render a devnet balance
     as real money under a label saying mainnet, which is the single worst
     thing this dashboard could do. */
  it("names each cluster from its genesis hash", () => {
    expect(clusterOf(GENESIS_HASH["mainnet-beta"])).toBe("mainnet-beta");
    expect(clusterOf(GENESIS_HASH.devnet)).toBe("devnet");
    expect(clusterOf(GENESIS_HASH.testnet)).toBe("testnet");
  });

  it("calls anything else unknown rather than assuming mainnet", () => {
    /* A local validator or a fork. Not mainnet, and the UI must warn. */
    expect(clusterOf("11111111111111111111111111111111")).toBe("unknown");
    expect(clusterOf("")).toBe("unknown");
  });

  it("expects mainnet, and the three hashes are distinct", () => {
    expect(EXPECTED_CLUSTER).toBe("mainnet-beta");
    expect(new Set(Object.values(GENESIS_HASH)).size).toBe(3);
  });
});
