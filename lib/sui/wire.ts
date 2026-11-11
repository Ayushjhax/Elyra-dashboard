/* ---------------------------------------------------------------------------
   A Sui transaction as it travels between the server that builds it, the
   wallet that signs it and the server that checks and executes it.

   Pure, shared with the app. lib/sui/tx.ts builds, seals and verifies it.

   The wallet never sees or edits the transaction itself: the server sends
   the 32-byte hash Sui verifies (`blake2b(intent || bytes)`), Privy's
   embedded Sui wallet signs that hash, and the server attaches the
   signature to the exact bytes it built and sealed.
--------------------------------------------------------------------------- */

export type SuiTxPurpose = "transfer" | "swap";

export interface SuiTxRequest {
  /** Base64 BCS `TransactionData`, exactly as built. */
  bytes: string;
  sender: string;
  purpose: SuiTxPurpose;
  /** Epoch ms. A seal older than its time limit is refused. */
  builtAt: number;
}

export interface BuiltSuiStep {
  tx: SuiTxRequest;
  seal: string;
  /** What the wallet signs: Blake2b-256 of the intent message, 0x-hex. */
  hash: `0x${string}`;
  summary: string;
  /** SUI: the gas budget, the most the fee can cost. */
  networkFeeMax: string;
}

export interface SuiTxStatus {
  status: "confirmed" | "failed";
  digest?: string;
  href?: string;
  error?: string;
}
