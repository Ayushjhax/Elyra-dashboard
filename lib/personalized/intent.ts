/* ---------------------------------------------------------------------------
   What is this question, and what does answering it actually need?

   Classified in code rather than by asking a model. Three reasons:

   - It decides how much to spend. "How many positions do I have" routed to
     two frontier models plus a synthesis costs roughly a hundred times what
     it is worth, and the operator eventually pays for that.
   - It decides what context to fetch. Sending a whole account to every
     question is both slow and worse: a model handed a hundred irrelevant
     rows answers less precisely than one handed six relevant ones.
   - A classifier that is itself a model call cannot classify fast enough to
     be worth having, and fails in the same outage it is meant to route
     around.

   Deliberately conservative. When the signals are ambiguous this returns
   PERSONALIZED_REASONING, because the cost of over-thinking a simple question
   is money, and the cost of under-thinking a hard one is a wrong answer about
   the operator's capital.
--------------------------------------------------------------------------- */

import type { ContextFacet, Intent, PersonalizedTask } from "@/lib/personalized/types";

/* Ticker-shaped words that are ordinary English and must not be read as
   symbols. Without this, "AM I too exposed" names the AM token and "what IS
   my risk" names IS. */
const NOT_SYMBOLS = new Set([
  "AM", "IS", "IT", "MY", "DO", "ME", "SO", "UP", "ON", "IN", "AT", "OF", "OR",
  "IF", "BE", "GO", "NO", "AN", "AS", "BY", "TO", "WE", "HOW", "WHY", "ALL",
  "ANY", "CAN", "GET", "NOW", "OUT", "THE", "AND", "FOR", "ARE", "WAS", "HAS",
  "PNL", "USD", "API", "LP", "OK",
]);

const ACTION_VERBS =
  /\b(sell|buy|swap|convert|move|send|transfer|withdraw|deposit|close|reduce|trim|cut|cancel|rebalance|exit|unwind|hedge)\b/i;

/* Phrases that look like action verbs but are questions about state. "Should
   I reduce" and "how would I close" are asking for analysis, not a ticket. */
const HYPOTHETICAL = /\b(should|would|could|what if|how do i|how would|is it worth|thinking about)\b/i;

const CHANGE_WORDS = /\b(chang(e|ed|es)|since|yesterday|today|so far|moved|move[dn]?|happen(ed)?|new)\b/i;

const RISK_WORDS =
  /\b(risk|risky|riskiest|exposed|exposure|concentrat|liquidat|margin|leverage|safe|danger|drawdown|buffer)\b/i;

const POSITION_WORDS = /\b(position|perp|perpetual|long|short|leverage|margin|open)\b/i;
const ORDER_WORDS = /\b(order|limit|trigger|resting|pending|fill)\b/i;
const ACTIVITY_WORDS = /\b(activit|transaction|history|deposit|withdraw|transfer|swap|trade[ds]?|recent)\b/i;
const ALLOCATION_WORDS = /\b(allocat|split|breakdown|weight|percent|%|diversif|where.*(capital|money))\b/i;
const MEMORY_WORDS = /\b(prefer|limit|remember|rule|always|never|threshold|setting)\b/i;
const BALANCE_WORDS = /\b(balance|equity|worth|holding|own|have|capital|available|cash|stable)\b/i;

/**
 * Questions answerable from one deterministic figure.
 *
 * Narrow on purpose: a lookup pattern that is too generous routes a real
 * analysis question to the cheap path and answers it thinly.
 */
const LOOKUP =
  /^\s*(what('s| is)?|how (much|many)|do i (have|own)|show|list|tell me)\b.{0,80}$/i;

const ANALYSIS_WORDS =
  /\b(why|explain|analy[sz]|compare|should|better|worse|overexposed|too much|breakdown|reason|driving|because)\b/i;

/** Symbols named in the message, upper-cased and de-duplicated. */
export function extractSymbols(message: string): string[] {
  const found = new Set<string>();

  /* $-prefixed is unambiguous and wins regardless of the stop list. */
  for (const match of message.matchAll(/\$([A-Za-z]{2,10})\b/g)) {
    found.add(match[1].toUpperCase());
  }

  for (const match of message.matchAll(/\b([A-Za-z]{2,6})(?:-PERP)?\b/g)) {
    const word = match[1].toUpperCase();
    if (NOT_SYMBOLS.has(word)) continue;
    /* Upper-case in the original, or a known-shaped ticker written lower.
       "sol" in "my sol position" is a symbol; "Should" is not. */
    if (match[1] === word || /^(sol|btc|eth|usdc|usdt|jup|bonk|wif|pyth|hype)$/i.test(match[1])) {
      found.add(word);
    }
  }

  return [...found];
}

function facetsFor(message: string, task: PersonalizedTask): ContextFacet[] {
  const facets = new Set<ContextFacet>();

  /* Equity is always loaded: it is the denominator for every percentage the
     answer might state, and it is one field. */
  facets.add("equity");

  if (RISK_WORDS.test(message)) {
    facets.add("risk");
    facets.add("allocation");
    facets.add("positions");
    facets.add("memory");
  }
  if (POSITION_WORDS.test(message)) facets.add("positions");
  if (ORDER_WORDS.test(message)) facets.add("orders");
  if (ACTIVITY_WORDS.test(message)) facets.add("activity");
  if (ALLOCATION_WORDS.test(message)) facets.add("allocation");
  if (MEMORY_WORDS.test(message)) facets.add("memory");
  if (CHANGE_WORDS.test(message)) {
    facets.add("change");
    facets.add("allocation");
  }
  if (BALANCE_WORDS.test(message)) facets.add("allocation");

  /* Planning a capital move needs to see everything it could move, what it
     would breach, and what is already open. */
  if (task === "ACTION_PLANNING") {
    facets.add("allocation");
    facets.add("positions");
    facets.add("orders");
    facets.add("memory");
    facets.add("risk");
  }

  /* Reasoning with no other signal still needs something to reason over. */
  if (task === "PERSONALIZED_REASONING" && facets.size === 1) {
    facets.add("allocation");
    facets.add("change");
  }

  return [...facets];
}

export function classifyIntent(message: string): Intent {
  const text = message.trim();
  const symbols = extractSymbols(text);

  const wantsAction = ACTION_VERBS.test(text) && !HYPOTHETICAL.test(text);
  if (wantsAction) {
    return {
      task: "ACTION_PLANNING",
      facets: facetsFor(text, "ACTION_PLANNING"),
      symbols,
      reason: "imperative capital-moving verb without a hypothetical framing",
    };
  }

  const analytical = ANALYSIS_WORDS.test(text) || RISK_WORDS.test(text) || CHANGE_WORDS.test(text);

  /* A short lookup with no analytical word in it is the cheap path. The
     length bound matters: "what is my USDC balance" is a lookup, "what is
     the best way to reduce my SOL exposure given my limits" is not, and
     both open with "what is". */
  if (!analytical && LOOKUP.test(text) && text.length <= 90) {
    return {
      task: "FAST",
      facets: facetsFor(text, "FAST"),
      symbols,
      reason: "short deterministic lookup with no analytical framing",
    };
  }

  return {
    task: "PERSONALIZED_REASONING",
    facets: facetsFor(text, "PERSONALIZED_REASONING"),
    symbols,
    reason: analytical
      ? "analytical or risk framing"
      : "ambiguous — defaulted to reasoning rather than risk a thin answer",
  };
}
