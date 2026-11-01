import bs58 from "bs58";
import { Buffer } from "buffer";
import {
  checkTransfer,
  decodeTransaction,
  requireSigner,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  TransactionCheckError,
  toBaseUnits,
} from "~/lib/wallet/inspect";

/* Built with @solana/kit exactly as lib/solana/transfer.ts builds them, with
   a fixed blockhash: 1.5 SOL, and 2.5 USDC (6 decimals). */
const FROM = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const TO = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DESTINATION = "FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B";
const SOL_TX =
  "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQACBGdSBVwgs+nYdGZW3fc4VVB/h6tth1I+THan+jYJapnrfowIh2C/3h3dzzLBfyCbgkLuUqrxMfrNiNDqLG0LBvIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAAxJrndgN4IFTxep3s6kO0ROug7bEsbx0xxuDkqEvwUusDAwAFAugDAAADAAkDQEIPAAAAAAACAgABDAIAAAAAL2hZAAAAAAA=";
const TOKEN_TX =
  "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAGCWdSBVwgs+nYdGZW3fc4VVB/h6tth1I+THan+jYJapnrpE6m8rrPvwd4hRNztRqOh7QmFFjX/ZOHHJzaeQ8OGybT6oz1rKyozQUgdRIXXEPO9Upd2Z7eIKFrVSU3OPOX3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfowIh2C/3h3dzzLBfyCbgkLuUqrxMfrNiNDqLG0LBvKMlyWPTiSJ8bs9ECkUjg2DC1oTmdr/EIQEjnvY2+n4WQMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAAxvp6877brTo9ZfNqq8l0MbG75MLS9uDkfKYCA0UvXWEG3fbh12Whk9nL4UbO63msHLSF7V9bN5E6jPWFfv8AqcSa53YDeCBU8Xqd7OpDtETroO2xLG8dMcbg5KhL8FLrBAYABQJg6gAABgAJA0BCDwAAAAAABQYAAgQHAwgBAQgEAQcCAAoMoCUmAAAAAAAGAA==";

const ATTACKER = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

/* Tampering edits the real bytes, so no second encoder has to agree. */
function bytesOf(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}
function replaceKey(base64: string, from: string, to: string): string {
  const bytes = bytesOf(base64);
  const at = bytes.indexOf(Buffer.from(bs58.decode(from)));
  if (at < 0) throw new Error("key not in fixture");
  Buffer.from(bs58.decode(to)).copy(bytes, at);
  return bytes.toString("base64");
}
function replaceBytes(base64: string, from: number[], to: number[]): string {
  const bytes = bytesOf(base64);
  const at = bytes.indexOf(Buffer.from(from));
  if (at < 0) throw new Error("bytes not in fixture");
  Buffer.from(to).copy(bytes, at);
  return bytes.toString("base64");
}

const solTransfer = { signer: FROM, recipient: TO, mint: "SOL", amount: "1.5" };
const tokenTransfer = { signer: FROM, recipient: TO, mint: USDC, amount: "2.5" };

describe("decodeTransaction", () => {
  it("reads a v0 transfer as the server builds it", () => {
    const decoded = decodeTransaction(TOKEN_TX);
    expect(decoded.version).toBe(0);
    expect(decoded.feePayer).toBe(FROM);
    expect(decoded.requiredSigners).toEqual([FROM]);
    expect(decoded.usesLookupTables).toBe(false);
    expect(decoded.instructions.map((ix) => ix.programId).slice(2)).toEqual([
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      TOKEN_PROGRAM,
    ]);
    expect(decoded.instructions[3]!.accounts[2]).toBe(DESTINATION);
  });

  it("reads a v0 transaction that loads accounts from a lookup table, as a swap does", () => {
    /* @solana/kit, with the recipient moved into a lookup table. */
    const LOOKUP_TX =
      "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQABAmdSBVwgs+nYdGZW3fc4VVB/h6tth1I+THan+jYJapnrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADEmud2A3ggVPF6nezqQ7RE66DtsSxvHTHG4OSoS/BS6wEBAgACDAIAAAABAAAAAAAAAAEyHPpa3RheiJOl/YgBPsTX4SLe1GNUyt/1DZVjledbYAEAAA==";
    const decoded = requireSigner(LOOKUP_TX, FROM);
    expect(decoded.usesLookupTables).toBe(true);
    expect(decoded.instructions[0]!.programId).toBe(SYSTEM_PROGRAM);
    expect(decoded.instructions[0]!.accounts).toEqual([FROM, null]);
    /* A transfer must name its recipient outright. */
    expect(() => checkTransfer(LOOKUP_TX, { ...solTransfer, amount: null })).toThrow("unexpected accounts");
  });

  it("refuses bytes that are not a transaction", () => {
    expect(() => decodeTransaction("")).toThrow(TransactionCheckError);
    expect(() => decodeTransaction(Buffer.from("hello").toString("base64"))).toThrow(TransactionCheckError);
    /* Truncated, and with trailing bytes. */
    expect(() => decodeTransaction(SOL_TX.slice(0, 120))).toThrow(TransactionCheckError);
    expect(() => decodeTransaction(Buffer.concat([bytesOf(SOL_TX), Buffer.from([0])]).toString("base64"))).toThrow(TransactionCheckError);
  });
});

describe("requireSigner", () => {
  it("passes the wallet the bytes were built for, and refuses any other", () => {
    expect(() => requireSigner(SOL_TX, FROM)).not.toThrow();
    expect(() => requireSigner(SOL_TX, TO)).toThrow("not built for this wallet");
  });
});

describe("toBaseUnits", () => {
  it("truncates like the server and refuses what is not a number", () => {
    expect(toBaseUnits("1.5", 9)).toBe(BigInt(1_500_000_000));
    expect(toBaseUnits("0.1234567", 6)).toBe(BigInt(123_456));
    expect(toBaseUnits("1,000", 6)).toBe(BigInt(1_000_000_000));
    expect(toBaseUnits(".5", 2)).toBe(BigInt(50));
    expect(toBaseUnits("1e3", 6)).toBeNull();
    expect(toBaseUnits("", 6)).toBeNull();
  });
});

describe("checkTransfer", () => {
  it("passes the server's own SOL and token transfers", () => {
    expect(() => checkTransfer(SOL_TX, solTransfer)).not.toThrow();
    expect(() => checkTransfer(TOKEN_TX, tokenTransfer)).not.toThrow();
    /* A max send: the server sizes the amount. */
    expect(() => checkTransfer(SOL_TX, { ...solTransfer, amount: null })).not.toThrow();
  });

  it("refuses a different recipient", () => {
    expect(() => checkTransfer(replaceKey(SOL_TX, TO, ATTACKER), solTransfer)).toThrow("recipient");
    expect(() => checkTransfer(SOL_TX, { ...solTransfer, recipient: ATTACKER })).toThrow("recipient");
    /* The token account is created for someone else. */
    expect(() => checkTransfer(replaceKey(TOKEN_TX, TO, ATTACKER), tokenTransfer)).toThrow("recipient");
    /* The tokens go to an account other than the one created for the
       recipient: transfer_checked's destination (key 2) repointed at key 1. */
    const elsewhere = replaceBytes(TOKEN_TX, [8, 4, 1, 7, 2, 0], [8, 4, 1, 7, 1, 0]);
    expect(() => checkTransfer(elsewhere, tokenTransfer)).toThrow("recipient");
    /* Swapping the account everywhere is the chain's to refuse: the
       associated-token program rejects an `ata` not derived from its owner. */
    expect(() => checkTransfer(replaceKey(TOKEN_TX, DESTINATION, ATTACKER), tokenTransfer)).not.toThrow();
  });

  it("refuses a different amount or token", () => {
    expect(() => checkTransfer(SOL_TX, { ...solTransfer, amount: "1.4" })).toThrow("amount");
    expect(() => checkTransfer(TOKEN_TX, { ...tokenTransfer, amount: "25" })).toThrow("amount");
    expect(() => checkTransfer(TOKEN_TX, { ...tokenTransfer, mint: ATTACKER })).toThrow("token");
    expect(() => checkTransfer(TOKEN_TX, solTransfer)).toThrow(TransactionCheckError);
    expect(() => checkTransfer(SOL_TX, tokenTransfer)).toThrow(TransactionCheckError);
  });

  it("refuses another signer or fee payer", () => {
    expect(() => checkTransfer(SOL_TX, { ...solTransfer, signer: ATTACKER })).toThrow("signer");
  });

  it("refuses an instruction it does not expect", () => {
    /* The system transfer (u32 2) turned into Assign (u32 1), same length. */
    const assign = replaceBytes(SOL_TX, [12, 2, 0, 0, 0], [12, 1, 0, 0, 0]);
    expect(() => checkTransfer(assign, solTransfer)).toThrow("instruction");
    /* The compute-budget program swapped for another program. */
    const other = replaceKey(SOL_TX, "ComputeBudget111111111111111111111111111111", ATTACKER);
    expect(() => checkTransfer(other, solTransfer)).toThrow("unexpected program");
    expect(SYSTEM_PROGRAM).toBe("11111111111111111111111111111111");
  });

  it("refuses a priority fee that would drain the balance", () => {
    /* SetComputeUnitPrice 1,000,000 µ-lamports → 0xFFFFFFFF µ-lamports per unit. */
    const priced = replaceBytes(SOL_TX, [3, 0x40, 0x42, 0x0f, 0, 0, 0, 0, 0], [3, 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0]);
    expect(() => checkTransfer(priced, solTransfer)).toThrow("network fee");
  });
});
