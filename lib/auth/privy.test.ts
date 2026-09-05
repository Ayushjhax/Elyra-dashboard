import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeVerificationKey } from "./privy";

/* ---------------------------------------------------------------------------
   These pin an actual outage rather than a hypothetical one.

   PRIVY_VERIFICATION_KEY was stored as unpadded, unarmoured base64. The bytes
   were a perfectly valid P-256 SPKI, so nothing about the value looked wrong,
   but `createPublicKey` rejected it — which made `verifyAccessToken` throw for
   every token, which made `getSessionUser` return null, which told every
   signed-in user they were "Not signed in".

   Three layers each did something reasonable and the result was a total,
   silent authentication failure with no error anywhere.
--------------------------------------------------------------------------- */

/**
 * A real P-256 public key, exported the way the outage had it stored:
 * base64 SPKI with no PEM armour and no padding.
 *
 * Generated rather than hardcoded so these tests run against genuine key
 * bytes. An invented constant is what hid the bug the first time — the string
 * I wrote by hand happened to be a multiple of four, so it could not
 * reproduce the padding defect it was written to pin.
 */
const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const SPKI_DER = publicKey.export({ type: "spki", format: "der" });
const UNPADDED_SPKI = SPKI_DER.toString("base64").replace(/=+$/, "");

function parses(pem: string | undefined): boolean {
  if (pem === undefined) return false;
  try {
    createPublicKey(pem);
    return true;
  } catch {
    return false;
  }
}

describe("normalizeVerificationKey", () => {
  it("reproduces the outage: the stored form does not parse", () => {
    /* 91 bytes of P-256 SPKI is 122 unpadded base64 characters. PEM needs a
       multiple of four. The two missing '=' were the entire outage, and
       nothing about the value looked wrong. */
    expect(SPKI_DER.length).toBe(91);
    expect(UNPADDED_SPKI.length).toBe(122);
    expect(UNPADDED_SPKI.length % 4).not.toBe(0);
    expect(parses(UNPADDED_SPKI)).toBe(false);
  });

  it("pads and re-armours it into a key crypto accepts", () => {
    const pem = normalizeVerificationKey(UNPADDED_SPKI);
    expect(parses(pem)).toBe(true);

    const b64 = pem!.split("\n").slice(1, -1).join("");
    expect(b64.length % 4).toBe(0);
    expect(pem!.startsWith("-----BEGIN PUBLIC KEY-----")).toBe(true);
    expect(pem!.trimEnd().endsWith("-----END PUBLIC KEY-----")).toBe(true);
  });

  it("round-trips to the same key, not merely to something parseable", () => {
    /* Padding a corrupted body could produce bytes that parse and are the
       WRONG key, which would fail verification just as totally and look
       fixed. This asserts the key that comes out is the key that went in. */
    const pem = normalizeVerificationKey(UNPADDED_SPKI)!;
    const recovered = createPublicKey(pem).export({ type: "spki", format: "der" });
    expect(Buffer.from(recovered).equals(SPKI_DER)).toBe(true);
  });

  it("wraps at 64 columns, which PEM requires", () => {
    const pem = normalizeVerificationKey(UNPADDED_SPKI)!;
    for (const line of pem.split("\n").slice(1, -1)) {
      expect(line.length).toBeLessThanOrEqual(64);
    }
  });

  it("leaves an already-armoured key alone", () => {
    const pem = normalizeVerificationKey(UNPADDED_SPKI)!;
    expect(normalizeVerificationKey(pem)).toBe(pem);
  });

  it("un-escapes newlines written into a .env file", () => {
    const escaped = normalizeVerificationKey(UNPADDED_SPKI)!.replace(/\n/g, "\\n");
    expect(normalizeVerificationKey(escaped)).not.toContain("\\n");
  });

  it("strips surrounding quotes", () => {
    expect(normalizeVerificationKey(`"${UNPADDED_SPKI}"`)).toBe(
      normalizeVerificationKey(UNPADDED_SPKI),
    );
  });

  it("discards something that is not base64 at all", () => {
    /* Discarded rather than passed through: the key is a latency
       optimisation, and the SDK falls back to JWKS without it. A bad key
       must never be able to take authentication down, which is exactly
       what happened. */
    expect(normalizeVerificationKey("not a key!!")).toBeUndefined();
    expect(normalizeVerificationKey("")).toBeUndefined();
    expect(normalizeVerificationKey(undefined)).toBeUndefined();
  });

  it("rejects a length that cannot be valid base64", () => {
    /* A remainder of 3 means a character was lost, not padding. Padding it
       would produce plausible-looking bytes that are not the key. */
    expect(normalizeVerificationKey("A".repeat(121))).toBeUndefined();
  });
});
