/* ---------------------------------------------------------------------------
   Reading an action out of what the operator typed.

   Shared by the web chat route and the Telegram controller so both channels
   parse an intent identically. Two copies of this would eventually disagree,
   and the disagreement would be a preview that says one amount on the
   dashboard and another in the chat.

   Deterministic, and deliberately so. The model is not asked to emit an
   action object: a token name is attacker-controlled text, and a prompt
   injection inside one must not be able to describe a transfer. What the
   operator typed is parsed here, and every resolved value comes from
   `prepareAction` reading the live snapshot.

   Conservative — an unrecognised shape returns null and no preview appears,
   which is the correct failure for something that moves money.

   Pure, so it is tested directly: no `server-only`.
--------------------------------------------------------------------------- */

import type { ActionProposal } from "@/lib/personalized/actions";

export function inferProposal(message: string, symbols: string[]): ActionProposal | null {
  const text = message.toLowerCase();
  const symbol = symbols[0];

  const fraction = /\bhalf\b/.test(text)
    ? 0.5
    : /\ball\b|\beverything\b|\bentire\b/.test(text)
      ? 1
      : /\ba third\b/.test(text)
        ? 1 / 3
        : /\b(\d{1,3})\s*%/.exec(text) !== null
          ? Number(/\b(\d{1,3})\s*%/.exec(text)?.[1] ?? 0) / 100
          : undefined;

  if (/\bcancel\b/.test(text)) return { kind: "cancel_order" };

  if (/\bclose\b/.test(text) && /\b(perp|position)\b/.test(text)) {
    return { kind: "close_perp", market: symbol };
  }
  if (/\b(reduce|trim|cut)\b/.test(text) && /\b(perp|position)\b/.test(text)) {
    return { kind: "reduce_perp", market: symbol, fraction };
  }

  if (symbol === undefined) return null;

  if (/\b(swap|convert|sell|buy)\b/.test(text)) {
    return {
      kind: "swap",
      symbol,
      toSymbol: symbols[1] ?? "USDC",
      fraction,
      quantity: absoluteQuantity(text),
    };
  }
  if (/\bwithdraw\b/.test(text)) {
    return { kind: "withdraw", symbol, fraction, quantity: absoluteQuantity(text) };
  }
  if (/\b(transfer|send|move)\b/.test(text)) {
    return { kind: "transfer", symbol, fraction, quantity: absoluteQuantity(text) };
  }

  return null;
}

/** A bare number in the question — "sell 12 SOL". Undefined when absent. */
function absoluteQuantity(text: string): number | undefined {
  const match = /\b(\d+(?:\.\d+)?)\s*(?:sol|btc|eth|usdc|usdt|tokens?|units?)?\b/.exec(
    text.replace(/\b\d{1,3}\s*%/g, ""),
  );
  if (match === null) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
