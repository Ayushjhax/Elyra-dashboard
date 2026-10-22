import type { PreparedAction } from "@/lib/personalized/types";
import { isSolanaAddress } from "@/lib/solana/address";
import type { WalletSnapshot } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   The client half of a transfer and a swap — what the website's dialogs and
   the Android app's screens share, so neither can offer a different list of
   sendable assets or read the server's answers differently.

   The server is the authority on all of it: it re-reads the holding before
   it builds, validates the recipient on the curve, and names the signer.
   What is here only keeps an obviously wrong request from being sent.
--------------------------------------------------------------------------- */

/** One thing that can be sent, as the wallet snapshot describes it. */
export interface Sendable {
  /** "SOL" for the native balance, otherwise the mint address. */
  mint: string;
  /** What to show. Falls back to the mint when nothing has vouched for it. */
  label: string;
  /** Scaled. For display only — the server sizes the transfer from chain. */
  amount: number;
  decimals: number;
  /** Jupiter recognises this mint. Unverified holdings are flagged, not hidden. */
  verified: boolean;
}

/**
 * What this wallet can send, native balance first — from the same snapshot
 * every balance on screen comes from, so the picker and the balances cannot
 * disagree about what is held.
 */
export function sendablesFrom(snapshot: WalletSnapshot | null): Sendable[] {
  if (snapshot === null) return [];
  const native: Sendable = { mint: "SOL", label: "SOL", amount: snapshot.sol, decimals: 9, verified: true };
  const tokens = snapshot.tokens
    .filter((token) => token.amount > 0)
    .map<Sendable>((token) => ({
      mint: token.mint,
      label: token.symbol ?? `${token.mint.slice(0, 4)}…${token.mint.slice(-4)}`,
      amount: token.amount,
      decimals: token.decimals,
      verified: token.verified,
    }));
  return [native, ...tokens];
}

/**
 * A cheap shape check, to catch a bad paste before a round trip. NOT the
 * authority — base58 and a length say nothing about the curve; the server
 * validates properly.
 */
export function looksLikeAddress(value: string): boolean {
  return isSolanaAddress(value.trim());
}

/**
 * The address in a scanned QR code: a bare address, or a Solana Pay URI
 * (`solana:<address>?amount=…`), whose recipient is the path. Anything else
 * is null — a scan never fills the field with something that is not an
 * address. The amount and memo in a Solana Pay URI are deliberately ignored:
 * the person types what they send.
 */
export function addressFromScan(data: string): string | null {
  const text = data.trim();
  const candidate = /^solana:/i.test(text) ? (text.slice("solana:".length).split(/[?#]/)[0] ?? "") : text;
  const decoded = (() => {
    try {
      return decodeURIComponent(candidate);
    } catch {
      return candidate;
    }
  })();
  return isSolanaAddress(decoded) ? decoded : null;
}

/** The person closed the wallet's prompt — said as a decision, not a fault. */
export const CANCELLED = "Cancelled — nothing was signed or sent.";

/** A signing or submit failure, in words: a rejection reads as cancelled. */
export function signingFailure(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/reject|declin|denied|cancel|closed/i.test(message)) return CANCELLED;
  return message.length > 0 ? message : fallback;
}

/* ---- the server's answers ---- */

/** /api/transfer/build. */
export interface BuiltTransfer {
  unsignedTransaction?: string;
  /** The only address that may sign these bytes. */
  signer?: string;
  /** The block height past which the unsigned bytes are dead. */
  lastValidBlockHeight?: number;
  summary?: string;
  to?: string;
  amount?: string;
  symbol?: string;
  /** SOL only, on a max send: the network fee the balance pays. */
  networkFee?: string | null;
  error?: string;
}

/** /api/transfer/submit and /api/transfer/status. */
export interface TransferStatus {
  status?: "confirmed" | "failed" | "pending";
  signature?: string;
  /** The blockhash's window closed before the network saw it: nothing was sent. */
  expired?: boolean;
  error?: string;
}

/** /api/swap/tokens. */
export interface TokenGroup {
  label: string;
  symbols: string[];
}

/** /api/swap/build. */
export interface SwapQuote {
  action?: PreparedAction;
  note?: string;
  unsignedTransaction?: string | null;
  quoteRef?: string | null;
  /** The only address that may sign these bytes. */
  signer?: string | null;
  error?: string;
}

/** /api/swap/submit. */
export interface SwapSubmitted {
  executed?: boolean;
  signature?: string;
  error?: string;
}
