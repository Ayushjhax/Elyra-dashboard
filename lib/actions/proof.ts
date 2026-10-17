import "server-only";

import { getTransactionSummary, type TransactionSummary } from "@/lib/solana/rpc";

/* ---------------------------------------------------------------------------
   Whether a signature proves a prepared swap was done.

   `confirmed` on a prepared action is a claim that this person's wallet
   signed a swap and it landed. The browser hands over the signature, and a
   signature is only text — anyone can paste one from an explorer. So it is
   checked against the chain before the row changes: the transaction exists,
   it succeeded, and this account's wallet is among its signers.

   "unknown" is not a refusal. Jupiter answers once the swap has executed,
   but the node this server reads can lag it by a slot or two, so an unseen
   signature is retried briefly and then reported as not-yet-checkable — the
   browser keeps the swap off the open list and asks again later, rather
   than putting it back in front of someone who has already done it.
--------------------------------------------------------------------------- */

export type SwapProof =
  | { outcome: "proven" }
  | { outcome: "rejected"; reason: string }
  | { outcome: "unknown"; reason: string };

/** Seen-or-not is retried this many times, this far apart. */
const ATTEMPTS = 4;
const INTERVAL_MS = 1_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function judge(summary: TransactionSummary, wallet: string): SwapProof {
  if (summary.err !== null) {
    return { outcome: "rejected", reason: "That transaction failed on-chain, so nothing was swapped." };
  }
  if (!summary.signers.includes(wallet)) {
    return { outcome: "rejected", reason: "That transaction was not signed by this account's wallet." };
  }
  return { outcome: "proven" };
}

export async function proveSwap(
  signature: string,
  wallet: string,
  read: (signature: string) => Promise<TransactionSummary | null> = getTransactionSummary,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<SwapProof> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (attempt > 0) await wait(INTERVAL_MS);
    let summary: TransactionSummary | null;
    try {
      summary = await read(signature);
    } catch {
      return { outcome: "unknown", reason: "The Solana network could not be reached to check the swap." };
    }
    if (summary !== null) return judge(summary, wallet);
  }
  return { outcome: "unknown", reason: "The network has not shown this swap yet." };
}
