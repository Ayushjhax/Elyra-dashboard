import "server-only";

import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { fromBase58, fromBase64, fromHex } from "@mysten/sui/utils";

/* ---------------------------------------------------------------------------
   The Sui wallet's public key, from however Privy spells it.

   Privy signs a raw hash with the embedded Sui wallet and returns the bare
   64-byte Ed25519 signature; a Sui signature also has to carry the public
   key (`flag || sig || pk`). Privy exposes that key on the linked account,
   but does not document its encoding — the tier-2 recipe decodes it as
   base58, other surfaces print hex — so every plausible spelling is tried,
   with or without the scheme flag byte, and only a key that DERIVES TO THE
   SESSION'S ADDRESS is accepted. A wrong key cannot pass: Sui addresses are
   the Blake2b-256 of `0x00 || pk`.
--------------------------------------------------------------------------- */

function candidates(raw: string): Uint8Array[] {
  const text = raw.trim();
  const out: Uint8Array[] = [];
  const attempt = (decode: () => Uint8Array) => {
    try {
      out.push(decode());
    } catch {
      /* not this encoding */
    }
  };
  if (/^(0x)?[0-9a-fA-F]+$/.test(text)) attempt(() => fromHex(text.replace(/^0x/, "")));
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(text)) attempt(() => fromBase64(text));
  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(text)) attempt(() => fromBase58(text));
  return out;
}

/** The key behind `address`, or null when `raw` is not one. */
export function suiPublicKeyFor(raw: string | null | undefined, address: string): Ed25519PublicKey | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const want = address.toLowerCase();
  for (const bytes of candidates(raw)) {
    const key = bytes.length === 33 && bytes[0] === 0 ? bytes.slice(1) : bytes;
    if (key.length !== 32) continue;
    try {
      const publicKey = new Ed25519PublicKey(key);
      if (publicKey.toSuiAddress().toLowerCase() === want) return publicKey;
    } catch {
      /* not a valid key */
    }
  }
  return null;
}
