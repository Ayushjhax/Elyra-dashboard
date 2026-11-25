import { isSolanaAddress } from "@/lib/solana/address";

/* ---------------------------------------------------------------------------
   Solana Pay transfer requests, and how one is settled. Pure.

   A request is the standard `solana:` URL (docs.solanapay.com, transfer
   request spec): the recipient's wallet, the amount in human units, the
   token's mint, and a REFERENCE — a fresh public key with no private key,
   which the paying wallet adds to the transfer as a read-only account. The
   chain can then be asked for every transaction that mentions it, which is
   how a payment is found without the payer telling anyone anything.

   Found is not settled. A transaction carrying the reference settles the
   request only if it succeeded and the chain's own record shows the
   recipient's balance of the mint rising by at least the amount asked —
   never a figure the payer or an agent supplied.
--------------------------------------------------------------------------- */

/** USDC on Solana mainnet. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;

/** The most a single request may ask for. */
export const MAX_REQUEST_USDC = 50_000;

/** Base units to an exact decimal string: "1500000" with 6 decimals → "1.5". */
export function fromBase(amountBase: string, decimals: number): string {
  const digits = amountBase.replace(/^0+/, "") || "0";
  if (decimals === 0) return digits;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
}

export function solanaPayUrl(request: {
  recipient: string;
  amount: string;
  mint: string;
  reference: string;
  label: string;
  message?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("amount", request.amount);
  params.set("spl-token", request.mint);
  params.set("reference", request.reference);
  params.set("label", request.label);
  if (request.message !== undefined && request.message !== null && request.message.length > 0) params.set("message", request.message);
  /* URLSearchParams writes spaces as "+"; the spec's examples percent-encode. */
  return `solana:${request.recipient}?${params.toString().replace(/\+/g, "%20")}`;
}

export interface ParsedSolanaPay {
  recipient: string;
  amount: string | null;
  mint: string | null;
  reference: string | null;
}

/** A `solana:` transfer request, or null when it is not one. */
export function parseSolanaPayUrl(url: string): ParsedSolanaPay | null {
  const match = /^solana:([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?(.*))?$/.exec(url.trim());
  if (match === null || !isSolanaAddress(match[1])) return null;
  const params = new URLSearchParams(match[2] ?? "");
  const amount = params.get("amount");
  if (amount !== null && !/^\d+(\.\d+)?$/.test(amount)) return null;
  const mint = params.get("spl-token");
  if (mint !== null && !isSolanaAddress(mint)) return null;
  /* A request may carry several references; the first identifies it. */
  const reference = params.getAll("reference")[0] ?? null;
  if (reference !== null && !isSolanaAddress(reference)) return null;
  return { recipient: match[1], amount, mint, reference };
}

/** One owner's net change in one mint, as the chain recorded it (lib/solana/rpc.ts). */
export interface BalanceChange {
  owner: string;
  mint: string;
  delta: string;
}

/** Whether a landed transaction pays `recipient` at least `amountBase` of `mint`. */
export function paysAtLeast(
  changes: readonly BalanceChange[],
  want: { recipient: string; mint: string; amountBase: string },
): boolean {
  const received = changes
    .filter((change) => change.owner === want.recipient && change.mint === want.mint)
    .reduce((sum, change) => sum + BigInt(change.delta), BigInt(0));
  return received >= BigInt(want.amountBase);
}
