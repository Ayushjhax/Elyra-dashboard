import { describe, expect, it } from "vitest";
import { hash32, identicon, isLight, patternKey } from "@/lib/identicon";

const MAINNET = "solana:mainnet-beta";
const ADDRESS = "E1jGq7X4m9W2kGb5Hc3Zr8LpTn6Yd1VsQe2Rf4Ua9GkhU";

/** A deterministic run of address-shaped strings. */
function addresses(count: number): string[] {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let seed = 42;
  return Array.from({ length: count }, () => {
    let out = "";
    for (let i = 0; i < 44; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      out += alphabet[seed % alphabet.length];
    }
    return out;
  });
}

describe("identicon", () => {
  it("draws the same mark for the same wallet, every time", () => {
    expect(identicon(MAINNET, ADDRESS)).toEqual(identicon(MAINNET, ADDRESS));
    expect(patternKey(identicon(MAINNET, ADDRESS))).toBe(patternKey(identicon(MAINNET, ADDRESS)));
  });

  it("reads the address case-sensitively, as Solana does", () => {
    expect(hash32(`${MAINNET}:${ADDRESS}`)).not.toBe(hash32(`${MAINNET}:${ADDRESS.toLowerCase()}`));
    expect(patternKey(identicon(MAINNET, ADDRESS))).not.toBe(patternKey(identicon(MAINNET, ADDRESS.toLowerCase())));
  });

  it("gives the same address a different mark on another network", () => {
    expect(patternKey(identicon(MAINNET, ADDRESS))).not.toBe(patternKey(identicon("solana:devnet", ADDRESS)));
  });

  it("tells wallets apart", () => {
    const keys = new Set(addresses(2000).map((address) => patternKey(identicon(MAINNET, address))));
    /* Twenty thousand faces for two thousand wallets: a few collisions are
       expected, a pile of them would mean the bits are not spreading. */
    expect(keys.size).toBeGreaterThan(1850);
  });

  it("never draws a flat disc — every mark has a light tile and a dark one", () => {
    for (const address of addresses(2000)) {
      const { tiles } = identicon(MAINNET, address);
      expect(tiles.some((tile) => isLight(tile.tone)), address).toBe(true);
      expect(tiles.some((tile) => !isLight(tile.tone)), address).toBe(true);
    }
  });

  it("uses every tone and corner shape across wallets", () => {
    const tones = new Set<string>();
    const corners = new Set<string>();
    for (const address of addresses(200)) {
      for (const tile of identicon(MAINNET, address).tiles) {
        tones.add(tile.tone);
        corners.add(tile.corner);
      }
    }
    expect([...tones].sort()).toEqual(["cream", "mist", "moss", "sage"]);
    expect([...corners].sort()).toEqual(["cut", "round", "square"]);
  });
});
