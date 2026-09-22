/* ---------------------------------------------------------------------------
   What a transaction this app builds costs, fixed in advance.

   Two parts. The base fee is 5,000 lamports per signature and has been since
   genesis. The PRIORITY fee is the part that gets a transaction scheduled:
   validators order by fee-per-compute-unit, and a transaction that declares
   none sits at the back of every queue and is the first thing dropped when a
   block is full. Transfers used to ship without one, forwarded exactly once
   (`maxRetries: 0`), which on mainnet meant "broadcast, then nothing" often
   enough to show up as a dialog spinning for minutes.

   ── Why these are constants and not an estimate ────────────────────────

   A `max` SOL send drains the wallet to exactly zero, and zero is the ONE
   balance below rent-exemption the runtime lets a system account end on.
   To land on it the amount reserved for the fee must be EXACTLY the fee
   charged — a reserve one lamport too generous leaves one lamport of dust,
   and the whole transaction is refused at simulation. So the fee cannot
   come from `getRecentPrioritizationFees` or a provider's estimate: it is
   `limit × price`, both declared in the transaction itself, and both fixed
   here so the reserve and the charge are the same arithmetic.

   The price is set high per unit and the limits set tight, which is the
   cheap way to buy priority: scheduling is ranked per compute unit, so a
   transfer that asks for 1,000 units at 1 lamport each ranks ahead of most
   of the block for a total of 1,000 lamports — a hundredth of a cent.
--------------------------------------------------------------------------- */

/** Lamports per signature. One signer on every transfer this app builds. */
export const BASE_TRANSACTION_FEE_LAMPORTS = 5_000;

/**
 * Micro-lamports per compute unit. 1,000,000 is one lamport per unit —
 * comfortably above the going rate in calm conditions and still enough to
 * be scheduled through moderate congestion. Affordable only because the
 * limits below are tight; see the note above.
 */
export const COMPUTE_UNIT_PRICE_MICROLAMPORTS = 1_000_000;

/**
 * A native SOL transfer: one system-program transfer (150 units) plus the
 * two compute-budget instructions that declare the budget (150 each). 450
 * in total, so 1,000 is a wide margin, and at this size the margin costs
 * nothing worth counting.
 */
export const SOL_TRANSFER_COMPUTE_UNITS = 1_000;

/**
 * An SPL transfer: `transfer_checked` (under 10,000) plus the idempotent
 * associated-account creation, which when it actually has to create costs
 * around 25,000. 60,000 leaves room for a Token-2022 mint with extensions.
 */
export const TOKEN_TRANSFER_COMPUTE_UNITS = 60_000;

/**
 * The priority fee, in lamports, for a transaction declaring `computeUnits`.
 *
 * The runtime charges `ceil(limit × price ÷ 1,000,000)`; the constants above
 * are chosen so this divides exactly, but the ceiling is kept so a future
 * change to either cannot silently under-reserve by a lamport.
 */
export function priorityFeeLamports(computeUnits: number): number {
  const micro = BigInt(computeUnits) * BigInt(COMPUTE_UNIT_PRICE_MICROLAMPORTS);
  const million = BigInt(1_000_000);
  return Number((micro + million - BigInt(1)) / million);
}

/**
 * Everything a SOL transfer pays, and therefore what `readSolHolding`
 * withholds from `sendable`. 6,000 lamports with the constants above.
 */
export const SOL_TRANSFER_FEE_LAMPORTS =
  BASE_TRANSACTION_FEE_LAMPORTS + priorityFeeLamports(SOL_TRANSFER_COMPUTE_UNITS);
