/* ---------------------------------------------------------------------------
   Prompt text the interface offers to send to the agent.

   No transcript lives here any more: the conversation starts empty, because
   a seeded exchange the operator never had is a claim about their account.
--------------------------------------------------------------------------- */

/** Three suggestions above the composer, seeded from the selected market. */
export function suggestionChips(symbol: string): string[] {
  return [
    `Why is ${symbol} moving?`,
    `Show my ${symbol} exposure`,
    `What would close ${symbol} cost?`,
  ];
}

/** The question a signal card's "Ask Elyra" sends. */
export function signalPrompt(symbol: string, thesis: string): string {
  return `About the ${symbol} signal — "${thesis}" What is the evidence behind it?`;
}
