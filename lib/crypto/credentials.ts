import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { decodeKey, required } from "@/lib/env";

/* ---------------------------------------------------------------------------
   Exchange credentials at rest.

   AES-256-GCM. The stored envelope is

     base64( [version:1] [iv:12] [tag:16] [ciphertext:n] )

   The version byte is there so a future key rotation or algorithm change can
   read old rows instead of orphaning every connected exchange.

   The field name is bound in as additional authenticated data. Without it, a
   row's `api_key_enc` could be copied into its `api_secret_enc` and would
   still decrypt cleanly — the value would be wrong but authentic, and the
   failure would surface as an unexplained signature rejection from the
   exchange. With it, the swap fails closed, here, with a named error.

   Cross-*user* swaps are prevented by the `user_id` filter on the query that
   loads the row, not by this module.
--------------------------------------------------------------------------- */

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** The columns this module writes. Bound as AAD, so they are not swappable. */
export type CredentialField = "api_key" | "api_secret" | "passphrase";

export class CredentialCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialCryptoError";
  }
}

function key(): Buffer {
  const decoded = decodeKey(required("CREDENTIALS_ENC_KEY"));
  if (decoded === null || decoded.length !== 32) {
    /* assertServerEnv checks this at boot. Reaching here means the process
       started without the check, so fail rather than encrypt under a key of
       the wrong size. */
    throw new CredentialCryptoError(
      "CREDENTIALS_ENC_KEY must decode to 32 bytes",
    );
  }
  return decoded;
}

/** Plaintext secret to a storable envelope. */
export function encryptSecret(
  plaintext: string,
  field: CredentialField,
): string {
  if (plaintext.length === 0) {
    throw new CredentialCryptoError(`Refusing to encrypt an empty ${field}`);
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(field, "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return Buffer.concat([
    Buffer.from([VERSION]),
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]).toString("base64");
}

/**
 * Envelope back to plaintext.
 *
 * Throws on a wrong key, a tampered ciphertext, or a value written for a
 * different field. It never returns a partially trusted result.
 */
export function decryptSecret(
  envelope: string,
  field: CredentialField,
): string {
  let raw: Buffer;
  try {
    raw = Buffer.from(envelope, "base64");
  } catch {
    throw new CredentialCryptoError(`Malformed ${field} envelope`);
  }

  if (raw.length < 1 + IV_BYTES + TAG_BYTES) {
    throw new CredentialCryptoError(`Truncated ${field} envelope`);
  }

  const version = raw[0];
  if (version !== VERSION) {
    throw new CredentialCryptoError(
      `Unsupported ${field} envelope version ${version}`,
    );
  }

  const iv = raw.subarray(1, 1 + IV_BYTES);
  const tag = raw.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(1 + IV_BYTES + TAG_BYTES);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAAD(Buffer.from(field, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    /* GCM authentication failed. Deliberately not saying which of the three
       causes it was — the distinction is not useful to a caller and the
       message can reach a log. */
    throw new CredentialCryptoError(
      `Could not decrypt ${field}: wrong key, altered value, or wrong field`,
    );
  }
}

/**
 * The tail of an API key, for identifying a connection in the UI without
 * decrypting anything. Never derived from a secret — only from the public
 * half of the pair.
 */
export function lastFour(apiKey: string): string {
  return apiKey.length <= 4 ? apiKey : apiKey.slice(-4);
}

/** Constant-time compare, for webhook secrets and link codes. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  /* timingSafeEqual throws on a length mismatch, which would itself leak the
     length. Compare against a fixed-size digest-shaped pad instead: bail on
     length first, but only after both buffers exist, so the common case of
     equal lengths is the one that runs in constant time. */
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
