import { getAddressDecoder } from "@solana/kit";

/* ---------------------------------------------------------------------------
   What a swap transaction would do to the person's own accounts, judged
   before they are asked to sign it.

   Jupiter builds a swap's bytes and the person's wallet signs them; nothing
   in between read them. A route that came back wrong — a compromised
   upstream, a tampered response — could carry an instruction that moves a
   different token, approves a stranger to spend one, or hands an account to
   another owner, and the wallet would sign it like any other swap.

   So the server simulates the transaction and compares the person's
   accounts before and after. The rules hold whatever route Jupiter took,
   because they are about the person's money, not about Jupiter's programs:

     - no token other than the one sold may go down;
     - no more of the sold token may leave than the amount asked;
     - SOL may go down only by the amount sold (when SOL is sold) plus a
       bounded allowance for network fees and new-account rent;
     - no account may gain a delegate, a new owner or a new close
       authority — the shapes of a drain that waits until later;
     - the wallet itself must still belong to the System Program — an
       `Assign` the person signs would hand the whole wallet to a program.

   Only accounts the transaction declares can change: Solana requires every
   account an instruction touches, through any program it calls, to be
   listed in the transaction or loaded from one of its lookup tables. So the
   guard watches exactly the person's accounts the transaction declares —
   complete, not a sample — however many token accounts the wallet has.

   Pure: decoding and judging, tested directly. The reads and the simulation
   are lib/solana/swapGuard.ts.
--------------------------------------------------------------------------- */

/** Wrapped SOL: SOL as a token, which a swap of SOL moves through. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/** The program every ordinary wallet belongs to. */
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** An address lookup table's fixed header; its addresses follow, 32 bytes each. */
const LOOKUP_TABLE_META_SIZE = 56;

/**
 * What a swap may cost in SOL beyond the amount sold: the base fee, a
 * priority fee and the rent for an account or two the route creates.
 * Generous for a swap, and small next to any balance worth draining.
 */
export const SOL_HEADROOM_LAMPORTS = BigInt(50_000_000);

export interface TokenAccountView {
  address: string;
  mint: string;
  /** The wallet that owns the account. */
  owner: string;
  amount: bigint;
  delegate: string | null;
  closeAuthority: string | null;
}

const addressDecoder = getAddressDecoder();

/** Little-endian u64 at `offset`. */
function u64(bytes: Uint8Array, offset: number): bigint {
  let value = BigInt(0);
  for (let index = 7; index >= 0; index -= 1) value = (value << BigInt(8)) | BigInt(bytes[offset + index]);
  return value;
}

/** A `COption<Pubkey>`: a 4-byte tag, then the key. */
function optionalKey(bytes: Uint8Array, offset: number): string | null {
  const tag = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
  return tag === 0 ? null : addressDecoder.decode(bytes.slice(offset + 4, offset + 36));
}

/**
 * An SPL token account from its raw data. The first 165 bytes are the same
 * for the Token and Token-2022 programs; Token-2022 extensions follow and
 * are not read. Null for anything shorter.
 */
export function decodeTokenAccount(address: string, data: Uint8Array): TokenAccountView | null {
  if (data.length < 165) return null;
  return {
    address,
    mint: addressDecoder.decode(data.slice(0, 32)),
    owner: addressDecoder.decode(data.slice(32, 64)),
    amount: u64(data, 64),
    delegate: optionalKey(data, 72),
    closeAuthority: optionalKey(data, 129),
  };
}

/** The addresses an address lookup table holds, in index order. */
export function decodeLookupTable(data: Uint8Array): string[] {
  const addresses: string[] = [];
  for (let offset = LOOKUP_TABLE_META_SIZE; offset + 32 <= data.length; offset += 32) {
    addresses.push(addressDecoder.decode(data.slice(offset, offset + 32)));
  }
  return addresses;
}

export type SwapVerdict = { ok: true } | { ok: false; error: string };

export function judgeSwapEffects(input: {
  owner: string;
  sellMint: string;
  /** Base units of the sold token (lamports when SOL is sold). */
  sellAmount: bigint;
  pre: { lamports: bigint; accounts: readonly TokenAccountView[] };
  /**
   * After simulation. A watched account missing from the map was not
   * watched; null means it was closed. `program` is the wallet's owning
   * program afterwards.
   */
  post: { lamports: bigint | null; program: string | null; accounts: ReadonlyMap<string, TokenAccountView | null> };
  /** A name for a mint, for the message. */
  label?: (mint: string) => string;
}): SwapVerdict {
  const name = input.label ?? ((mint: string) => `${mint.slice(0, 4)}…${mint.slice(-4)}`);
  const refuse = (what: string): SwapVerdict => ({
    ok: false,
    error: `This swap was not offered to sign: simulated, it ${what}. A swap should only exchange what you asked.`,
  });

  if (input.post.lamports === null) return refuse("left your wallet unreadable");
  if (input.post.program !== null && input.post.program !== SYSTEM_PROGRAM) {
    return refuse("would hand control of your wallet to a program");
  }

  let soldTokens = BigInt(0);
  let wrappedSolOut = BigInt(0);

  for (const before of input.pre.accounts) {
    const after = input.post.accounts.get(before.address);
    if (after === undefined) continue;

    if (after === null) {
      /* A wrapped-SOL account is closed to unwrap it, and its SOL is counted
         below; any other account with a balance cannot be closed honestly. */
      if (before.mint === WSOL_MINT) {
        wrappedSolOut += before.amount;
        continue;
      }
      if (before.amount > BigInt(0)) return refuse(`would close your ${name(before.mint)} account`);
      continue;
    }

    if (after.owner !== input.owner) return refuse(`would hand your ${name(before.mint)} account to another owner`);
    if (after.delegate !== null && after.delegate !== before.delegate) {
      return refuse(`would let another address spend your ${name(before.mint)}`);
    }
    if (after.closeAuthority !== null && after.closeAuthority !== before.closeAuthority) {
      return refuse(`would let another address close your ${name(before.mint)} account`);
    }

    const decrease = before.amount - after.amount;
    if (decrease <= BigInt(0)) continue;
    if (before.mint === WSOL_MINT) wrappedSolOut += decrease;
    else if (before.mint === input.sellMint) soldTokens += decrease;
    else return refuse(`would take ${name(before.mint)}, which you did not ask to sell`);
  }

  if (input.sellMint !== WSOL_MINT && soldTokens > input.sellAmount) {
    return refuse(`would take more ${name(input.sellMint)} than the amount you asked to sell`);
  }

  const solOut = input.pre.lamports - input.post.lamports + wrappedSolOut;
  const allowed = (input.sellMint === WSOL_MINT ? input.sellAmount : BigInt(0)) + SOL_HEADROOM_LAMPORTS;
  if (solOut > allowed) {
    return refuse(
      input.sellMint === WSOL_MINT
        ? "would take more SOL than the amount you asked to sell plus network fees"
        : "would take SOL beyond network fees, which you did not ask to sell",
    );
  }

  return { ok: true };
}
