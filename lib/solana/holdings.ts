import "server-only";

import { address, isAddress } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { SOL_TRANSFER_FEE_LAMPORTS } from "@/lib/solana/fees";
import {
  getBalance,
  getMinimumBalanceForRentExemption,
  getTokenAccountsByOwner,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@/lib/solana/rpc";

/* ---------------------------------------------------------------------------
   What a wallet can actually send, read from the chain.

   This exists because the transfer path used to answer a different question
   than the one being asked. It could send any symbol on the hand-verified
   allowlist in `lib/telegram/trade.ts` — about twenty majors — and nothing
   else. That allowlist is right for TRADING, where resolving "USDC" to a
   lookalike mint on a user's word is how someone swaps their balance into a
   worthless token. It is wrong for MOVING YOUR OWN MONEY OUT, where the
   mint is not being guessed from a name at all: it is one the wallet
   demonstrably holds, and refusing it strands the balance in an embedded
   wallet the operator cannot otherwise reach.

   So the rule here is narrower and stronger than an allowlist. A mint is
   sendable if and only if this owner holds a token account for it. The
   lookalike-mint risk does not arise, because nothing is being resolved
   from a symbol — the caller names a mint, and it is either in this
   wallet's accounts or the request is refused.

   ── What comes from the chain, and why it must ─────────────────────────

   DECIMALS. Never from the request. `transfer_checked` verifies decimals
   on-chain precisely so a wrong figure cannot size a transfer a thousand
   times too large, and taking the figure from the caller would hand that
   protection straight back. The node reports it alongside the balance.

   THE TOKEN PROGRAM. A holding under Token-2022 derives a different
   associated token account than one under the original SPL Token program.
   Both are read, and each holding carries the program it was found under,
   so the transfer is built against the account that actually holds it.

   THE BALANCE, IN BASE UNITS. `amount` is the node's own integer string,
   not a scaled float. That is what makes "send everything" exact: the
   alternative is multiplying a display figure back up by the decimals, and
   a balance that has been through a float has already lost its last digits.
--------------------------------------------------------------------------- */

/**
 * What a SOL transfer costs, and so what the native balance must hold back.
 *
 * Defined in lib/solana/fees.ts alongside the compute budget the transfer
 * declares, because the two are one piece of arithmetic: the priority fee
 * is `limit × price`, both fixed, and this figure is the base fee plus
 * exactly that. A constant rather than a `getFeeForMessage` round trip for
 * the same reason it always was — nothing in it depends on the amount.
 * Re-exported so the callers and tests that read the fee from here still
 * can.
 */
export { SOL_TRANSFER_FEE_LAMPORTS } from "@/lib/solana/fees";

export interface Holding {
  /** The mint address, or "SOL" for the native balance. */
  mint: string;
  /** From the chain. Nine for native SOL, fixed by the protocol. */
  decimals: number;
  /** Base units, as the node reports them. Never a scaled float. */
  amount: string;
  /**
   * The most that can leave in ONE transfer instruction.
   *
   * For native SOL, the balance less the transaction fee — draining this
   * account to exactly zero, the only balance below rent-exemption Solana's
   * runtime allows an account to end a transaction holding. See
   * `rentExemptLamports`: sending less than this is not automatically safe.
   *
   * For a token, the balance of the ASSOCIATED token account alone — the
   * only account a transfer built here spends from. Usually equal to
   * `amount`; less than it when some of the holding sits in an auxiliary
   * account.
   */
  sendable: string;
  /** Which token program holds it. Null for native SOL. */
  tokenProgram: string | null;
  /**
   * SOL only; null for a token. The lamports THIS account — the sender,
   * which is also the fee payer — must clear, or hit exactly zero, once the
   * transfer and its fee are both paid.
   *
   * This is not a courtesy figure. Solana's runtime rejects outright any
   * transaction that leaves an account it touched non-zero and below this:
   * not "sent, but now paying rent" — refused, the whole transaction, at
   * simulation, before anything moves. A wallet holding only slightly more
   * than this has almost no room for a PARTIAL send — it can send nearly
   * everything, or a small amount that still clears this floor, and very
   * little in between. `/api/transfer/build` is where that gets checked.
   */
  rentExemptLamports: string | null;
}

const ZERO = BigInt(0);

/** The native balance, what of it can leave, and the floor the rest must clear. */
export async function readSolHolding(owner: string): Promise<Holding> {
  const [{ value: lamports }, rentExempt] = await Promise.all([
    getBalance(owner),
    /* A system account holds no data — the wallet itself, not a token
       account — so 0 bytes is the figure that applies here. */
    getMinimumBalanceForRentExemption(0),
  ]);
  const balance = BigInt(lamports);
  const fee = BigInt(SOL_TRANSFER_FEE_LAMPORTS);
  const sendable = balance > fee ? balance - fee : ZERO;

  return {
    mint: "SOL",
    decimals: 9,
    amount: balance.toString(),
    sendable: sendable.toString(),
    tokenProgram: null,
    rentExemptLamports: rentExempt.toString(),
  };
}

/**
 * One token holding, as both the figure that is HELD and the figure that can
 * actually LEAVE.
 *
 * These are not always the same number, and conflating them is how a max-send
 * bounces off simulation with an opaque error over a wallet that visibly has
 * the balance. One owner can hold several accounts for the same mint — the
 * associated one, plus any an airdrop, a program or an older wallet left
 * behind — and their balances sum. `/api/wallet` sums them, correctly, because
 * it is answering "what do you own".
 *
 * A transfer is built against the ASSOCIATED token account alone. So what can
 * leave in one transaction is that account's balance and nothing else, and
 * that is what `sendable` reports. `amount` keeps the total, so the caller can
 * say plainly that some of a holding sits somewhere this flow cannot reach
 * rather than silently offering a figure the chain will refuse.
 *
 * Both token programs are read. A Token-2022 holding derives a different
 * associated account than an original SPL one, so the program each account was
 * found under is carried with it.
 */
async function readTokenHolding(
  owner: string,
  mint: string,
): Promise<Holding | null> {
  const [spl, spl2022] = await Promise.allSettled([
    getTokenAccountsByOwner(owner, TOKEN_PROGRAM_ID),
    getTokenAccountsByOwner(owner, TOKEN_2022_PROGRAM_ID),
  ]);

  /* Both failing means the token list could not be read at all, which must
     not be reported as "you hold nothing" — that would render a funded wallet
     as empty and refuse every transfer out of it. */
  if (spl.status === "rejected" && spl2022.status === "rejected") {
    throw spl.reason instanceof Error
      ? spl.reason
      : new Error("Token balances could not be read.");
  }

  const matching: Array<{ pubkey: string; amount: bigint; decimals: number; program: string }> =
    [];

  for (const [result, programId] of [
    [spl, TOKEN_PROGRAM_ID],
    [spl2022, TOKEN_2022_PROGRAM_ID],
  ] as const) {
    if (result.status !== "fulfilled") continue;
    for (const entry of result.value.value) {
      const info = entry.account.data.parsed.info;
      if (info.mint !== mint) continue;
      matching.push({
        pubkey: entry.pubkey,
        amount: BigInt(info.tokenAmount.amount),
        decimals: info.tokenAmount.decimals,
        program: programId,
      });
    }
  }

  if (matching.length === 0) return null;

  const total = matching.reduce((sum, entry) => sum + entry.amount, ZERO);
  if (total <= ZERO) return null;

  /* Decimals are a property of the MINT, so every account for it reports the
     same figure; the first is as authoritative as any. It comes from the node
     either way, which is the point — never from the request. */
  const decimals = matching[0]!.decimals;
  const program = matching[0]!.program;

  /* Which of these accounts a transfer can actually spend from. Derived under
     the program the account was found under, because the derivation includes
     the program id. */
  const [associated] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: address(program),
  });

  const spendable =
    matching.find((entry) => entry.pubkey === (associated as string))?.amount ?? ZERO;

  return {
    mint,
    decimals,
    amount: total.toString(),
    sendable: spendable.toString(),
    tokenProgram: program,
    /* A token transfer moves the TOKEN balance inside an account, never the
       account's own lamports — rent-exemption is a property of lamports, so
       it does not apply to what `transfer_checked` moves. Only native SOL
       transfers touch the figure that rent-exemption is measured in. */
    rentExemptLamports: null,
  };
}

/**
 * Whether sending `lamports` out of a SOL holding leaves the SENDER in a
 * state Solana's runtime will actually accept.
 *
 * Checked separately from the `sendable` cap because the two catch different
 * mistakes: `sendable` (`amount` compared against it) catches sending MORE
 * than the account holds; this catches sending an amount that fits, but
 * leaves a REMAINDER the runtime refuses to create — non-zero and below
 * `rentExemptLamports`. Both must pass; neither implies the other. A full
 * drain (`lamports === holding.sendable`) always passes, since it leaves
 * exactly zero.
 */
export function leavesSendableBalance(holding: Holding, lamports: string): boolean {
  if (holding.rentExemptLamports === null) return true;
  const remainder =
    BigInt(holding.amount) - BigInt(lamports) - BigInt(SOL_TRANSFER_FEE_LAMPORTS);
  return remainder <= ZERO || remainder >= BigInt(holding.rentExemptLamports);
}

/**
 * One holding this owner demonstrably has, or null.
 *
 * `mint` is either the literal "SOL" or a base58 mint address. Anything else
 * — including a mint this wallet does not hold — returns null, and the
 * caller refuses the transfer rather than building one that would fail at
 * simulation with an opaque message about a missing account.
 */
export async function readHolding(
  owner: string,
  mint: string,
): Promise<Holding | null> {
  const wanted = mint.trim();
  if (wanted.toUpperCase() === "SOL") return readSolHolding(owner);
  if (!isAddress(wanted)) return null;
  return readTokenHolding(owner, wanted);
}

/**
 * Base units back to a human figure, exactly.
 *
 * The inverse of `toBaseUnits`, and written the same way for the same
 * reason: no floating point anywhere in it. `Number(amount) / 10 ** decimals`
 * is the obvious version and it is wrong in the one place it matters — a
 * balance large enough to exceed the safe integer range, or fine enough that
 * the division lands on a repeating binary fraction, comes back with digits
 * that were never there. This is the figure a confirm screen shows before
 * someone sends everything they hold, so it is built by moving the decimal
 * point through a string and never by arithmetic.
 */
export function fromBaseUnits(amount: string, decimals: number): string {
  const digits = amount.replace(/^0+(?=\d)/, "");
  if (decimals === 0) return digits;

  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, "");

  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
}
