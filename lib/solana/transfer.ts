import "server-only";

import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  isAddress,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getLatestBlockhash } from "@/lib/solana/rpc";

/* ---------------------------------------------------------------------------
   Building a transfer.

   A swap has a route, a quote and slippage protection. A transfer has none
   of that: the amount leaves, the address receives, and nothing on-chain
   will give it back. So the care here goes somewhere different — into who
   the recipient is and how much actually moves, because those are the two
   things that cannot be undone.

   ── Three decisions worth stating ──────────────────────────────────────

   1. TRANSFER_CHECKED, never `transfer`.

      The checked variant takes the mint and the decimals and verifies both
      on-chain. Plain `transfer` takes a raw amount against whatever account
      it is pointed at, so a decimals mistake sends a thousand times too much
      and the chain accepts it. The check costs nothing and removes the whole
      class.

   2. The recipient's token account is created IDEMPOTENTLY.

      Sending an SPL token to someone who has never held it fails unless
      their associated token account exists. The idempotent instruction
      creates it when missing and is a no-op when present, so the same code
      path works for both and there is no "does it exist" race between the
      check and the send.

   3. Decimals come from the ALLOWLIST, not from the caller.

      `lib/telegram/trade.ts` holds a hand-verified decimals figure per mint.
      Taking it from a request would let a wrong number size the transfer,
      which is the same failure `transfer_checked` exists to stop — so it is
      not accepted from outside at all.

   Nothing here signs. Every function returns unsigned base64 bytes for the
   operator's wallet to sign in their browser.

   That is what `createNoopSigner` is for below. The instruction builders want
   a signer for the accounts that must sign, but the only key that can sign
   these is in the operator's browser. A noop signer marks the account as a
   signer in the compiled message and leaves the signature slot empty, which
   is precisely the shape a wallet expects to be handed.
--------------------------------------------------------------------------- */

/** Native SOL is nine decimals, always. */
const SOL_DECIMALS = 9;

/* `BigInt(...)` rather than a `0n` literal: the project targets below ES2020,
   where the literal syntax is a compile error but the constructor is not. */
const ZERO = BigInt(0);

/**
 * Whether a string is a usable Solana address.
 *
 * Exported because the answer belongs to the caller as much as to this file:
 * a recipient that fails here should be refused before anything is quoted or
 * built, with a message about the address rather than about a transaction.
 */
export function isValidRecipient(value: string): boolean {
  return isAddress(value.trim());
}

export interface BuiltTransfer {
  /** Unsigned, base64, ready for the wallet. */
  unsignedTransaction: string;
  /** The block height past which these bytes are dead. */
  lastValidBlockHeight: number;
}

/**
 * A native SOL transfer.
 *
 * The amount arrives in base units (lamports) as a string, for the reason
 * `toBaseUnits` exists: a decimal that went through a float has already lost
 * its last digit, and the digits the operator typed are the digits that
 * should move.
 */
export async function buildSolTransfer(input: {
  from: string;
  to: string;
  lamports: string;
}): Promise<BuiltTransfer> {
  const owner = address(input.from);
  const { value: blockhash } = await getLatestBlockhash();

  const instruction = getTransferSolInstruction({
    source: createNoopSigner(owner),
    destination: address(input.to),
    amount: BigInt(input.lamports),
  });

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (draft) => setTransactionMessageFeePayer(owner, draft),
    (draft) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: blockhash.blockhash as never,
          lastValidBlockHeight: BigInt(blockhash.lastValidBlockHeight),
        },
        draft,
      ),
    (draft) => appendTransactionMessageInstructions([instruction], draft),
  );

  return {
    unsignedTransaction: getBase64EncodedWireTransaction(compileTransaction(message)),
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
  };
}

/**
 * An SPL token transfer, creating the recipient's token account if needed.
 *
 * `decimals` is the mint's own figure and is passed to the chain to be
 * verified, not to be trusted — see the note above.
 */
export async function buildTokenTransfer(input: {
  from: string;
  to: string;
  mint: string;
  amount: string;
  decimals: number;
}): Promise<BuiltTransfer> {
  const owner = address(input.from);
  const recipient = address(input.to);
  const mint = address(input.mint);

  const [source] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [destination] = await findAssociatedTokenPda({
    owner: recipient,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const { value: blockhash } = await getLatestBlockhash();

  /* Idempotent: creates the recipient's account when it does not exist and
     does nothing when it does. The payer is the sender, because the
     recipient is not here to pay for their own account. */
  const signer = createNoopSigner(owner);

  const ensureDestination = getCreateAssociatedTokenIdempotentInstruction({
    payer: signer,
    owner: recipient,
    mint,
    ata: destination,
  });

  const transfer = getTransferCheckedInstruction({
    source,
    mint,
    destination,
    authority: signer,
    amount: BigInt(input.amount),
    decimals: input.decimals,
  });

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (draft) => setTransactionMessageFeePayer(owner, draft),
    (draft) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: blockhash.blockhash as never,
          lastValidBlockHeight: BigInt(blockhash.lastValidBlockHeight),
        },
        draft,
      ),
    (draft) => appendTransactionMessageInstructions([ensureDestination, transfer], draft),
  );

  return {
    unsignedTransaction: getBase64EncodedWireTransaction(compileTransaction(message)),
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
  };
}

/** SOL in whole units to lamports, exactly — no float in the path. */
export function solToLamports(amount: string): string | null {
  const text = amount.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") return null;

  /* Truncated, never rounded, for the same reason `toBaseUnits` truncates:
     rounding up would move more than the operator typed. */
  const [whole = "", fraction = ""] = text.split(".");
  const padded = fraction.padEnd(SOL_DECIMALS, "0").slice(0, SOL_DECIMALS);
  const lamports = BigInt(`${whole || "0"}${padded}`);

  /* An amount that rounds away to nothing at lamport precision is not a
     transfer, and zero is not worth a signature or a fee. */
  return lamports > ZERO ? lamports.toString() : null;
}
