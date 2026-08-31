import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

/* A real 32-byte key, set before the module reads it. The suite must not
   depend on whatever happens to be in the developer's .env.local. */
beforeAll(() => {
  process.env.CREDENTIALS_ENC_KEY = randomBytes(32).toString("base64");
});

const { CredentialCryptoError, decryptSecret, encryptSecret, lastFour, safeEqual } =
  await import("@/lib/crypto/credentials");

describe("credential envelope", () => {
  it("round-trips a secret", () => {
    const secret = "kQ8f2vNp7wLxR3mZ9tYbC5dHjA6sE1gU";
    expect(decryptSecret(encryptSecret(secret, "api_secret"), "api_secret")).toBe(
      secret,
    );
  });

  it("produces a different envelope each time for the same input", () => {
    /* A fresh IV per encryption. Equal envelopes would mean a reused IV,
       which is a break of GCM, not a cosmetic issue. */
    const a = encryptSecret("same-value", "api_key");
    const b = encryptSecret("same-value", "api_key");
    expect(a).not.toBe(b);
    expect(decryptSecret(a, "api_key")).toBe(decryptSecret(b, "api_key"));
  });

  it("refuses a value written for a different field", () => {
    /* The swap this AAD binding exists to stop: an api_key envelope moved
       into the api_secret column would otherwise decrypt cleanly. */
    const envelope = encryptSecret("abc123", "api_key");
    expect(() => decryptSecret(envelope, "api_secret")).toThrow(
      CredentialCryptoError,
    );
  });

  it("refuses a tampered ciphertext", () => {
    const envelope = encryptSecret("abc123", "passphrase");
    const raw = Buffer.from(envelope, "base64");
    raw[raw.length - 1] ^= 0xff;
    expect(() => decryptSecret(raw.toString("base64"), "passphrase")).toThrow(
      CredentialCryptoError,
    );
  });

  it("refuses a truncated envelope", () => {
    expect(() => decryptSecret("AAAA", "api_key")).toThrow(CredentialCryptoError);
  });

  it("refuses an unknown version byte", () => {
    const raw = Buffer.from(encryptSecret("abc123", "api_key"), "base64");
    raw[0] = 0x02;
    expect(() => decryptSecret(raw.toString("base64"), "api_key")).toThrow(
      /version 2/,
    );
  });

  it("refuses to encrypt an empty value", () => {
    expect(() => encryptSecret("", "api_key")).toThrow(CredentialCryptoError);
  });

  it("does not decrypt under a different key", () => {
    const envelope = encryptSecret("abc123", "api_key");
    const original = process.env.CREDENTIALS_ENC_KEY;
    process.env.CREDENTIALS_ENC_KEY = randomBytes(32).toString("base64");
    try {
      expect(() => decryptSecret(envelope, "api_key")).toThrow(
        CredentialCryptoError,
      );
    } finally {
      process.env.CREDENTIALS_ENC_KEY = original;
    }
  });
});

describe("lastFour", () => {
  it("takes the tail of a long key", () => {
    expect(lastFour("abcdefghijkl")).toBe("ijkl");
  });

  it("returns a short value whole rather than padding it", () => {
    expect(lastFour("ab")).toBe("ab");
  });
});

describe("safeEqual", () => {
  it("matches identical strings", () => {
    expect(safeEqual("secret-token", "secret-token")).toBe(true);
  });

  it("rejects different strings of equal length", () => {
    expect(safeEqual("secret-token", "secret-tokeX")).toBe(false);
  });

  it("rejects different lengths without throwing", () => {
    /* node's timingSafeEqual throws on a length mismatch; the wrapper must
       not, or a short webhook secret becomes a 500 instead of a 401. */
    expect(safeEqual("short", "much-longer-value")).toBe(false);
  });
});
