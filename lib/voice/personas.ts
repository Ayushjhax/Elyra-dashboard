import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Elyra's voices: who speaks when Elyra answers out loud. Pure.

   Each persona is a voice and a manner, never a different set of facts or
   powers. The voice is one of Gemini's prebuilt speakers, chosen for its
   timbre (`geminiVoice`); `speakingStyle` tells the speech model how to
   deliver the words; `replyStyle` tells Elyra's model how to write a reply
   that will be heard. When the server has no speech model the browser's own
   voice reads it, at the persona's `rate` and `pitch`.

   A persona is chosen by id from this list and nowhere else — the request
   carries an id, and an id not here is ignored — so nothing a person or a
   page sends can put words into the prompt through it. The names are
   Elyra's own.
--------------------------------------------------------------------------- */

export const VOICE_PERSONA_IDS = ["meridian", "kestrel", "wren", "harbor", "lark", "slate"] as const;
export type VoicePersonaId = (typeof VOICE_PERSONA_IDS)[number];

export interface VoicePersona {
  id: VoicePersonaId;
  /** A name, not a word to translate. */
  name: string;
  /** What it sounds like, in a few words (English key; translated where shown). */
  tagline: string;
  /** Gemini's prebuilt speaker. */
  geminiVoice: string;
  /** How the speech model delivers the words. */
  speakingStyle: string;
  /** How Elyra's model writes a reply this persona will say. */
  replyStyle: string;
  /** The browser's voice, when the server has none: words per minute relative to 1, and pitch. */
  rate: number;
  pitch: number;
}

export const VOICE_PERSONAS: readonly VoicePersona[] = [
  {
    id: "meridian",
    name: "Meridian",
    tagline: msg("Calm and measured"),
    geminiVoice: "Charon",
    speakingStyle: "calm, measured and unhurried, like a senior analyst talking a colleague through the numbers",
    replyStyle: "Calm and measured. Lead with the answer, then the one reason that matters most.",
    rate: 0.95,
    pitch: 0.95,
  },
  {
    id: "kestrel",
    name: "Kestrel",
    tagline: msg("Brisk, like a desk trader"),
    geminiVoice: "Orus",
    speakingStyle: "brisk, direct and confident, like a colleague on a trading desk, with short pauses between figures",
    replyStyle: "Brisk and direct, like a trading-desk colleague. Figures first, no pleasantries, no hedging words.",
    rate: 1.12,
    pitch: 1,
  },
  {
    id: "wren",
    name: "Wren",
    tagline: msg("Warm, explains as it goes"),
    geminiVoice: "Sulafat",
    speakingStyle: "warm, friendly and patient, with a smile in the voice",
    replyStyle: "Warm and plain-spoken. Explain any trading term in a few everyday words the first time it comes up.",
    rate: 1,
    pitch: 1.08,
  },
  {
    id: "harbor",
    name: "Harbor",
    tagline: msg("Steady, risk first"),
    geminiVoice: "Gacrux",
    speakingStyle: "steady, reassuring and careful, never rushed",
    replyStyle: "Steady and careful. Say the main risk before anything else, then the answer.",
    rate: 0.92,
    pitch: 0.9,
  },
  {
    id: "lark",
    name: "Lark",
    tagline: msg("Lively and quick"),
    geminiVoice: "Laomedeia",
    speakingStyle: "lively, quick and upbeat, but level and never giddy about money",
    replyStyle: "Lively and quick, but level about money — never excited by a gain or alarmed by a loss.",
    rate: 1.08,
    pitch: 1.12,
  },
  {
    id: "slate",
    name: "Slate",
    tagline: msg("Dry and precise"),
    geminiVoice: "Iapetus",
    speakingStyle: "dry, precise and economical, with clear diction",
    replyStyle: "Dry and precise. The fewest words that answer: the figure, the conclusion, nothing else.",
    rate: 1.05,
    pitch: 0.98,
  },
];

export const DEFAULT_PERSONA: VoicePersonaId = "meridian";

/** The persona for an id from a request or storage, or null for anything not on the list. */
export function personaById(id: unknown): VoicePersona | null {
  return typeof id === "string" ? (VOICE_PERSONAS.find((persona) => persona.id === id) ?? null) : null;
}

/**
 * What Elyra's model is told when its reply will be heard rather than read.
 * Elyra's own words, keyed by a persona from the list — never text from the
 * request. The reply's language is set separately, by the locale.
 */
export function spokenReplyInstruction(persona: VoicePersona): string {
  return [
    "## Spoken reply",
    "",
    `This reply will be read aloud by Elyra's voice, ${persona.name}, in a live voice conversation. ${persona.replyStyle}`,
    "Write for the ear: at most 80 words (about 150 characters in Chinese), in plain sentences. No tables, lists, headings, " +
      "markdown, links, code or emoji. Say figures the way a person would — round a price to what matters, a percentage to " +
      "one decimal — and never read out an address or a transaction id. If the full answer needs a table or long detail, " +
      "give the headline and say the detail is in the chat.",
    "Never say that an order was placed, a trade was made or money was moved: in Elyra, orders are placed only by the " +
      "person, on screen, and a spoken order becomes a ticket they confirm.",
  ].join("\n");
}
