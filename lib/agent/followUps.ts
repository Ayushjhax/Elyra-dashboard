import { englishTranslator, type Translator } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Follow-up questions offered under a token analysis reply. Pure.

   Read from the question the person asked — "analyze SOL", "is this token
   safe? <mint>", "deep research on BONK" — never from the model's reply, so
   a reply cannot put words in the person's mouth. Each follow-up is sent as
   the person's own words, in their language, only when they tap it.
--------------------------------------------------------------------------- */

export type AnalysisKind = "overview" | "safety" | "sentiment" | "deep";

/* A ticker (a dot only inside it, as in BRK.B — never a sentence's full stop) or a Solana mint. */
const TOKEN = "([1-9A-HJ-NP-Za-km-z]{32,44}|[A-Za-z][A-Za-z0-9]{0,11}(?:\\.[A-Za-z0-9]{1,4})?)";

const PATTERNS: Array<[AnalysisKind, RegExp]> = [
  ["deep", new RegExp(`deep research (?:on|into|for) \\$?${TOKEN}`, "i")],
  ["safety", new RegExp(`(?:is (?:this|the) token safe|safe(?:ty)?|rug)\\??\\s+\\$?${TOKEN}\\b`, "i")],
  ["sentiment", new RegExp(`sentiment (?:for|of|on) \\$?${TOKEN}`, "i")],
  ["overview", new RegExp(`(?:analy[sz]e|research|tell me about|what can you tell me about|overview of) \\$?${TOKEN}`, "i")],
];

/** Words a pattern could catch that are not a token. */
const NOT_A_TOKEN = new Set(["THE", "THIS", "MY", "IT", "A", "AN", "MARKET", "CRYPTO"]);

/** What an analysis question asked about, or null for any other question. */
export function analysisSubject(question: string): { kind: AnalysisKind; subject: string } | null {
  for (const [kind, pattern] of PATTERNS) {
    const match = pattern.exec(question);
    if (match === null) continue;
    const raw = match[1];
    const subject = raw.length >= 32 ? raw : raw.toUpperCase();
    if (NOT_A_TOKEN.has(subject)) continue;
    return { kind, subject };
  }
  return null;
}

/** Up to three follow-ups for an analysis question, in the reader's language; none for any other question. */
export function analysisFollowUps(question: string, t: Translator = englishTranslator): string[] {
  const asked = analysisSubject(question);
  if (asked === null) return [];
  const subject = asked.subject;
  switch (asked.kind) {
    case "overview":
      return [
        t("What are the risks for {subject}?", { subject }),
        t("Give me deep research on {subject}", { subject }),
        t("What's the market sentiment for {subject}?", { subject }),
      ];
    case "safety":
      return [t("Analyze {subject} right now", { subject }), t("What's the market sentiment for {subject}?", { subject })];
    case "sentiment":
      return [t("Analyze {subject} right now", { subject }), t("Give me deep research on {subject}", { subject })];
    case "deep":
      return [t("What are the risks for {subject}?", { subject }), t("What's the market sentiment for {subject}?", { subject })];
  }
}
