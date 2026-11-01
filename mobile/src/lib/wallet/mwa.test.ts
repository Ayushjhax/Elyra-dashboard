import { Buffer } from "buffer";
import { base58ToBase64, base64ToBase58, signatureFrom } from "~/lib/wallet/mwa";

jest.mock("@solana-mobile/mobile-wallet-adapter-protocol", () => ({ transact: jest.fn() }));
jest.mock("expo-secure-store", () => ({}));

const BASE58 = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

describe("addresses", () => {
  it("round-trips between MWA's base64 and Solana's base58", () => {
    const base64 = base58ToBase64(BASE58);
    expect(Buffer.from(base64, "base64")).toHaveLength(32);
    expect(base64ToBase58(base64)).toBe(BASE58);
  });
});

describe("signatureFrom", () => {
  const message = new Uint8Array([1, 2, 3]);
  const signature = new Uint8Array(64).fill(7);

  it("accepts a bare 64-byte signature", () => {
    expect(signatureFrom(signature, message)).toEqual(signature);
  });

  it("reads the signature off a message with it appended", () => {
    const signed = new Uint8Array([...message, ...signature]);
    expect(signatureFrom(signed, message)).toEqual(signature);
  });

  it("refuses anything else rather than sending a wrong signature", () => {
    expect(() => signatureFrom(new Uint8Array(10), message)).toThrow(/could not read/);
    /* The right length, but signed over a different message. */
    expect(() => signatureFrom(new Uint8Array([9, 9, 9, ...signature]), message)).toThrow(/could not read/);
  });
});
