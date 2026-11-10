import "server-only";

import { route } from "@/lib/agent/providers/router";

/* ---------------------------------------------------------------------------
   Arena's commentator: short text written by the model from facts the code
   computed — a trade review's coaching, a settled call's card.

   The model is held to the facts. Every number in what it writes must appear
   in the facts it was given; a reply that introduces any other number, runs
   long or fails is discarded and the caller's own text is used instead. The
   model never decides anything: labels and outcomes are already settled
   before it is asked.
--------------------------------------------------------------------------- */

const SYSTEM = [
  "You write two or three plain sentences for Elyra, a trading app, from facts you are given.",
  "Use only those facts. Repeat a number only exactly as it appears in them; never compute, round or introduce a new one.",
  "Describe what happened and what it shows about how the trade or call was played. Do not tell the reader what to buy, sell or trade next.",
  "Quiet and precise: no exclamation marks, no emoji, no hype.",
].join(" ");

/** Every number in a text, normalised: "$1,234.50" and "1234.5" are the same number. */
export function numbersIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const value = Number(match[0].replace(/,/g, ""));
    if (Number.isFinite(value)) found.add(String(value));
  }
  return found;
}

/** Whether `text` uses only numbers present in `facts`. */
export function staysOnFacts(text: string, facts: readonly string[]): boolean {
  const allowed = numbersIn(facts.join("\n"));
  for (const number of numbersIn(text)) if (!allowed.has(number)) return false;
  return true;
}

export async function writeFromFacts(
  task: string,
  facts: readonly string[],
  fallback: string,
): Promise<{ text: string; model: string }> {
  try {
    const result = await route({
      system: { stable: SYSTEM, volatile: "" },
      messages: [{ role: "user", content: `${task}\n\nFacts:\n${facts.map((line) => `- ${line}`).join("\n")}` }],
      tools: [],
      maxTokens: 220,
      timeoutMs: 15_000,
    });
    const text = result.text?.trim() ?? "";
    if (text.length === 0 || text.length > 600 || result.refused || !staysOnFacts(text, facts)) {
      return { text: fallback, model: "fallback" };
    }
    return { text, model: result.model };
  } catch {
    return { text: fallback, model: "fallback" };
  }
}
