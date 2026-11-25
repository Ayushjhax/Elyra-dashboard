/* ---------------------------------------------------------------------------
   The Desk's seats: which model sits where, from which lab, through which
   API, and with what lens. Pure data.

   A seat is filled only when its key is set on the deployment (lib/desk/
   seats.ts reads them); an empty seat simply does not vote. Every model can
   be swapped with its `modelEnv` without a code change, because model ids
   move faster than this file.

   The chair runs the process — assignments and the memo — and does not
   vote. Every other seat votes on the same question through its own lens.
   Lenses divide the work the way a committee does; they do not decide the
   weight of a vote. Weight is earned only by a seat's measured track record
   (lib/desk/protocol.ts).
--------------------------------------------------------------------------- */

export type SeatProvider = "anthropic" | "gemini" | "cohere" | "openai_compatible";

export interface SeatDef {
  id: string;
  title: string;
  /** What this seat looks at — its part of the committee's work. */
  lens: string;
  lab: string;
  provider: SeatProvider;
  /** Null when the seat has no safe default and waits for `modelEnv`. */
  defaultModel: string | null;
  modelEnv: string;
  keyEnv: string;
  /** OpenAI-compatible hosts only. */
  baseUrl?: string;
  /** Whether the lab offers this model on a free tier. */
  tier: "free" | "paid";
  votes: boolean;
}

export const SEATS: readonly SeatDef[] = [
  {
    id: "chair",
    title: "Chair",
    lens: "Runs the process: sets each member's assignment, keeps the record, and writes the memo with the dissent in it. Does not vote.",
    lab: "Anthropic",
    provider: "anthropic",
    defaultModel: "claude-opus-5-5",
    modelEnv: "DESK_CHAIR_MODEL",
    keyEnv: "ANTHROPIC_API_KEY",
    tier: "paid",
    votes: false,
  },
  {
    id: "strategist",
    title: "Strategist",
    lens: "The bigger picture: the regime the market is in and what the price already assumes.",
    lab: "Anthropic",
    provider: "anthropic",
    defaultModel: "claude-fable-5-2",
    modelEnv: "DESK_STRATEGIST_MODEL",
    keyEnv: "ANTHROPIC_API_KEY",
    tier: "paid",
    votes: true,
  },
  {
    id: "structure",
    title: "Market structure",
    lens: "The chart: trend against the averages, where the price sits in its range, and how far it usually moves.",
    lab: "Anthropic",
    provider: "anthropic",
    defaultModel: "claude-sonnet-5-5",
    modelEnv: "DESK_STRUCTURE_MODEL",
    keyEnv: "ANTHROPIC_API_KEY",
    tier: "paid",
    votes: true,
  },
  {
    id: "risk",
    title: "Risk officer",
    lens: "The red team: the strongest case against the obvious read, and what would break it.",
    lab: "Anthropic",
    provider: "anthropic",
    defaultModel: "claude-haiku-5-5",
    modelEnv: "DESK_RISK_MODEL",
    keyEnv: "ANTHROPIC_API_KEY",
    tier: "paid",
    votes: true,
  },
  {
    id: "positioning",
    title: "Positioning",
    lens: "Who is crowded: funding, open interest and volume, and which side pays to stay in.",
    lab: "Cohere",
    provider: "cohere",
    defaultModel: "command-a-plus-05-2026",
    modelEnv: "DESK_POSITIONING_MODEL",
    keyEnv: "COHERE_API_KEY",
    tier: "paid",
    votes: true,
  },
  {
    id: "cross_market",
    title: "Cross-market",
    lens: "How this market sits against Bitcoin and Ether over the same windows.",
    lab: "Google",
    provider: "gemini",
    defaultModel: "gemini-3.5-flash",
    modelEnv: "DESK_CROSS_MARKET_MODEL",
    keyEnv: "GEMINI_API_KEY",
    tier: "free",
    votes: true,
  },
  {
    id: "quant",
    title: "Quant",
    lens: "Base rates: how often this market has risen over windows like this one, and how big a typical move is.",
    lab: "Groq",
    provider: "openai_compatible",
    defaultModel: "openai/gpt-oss-120b",
    modelEnv: "DESK_QUANT_MODEL",
    keyEnv: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    tier: "free",
    votes: true,
  },
  {
    id: "contrarian",
    title: "Contrarian",
    lens: "Argue the side the room is likely to miss, then give your honest probability anyway.",
    lab: "OpenRouter",
    provider: "openai_compatible",
    /* OpenRouter's own router to whichever free model is up. */
    defaultModel: "openrouter/free",
    modelEnv: "DESK_CONTRARIAN_MODEL",
    keyEnv: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    tier: "free",
    votes: true,
  },
  {
    id: "second_opinion",
    title: "Second opinion",
    lens: "An independent read of the whole sheet, as if no one else were in the room.",
    lab: "Mistral",
    provider: "openai_compatible",
    defaultModel: "mistral-small-latest",
    modelEnv: "DESK_SECOND_OPINION_MODEL",
    keyEnv: "MISTRAL_API_KEY",
    baseUrl: "https://api.mistral.ai/v1",
    tier: "free",
    votes: true,
  },
  {
    id: "generalist",
    title: "Generalist",
    lens: "A generalist's read: the plainest explanation of the facts.",
    lab: "OpenAI",
    provider: "openai_compatible",
    /* No default: an OpenAI model id is set on purpose, never guessed. */
    defaultModel: null,
    modelEnv: "DESK_GENERALIST_MODEL",
    keyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    tier: "paid",
    votes: true,
  },
];

export const seatById = (id: string): SeatDef | undefined => SEATS.find((seat) => seat.id === id);

/** The voting seats a run needs before it is worth convening. */
export const MIN_VOTERS = 2;
