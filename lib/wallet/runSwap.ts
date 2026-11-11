import type { PreparedAction } from "@/lib/personalized/types";
import { CANCELLED, signingFailure } from "@/lib/wallet/flows";

/* ---------------------------------------------------------------------------
   One swap, end to end — the website's only path that moves funds.

     1. QUOTE   /api/swap/build asks Jupiter to build an order for the
                session's wallet and returns the unsigned bytes.
     2. SIGN    the caller's signer — Privy, in this browser — signs them.
                The key never leaves the wallet; the server never sees it.
     3. SUBMIT  /api/swap/submit forwards the signed bytes to Jupiter,
                unmodified, and returns the signature.

   Shared by the swap dialog and the Intelligent Portfolios trade dialog, so
   a single swap and each leg of a portfolio are the same code: one quote
   path, one signature, one submit. Neither may grow its own.

   Always quoted fresh. A quote goes stale in about twenty seconds, and an
   RFQ quote (Ondo's tokens, through JupiterZ) sooner, so the bytes signed
   are always the ones built a moment ago.
--------------------------------------------------------------------------- */

export interface SwapRequest {
  fromSymbol: string;
  toSymbol: string;
  /** Human units of `fromSymbol`, as an exact decimal string. */
  amount: string;
  /** A side named by mint instead — any token, listed or not. Takes precedence over the symbol. */
  fromMint?: string;
  toMint?: string;
  /** The person ticked that they checked an unlisted mint. Without it the server refuses one. */
  acknowledgeUnverified?: boolean;
}

export interface BuiltSwap {
  action?: PreparedAction;
  note?: string;
  unsignedTransaction?: string | null;
  quoteRef?: string | null;
  signer?: string;
  error?: string;
}

export type SwapRun =
  | { ok: true; signature: string; built: BuiltSwap }
  | { ok: false; error: string; cancelled: boolean; built: BuiltSwap | null };

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Base64 to bytes. Privy signs bytes; Jupiter speaks base64. */
export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Step one alone: a fresh quote and unsigned bytes, or the reason there are none. */
export async function buildSwap(fetcher: Fetcher, swap: SwapRequest): Promise<BuiltSwap> {
  try {
    const response = await fetcher("/api/swap/build", { method: "POST", body: JSON.stringify(swap) });
    const payload = (await response.json().catch(() => ({}))) as BuiltSwap;
    if (!response.ok) return { error: payload.error ?? "That could not be quoted." };
    return payload;
  } catch {
    return { error: "That could not be quoted — the network did not answer." };
  }
}

/**
 * Quotes, signs and submits one swap.
 *
 * `onBuilt` receives the fresh quote before anything is signed, so a dialog
 * can show the numbers the signature is about to commit to.
 */
export async function runSwap(
  fetcher: Fetcher,
  sign: (transaction: Uint8Array) => Promise<Uint8Array>,
  swap: SwapRequest,
  onBuilt?: (built: BuiltSwap) => void,
): Promise<SwapRun> {
  const built = await buildSwap(fetcher, swap);
  if (built.error !== undefined) return { ok: false, error: built.error, cancelled: false, built: null };
  onBuilt?.(built);

  const unsigned = built.unsignedTransaction;
  const quoteRef = built.quoteRef;
  if (typeof unsigned !== "string" || unsigned.length === 0 || typeof quoteRef !== "string") {
    return {
      ok: false,
      error: built.action?.reason ?? "There is nothing to sign for that route.",
      cancelled: false,
      built,
    };
  }

  let signed: Uint8Array;
  try {
    signed = await sign(decodeBase64(unsigned));
  } catch (caught: unknown) {
    /* Closing the wallet's prompt rejects, and that is a decision rather than
       a fault — it reads as "cancelled", not as an error to investigate. */
    const error = signingFailure(caught, "The swap could not be signed.");
    return { ok: false, error, cancelled: error === CANCELLED, built };
  }

  try {
    const response = await fetcher("/api/swap/submit", {
      method: "POST",
      body: JSON.stringify({ signedTransaction: encodeBase64(signed), quoteRef }),
    });
    const payload = (await response.json().catch(() => ({}))) as { signature?: string; error?: string };
    if (!response.ok || typeof payload.signature !== "string") {
      return { ok: false, error: payload.error ?? "The swap did not land.", cancelled: false, built };
    }
    return { ok: true, signature: payload.signature, built };
  } catch {
    /* The signed bytes may still have reached Jupiter. Said plainly, so the
       person checks their wallet before trying again. */
    return {
      ok: false,
      error: "The network dropped before the swap was confirmed. Check your wallet before trying again.",
      cancelled: false,
      built,
    };
  }
}
