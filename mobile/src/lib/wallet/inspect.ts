import bs58 from "bs58";
import { Buffer } from "buffer";

/* ---------------------------------------------------------------------------
   Reading the bytes before they are signed.

   The server builds every transaction and the app never edits one — but the
   confirm screen shows the server's own summary of it, and the embedded
   wallet signs without a screen of its own. So nothing would notice if the
   bytes and the summary disagreed: a bug, or an API that was not ours.

   This decodes the wire transaction (legacy or v0) and checks it against
   what the person asked for, so the confirm screen and the signature are
   about the same thing:

     - every transaction: the wallet about to sign is one of its required
       signers (`requireSigner`), and the bytes are a well-formed message;
     - a transfer: it is EXACTLY the shape lib/solana/transfer.ts builds —
       the compute budget, then a system transfer to the recipient, or the
       recipient's idempotent token-account creation and a transfer_checked
       into that account — paid and signed by the sender alone, for the
       amount typed, with a bounded priority fee (`checkTransfer`).

   A token transfer's recipient is bound on chain, not by trust: the
   associated-token program refuses an `ata` that is not derived from the
   `owner` and `mint` beside it, and the transfer must land in that `ata`.

   Pure: no React Native, so every rule is tested directly.
--------------------------------------------------------------------------- */

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

/**
 * The most a transfer may pay in priority fee. The server's are fixed at
 * 1,000 or 60,000 lamports (lib/solana/fees.ts); this leaves wide room and
 * still refuses bytes that would hand the balance to validators.
 */
export const MAX_PRIORITY_FEE_LAMPORTS = 1_000_000;

/** The runtime's ceiling, used when a price is set without a limit. */
const MAX_COMPUTE_UNITS = 1_400_000;

export interface DecodedInstruction {
  programId: string;
  /** null for an account loaded from an address lookup table. */
  accounts: (string | null)[];
  data: Uint8Array;
}

export interface DecodedTransaction {
  version: "legacy" | 0;
  /** The accounts whose signatures the message requires, fee payer first. */
  requiredSigners: string[];
  feePayer: string;
  usesLookupTables: boolean;
  instructions: DecodedInstruction[];
}

export class TransactionCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionCheckError";
  }
}

const UNREADABLE = "The transaction could not be read. Nothing was signed.";

function reader(bytes: Uint8Array) {
  let offset = 0;
  const take = (length: number): Uint8Array => {
    if (length < 0 || offset + length > bytes.length) throw new TransactionCheckError(UNREADABLE);
    const out = bytes.subarray(offset, offset + length);
    offset += length;
    return out;
  };
  return {
    u8: (): number => take(1)[0]!,
    take,
    /* Solana's compact-u16: seven bits a byte, at most three bytes. */
    shortvec: (): number => {
      let value = 0;
      for (let index = 0; index < 3; index++) {
        const byte = take(1)[0]!;
        value |= (byte & 0x7f) << (7 * index);
        if ((byte & 0x80) === 0) return value;
      }
      throw new TransactionCheckError(UNREADABLE);
    },
    done: (): boolean => offset === bytes.length,
  };
}

/** A base64 wire transaction, decoded. Throws TransactionCheckError when it is not one. */
export function decodeTransaction(base64: string): DecodedTransaction {
  const read = reader(new Uint8Array(Buffer.from(base64, "base64")));

  const signatureCount = read.shortvec();
  read.take(signatureCount * 64);

  const first = read.u8();
  const versioned = (first & 0x80) !== 0;
  if (versioned && (first & 0x7f) !== 0) throw new TransactionCheckError(UNREADABLE);
  const numRequiredSignatures = versioned ? read.u8() : first;
  read.u8(); // read-only signed
  read.u8(); // read-only unsigned

  const keyCount = read.shortvec();
  const keys: string[] = [];
  for (let index = 0; index < keyCount; index++) keys.push(bs58.encode(read.take(32)));
  if (numRequiredSignatures < 1 || numRequiredSignatures > keys.length || signatureCount !== numRequiredSignatures) {
    throw new TransactionCheckError(UNREADABLE);
  }

  read.take(32); // recent blockhash

  const raw: { program: number; accounts: number[]; data: Uint8Array }[] = [];
  const instructionCount = read.shortvec();
  for (let index = 0; index < instructionCount; index++) {
    const program = read.u8();
    const accounts = Array.from(read.take(read.shortvec()));
    const data = read.take(read.shortvec());
    raw.push({ program, accounts, data });
  }

  let loaded = 0;
  if (versioned) {
    const tables = read.shortvec();
    for (let index = 0; index < tables; index++) {
      read.take(32);
      loaded += read.take(read.shortvec()).length;
      loaded += read.take(read.shortvec()).length;
    }
  }
  if (!read.done()) throw new TransactionCheckError(UNREADABLE);

  const instructions = raw.map<DecodedInstruction>(({ program, accounts, data }) => {
    /* A program is always a static key; an account may come from a table. */
    const programId = keys[program];
    if (programId === undefined) throw new TransactionCheckError(UNREADABLE);
    return {
      programId,
      accounts: accounts.map((index) => {
        if (index < keys.length) return keys[index]!;
        if (index < keys.length + loaded) return null;
        throw new TransactionCheckError(UNREADABLE);
      }),
      data,
    };
  });

  return {
    version: versioned ? 0 : "legacy",
    requiredSigners: keys.slice(0, numRequiredSignatures),
    feePayer: keys[0]!,
    usesLookupTables: loaded > 0,
    instructions,
  };
}

/**
 * Refuses bytes that do not ask `address` to sign. A wallet signing a
 * message it is not a signer of adds nothing — but it is the first sign the
 * bytes are not the ones meant for this wallet.
 */
export function requireSigner(base64: string, address: string): DecodedTransaction {
  const transaction = decodeTransaction(base64);
  if (!transaction.requiredSigners.includes(address)) {
    throw new TransactionCheckError("This transaction was not built for this wallet. Nothing was signed.");
  }
  return transaction;
}

function u32(data: Uint8Array, at: number): number {
  return (data[at]! | (data[at + 1]! << 8) | (data[at + 2]! << 16)) + data[at + 3]! * 0x1000000;
}

function u64(data: Uint8Array, at: number): bigint {
  let value = BigInt(0);
  for (let index = 7; index >= 0; index--) value = value * BigInt(256) + BigInt(data[at + index]!);
  return value;
}

/**
 * A typed decimal in base units, exactly — truncated, never rounded, as the
 * server's `toBaseUnits` and `solToLamports` do. Null when it is not a number.
 */
export function toBaseUnits(amount: string, decimals: number): bigint | null {
  const text = amount.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") return null;
  const [whole = "", fraction = ""] = text.split(".");
  return BigInt(`${whole || "0"}${fraction.padEnd(decimals, "0").slice(0, decimals)}`);
}

export interface ExpectedTransfer {
  /** The wallet about to sign: the sender, and the only signer. */
  signer: string;
  /** The address the person typed or scanned. */
  recipient: string;
  /** "SOL", or the token's mint. */
  mint: string;
  /** The amount typed, as a decimal; null for a max send, which the server sizes. */
  amount: string | null;
}

/**
 * Checks that a transfer's bytes move what the person asked for, to whom
 * they asked, and nothing else. Throws TransactionCheckError, in words the
 * confirm screen can show, when they do not.
 */
export function checkTransfer(base64: string, expected: ExpectedTransfer): void {
  const transaction = decodeTransaction(base64);
  const mismatch = (what: string): never => {
    throw new TransactionCheckError(`The transaction the server built does not match your transfer (${what}). Nothing was signed.`);
  };

  if (transaction.usesLookupTables) mismatch("unexpected accounts");
  if (transaction.requiredSigners.length !== 1 || transaction.feePayer !== expected.signer) mismatch("signer");

  let unitLimit: number | null = null;
  let unitPrice = BigInt(0);
  let solTransfers = 0;
  let ata: { account: string; tokenProgram: string } | null = null;
  let tokenTransfers = 0;

  for (const { programId, accounts, data } of transaction.instructions) {
    if (programId === COMPUTE_BUDGET_PROGRAM) {
      if (data[0] === 2 && data.length === 5) unitLimit = u32(data, 1);
      else if (data[0] === 3 && data.length === 9) unitPrice = u64(data, 1);
      else mismatch("compute budget");
      continue;
    }

    if (programId === SYSTEM_PROGRAM) {
      /* Transfer: u32 instruction 2, then u64 lamports; [from, to]. */
      if (expected.mint !== "SOL" || data.length !== 12 || u32(data, 0) !== 2 || accounts.length !== 2) mismatch("instruction");
      if (accounts[0] !== expected.signer) mismatch("sender");
      if (accounts[1] !== expected.recipient) mismatch("recipient");
      if (expected.amount !== null && u64(data, 4) !== toBaseUnits(expected.amount, 9)) mismatch("amount");
      solTransfers++;
      continue;
    }

    if (programId === ASSOCIATED_TOKEN_PROGRAM) {
      /* CreateIdempotent: [payer, ata, owner, mint, system, token program]. */
      if (expected.mint === "SOL" || ata !== null || data.length !== 1 || data[0] !== 1 || accounts.length !== 6) mismatch("instruction");
      const [payer, account, owner, mint, system, tokenProgram] = accounts;
      if (payer !== expected.signer) mismatch("payer");
      if (owner !== expected.recipient) mismatch("recipient");
      if (mint !== expected.mint) mismatch("token");
      if (system !== SYSTEM_PROGRAM || (tokenProgram !== TOKEN_PROGRAM && tokenProgram !== TOKEN_2022_PROGRAM)) mismatch("token program");
      ata = { account: account!, tokenProgram: tokenProgram! };
      continue;
    }

    if (programId === TOKEN_PROGRAM || programId === TOKEN_2022_PROGRAM) {
      /* TransferChecked: u8 12, u64 amount, u8 decimals; [source, mint, destination, authority]. */
      if (expected.mint === "SOL" || data.length !== 10 || data[0] !== 12 || accounts.length !== 4) mismatch("instruction");
      const [, mint, destination, authority] = accounts;
      if (ata === null || programId !== ata.tokenProgram || destination !== ata.account) mismatch("recipient");
      if (mint !== expected.mint) mismatch("token");
      if (authority !== expected.signer) mismatch("sender");
      if (expected.amount !== null && u64(data, 1) !== toBaseUnits(expected.amount, data[9]!)) mismatch("amount");
      tokenTransfers++;
      continue;
    }

    mismatch("unexpected program");
  }

  if (expected.mint === "SOL" ? solTransfers !== 1 : tokenTransfers !== 1 || ata === null) mismatch("instruction");

  const units = BigInt(unitLimit ?? MAX_COMPUTE_UNITS);
  const million = BigInt(1_000_000);
  const priorityFee = (units * unitPrice + million - BigInt(1)) / million;
  if (priorityFee > BigInt(MAX_PRIORITY_FEE_LAMPORTS)) mismatch("network fee");
}
