import { MAX_REQUEST_USDC, USDC_DECIMALS } from "@/lib/rails/solanaPay";
import { toBaseUnits } from "@/lib/solana/amount";

/* ---------------------------------------------------------------------------
   The Agents drawer's "Get paid" form, held to the same rules the server
   holds a request to (lib/rails/requests.ts → createRequest), so the button
   is enabled exactly when the server would accept what is in the form. The
   server stays the authority: anything it refuses is shown as it says it.
   Pure.
--------------------------------------------------------------------------- */

/** How long a request stays open: the drawer's choices, all inside the server's 5 minutes to 7 days. */
export const OPEN_FOR_HOURS = [1, 24, 72, 168] as const;
export const DEFAULT_OPEN_FOR_HOURS = 24;
export const REQUEST_LABEL_MAX = 80;

export type RequestFormProblem = "wallet" | "amount" | "too_much" | "label";

/** The label as the server stores it: one printable line. */
export function cleanLabel(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, REQUEST_LABEL_MAX);
}

/**
 * What stops the form from being sent, first thing first: no wallet to be
 * paid into, then the amount, then the label. Null when it can be sent.
 */
export function requestFormProblem(input: { amount: string; label: string; hasWallet: boolean }): RequestFormProblem | null {
  if (!input.hasWallet) return "wallet";
  const base = toBaseUnits(input.amount, USDC_DECIMALS);
  if (base === null) return "amount";
  if (BigInt(base) > BigInt(MAX_REQUEST_USDC) * BigInt(10 ** USDC_DECIMALS)) return "too_much";
  if (cleanLabel(input.label).length === 0) return "label";
  return null;
}
