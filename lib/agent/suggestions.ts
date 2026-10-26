/* ---------------------------------------------------------------------------
   Prompt text the interface offers to send to the agent.

   No transcript lives here any more: the conversation starts empty, because
   a seeded exchange the operator never had is a claim about their account.
--------------------------------------------------------------------------- */

/**
 * Three suggestions above the composer. Elyra is a crypto assistant first, so
 * they are crypto questions whatever is on the chart: the selected market
 * seeds the first one only when it is a crypto asset, and SOL — the
 * terminal's home market — stands in otherwise.
 */
export function suggestionChips(cryptoSymbol?: string | null): string[] {
  const symbol = cryptoSymbol?.trim() || "SOL";
  return [
    `Why is ${symbol} moving?`,
    "What's moving in crypto today?",
    "Explain how Solana staking works",
  ];
}

/** The question a signal card's "Ask Elyra" sends. */
export function signalPrompt(symbol: string, thesis: string): string {
  return `About the ${symbol} signal — "${thesis}" What is the evidence behind it?`;
}
