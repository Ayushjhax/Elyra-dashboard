/* ---------------------------------------------------------------------------
   A wallet's mark: four tiles drawn from its address.

   Pure, so it is tested directly and the same wallet draws the same mark on
   every render, every reload and every device. The input is the network and
   the full address, character for character — a Solana address is
   case-sensitive, so "E1jG…" and "e1jg…" are different wallets and must not
   share a face.

   Every mark is the same object — a 2×2 of tiles, each rounded at the corner
   it turns toward the centre, so the four together leave a four-pointed star
   between them — and what varies is each tile's tone, the shape of its outer
   corner and the size of the star. That keeps the family recognisable as
   Elyra's while giving tens of thousands of distinct faces. At least one tile
   is light and one dark, so no mark is a flat disc.
--------------------------------------------------------------------------- */

export type IdenticonTone = "cream" | "mist" | "sage" | "moss";
export type IdenticonCorner = "square" | "round" | "cut";

export interface IdenticonTile {
  tone: IdenticonTone;
  /** The tile's outer corner, the one away from the centre. */
  corner: IdenticonCorner;
}

export interface IdenticonPattern {
  /** Top-left, top-right, bottom-right, bottom-left — clockwise. */
  tiles: [IdenticonTile, IdenticonTile, IdenticonTile, IdenticonTile];
  /** The star left between the four rounded inner corners. */
  star: "small" | "large";
}

const TONES: readonly IdenticonTone[] = ["cream", "mist", "sage", "moss"];
const CORNERS: readonly IdenticonCorner[] = ["square", "round", "cut"];

export function isLight(tone: IdenticonTone): boolean {
  return tone === "cream" || tone === "mist";
}

/** 32-bit FNV-1a over the UTF-16 code units, then murmur3's finaliser to spread it. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The mark for `address` on `network` ("solana:mainnet-beta"). */
export function identicon(network: string, address: string): IdenticonPattern {
  const bits = hash32(`${network}:${address}`);

  /* Five bits a tile: two for its tone, three for its corner. */
  const tiles = [0, 1, 2, 3].map((index): IdenticonTile => {
    const chunk = bits >>> (index * 5);
    return { tone: TONES[chunk & 0b11], corner: CORNERS[((chunk >>> 2) & 0b111) % CORNERS.length] };
  }) as IdenticonPattern["tiles"];

  /* No flat discs: one tile, picked from bits the tiles did not use, takes
     the missing side's tone. */
  const pick = (bits >>> 21) & 0b11;
  if (tiles.every((tile) => isLight(tile.tone))) tiles[pick] = { ...tiles[pick], tone: "sage" };
  else if (tiles.every((tile) => !isLight(tile.tone))) tiles[pick] = { ...tiles[pick], tone: "cream" };

  return { tiles, star: (bits >>> 23) & 1 ? "large" : "small" };
}

/** A stable string for a pattern — equal patterns, equal keys. */
export function patternKey(pattern: IdenticonPattern): string {
  return `${pattern.star}:${pattern.tiles.map((tile) => `${tile.tone}-${tile.corner}`).join(",")}`;
}
