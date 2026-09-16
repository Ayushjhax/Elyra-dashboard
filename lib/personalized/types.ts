/* ---------------------------------------------------------------------------
   Personalized — the typed surface shared by the server and the browser.

   Client-safe: no `server-only`, no provider payloads, no environment reads.
   The orchestrator builds these and the page renders them, so a model
   response can never reach a component without passing through a shape that
   was validated first.

   The rule carried from the rest of this codebase: a figure that could not be
   computed is `null`, never 0 and never a plausible-looking default. Applied
   here it has a second meaning — the model is told which figures are null and
   is required to say so rather than fill the gap.
--------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   Intent and routing
--------------------------------------------------------------------------- */

/**
 * What kind of work a question needs.
 *
 * Routing on this rather than on message length or a model's own judgement:
 * "what is my USDC balance" is a database read with a sentence around it, and
 * paying two frontier models to reason about it is waste that the operator
 * eventually pays for.
 */
export type PersonalizedTask =
  /** Deterministic lookup. One cheap model turn to word the answer, or none. */
  | "FAST"
  /** Analysis over live state. Both models, then a synthesis. */
  | "PERSONALIZED_REASONING"
  /** A request to move capital. Reasoning plus a validated PreparedAction. */
  | "ACTION_PLANNING";

/** What the question is about, so context retrieval can be selective. */
export type ContextFacet =
  | "equity"
  | "allocation"
  | "positions"
  | "orders"
  | "activity"
  | "risk"
  | "memory"
  | "change"
  /**
   * Prediction-market positions and exposure.
   *
   * A facet of its own rather than folded into `positions`, because loading
   * it costs a call to a different provider and most questions do not need
   * it. Intent-aware retrieval is the point: "what are my perps doing" must
   * not pay for a Polymarket round trip.
   */
  | "prediction";

export interface Intent {
  task: PersonalizedTask;
  facets: ContextFacet[];
  /** Symbols named in the question, upper-cased — "SOL", "BTC". */
  symbols: string[];
  /** Why this classification, for the run log. Never shown to the user. */
  reason: string;
}

/* ---------------------------------------------------------------------------
   The answer
--------------------------------------------------------------------------- */

export type InsightTone = "positive" | "negative" | "neutral" | "risk";

export interface AnswerInsight {
  type: InsightTone;
  title: string;
  detail: string;
}

export interface AnswerMetric {
  label: string;
  value: string;
  delta?: string;
  /** Direction for the delta, so colour is not inferred by parsing a string. */
  tone?: "positive" | "negative" | "neutral";
}

export interface PersonalizedAnswer {
  headline?: string;
  message: string;
  insights?: AnswerInsight[];
  metrics?: AnswerMetric[];
  suggestedPrompts?: string[];
  preparedAction?: PreparedAction;
  /**
   * Which parts of the user's state this answer actually used.
   *
   * Shown as chips under the reply. It is the honesty surface: an answer
   * claiming to know the operator's positions while `contextUsed` says only
   * equity was read is a bug that is otherwise invisible.
   */
  contextUsed?: string[];
}

/* ---------------------------------------------------------------------------
   Streaming
--------------------------------------------------------------------------- */

export type PersonalizedStreamEvent =
  /** High-level progress only — "Reading portfolio…". Never reasoning. */
  | { type: "status"; status: string }
  | { type: "text_delta"; delta: string }
  | { type: "answer"; answer: PersonalizedAnswer }
  | { type: "prepared_action"; action: PreparedAction }
  | { type: "done"; messageId: string; conversationId: string }
  | { type: "error"; error: string };

/* ---------------------------------------------------------------------------
   Prepared actions

   The model proposes; the server resolves every id, every balance and every
   amount against live state, and nothing executes without a second explicit
   request from the browser. A field the model supplied is a *hint* until the
   validator has re-derived it.
--------------------------------------------------------------------------- */

export type PreparedActionKind =
  | "swap"
  | "transfer"
  | "withdraw"
  | "close_perp"
  | "reduce_perp"
  | "cancel_order";

export interface PreparedActionField {
  label: string;
  value: string;
  /** True when the server computed this, rather than echoing the model. */
  derived: boolean;
}

export type ActionReadiness =
  /** Validated against live state and executable by existing infrastructure. */
  | "ready"
  /** Validated and correct, but nothing in Elyra can execute it yet. */
  | "unsupported"
  /** Failed validation — the reason says what changed or was wrong. */
  | "rejected";

export interface PreparedAction {
  id: string;
  kind: PreparedActionKind;
  /** One line, already written for a person: "Swap 12.4 SOL to USDC". */
  summary: string;
  /** Every resolved field, in display order. */
  fields: PreparedActionField[];
  readiness: ActionReadiness;
  /** Why it is not `ready`. Null when it is. */
  reason: string | null;
  /** Warnings that do not block, e.g. a saved preference this would breach. */
  warnings: string[];
  /** When the underlying quote or balance was read. */
  preparedAt: string;
}

/* ---------------------------------------------------------------------------
   Memory

   Deliberately separate from conversation history. A conversation is what was
   said; a memory is a standing instruction that outlives it. Conflating them
   is why assistants "forget" a limit stated four sessions ago.
--------------------------------------------------------------------------- */

export type MemoryType =
  | "concentration_limit"
  | "stablecoin_buffer"
  | "preferred_venue"
  | "leverage_limit"
  | "watch_symbol"
  | "note";

export type MemorySource = "explicit" | "inferred";

export interface PersonalizedMemory {
  id: string;
  type: MemoryType;
  /** Stable identifier within a type — the symbol for a watch, else the type. */
  key: string;
  value: unknown;
  /** 0–1. Explicit memories are 1; inferred ones carry what produced them. */
  confidence: number;
  source: MemorySource;
  /** Already written for display: "Max 25% in any one asset". */
  label: string;
  createdAt: string;
  updatedAt: string;
}

/* ---------------------------------------------------------------------------
   Conversations
--------------------------------------------------------------------------- */

export type MessageRole = "user" | "assistant";

export interface PersonalizedMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** The validated answer, for an assistant turn that produced one. */
  answer: PersonalizedAnswer | null;
  createdAt: string;
}

export interface PersonalizedConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/* ---------------------------------------------------------------------------
   Context — what the page shows in its rail, and what the model is given
--------------------------------------------------------------------------- */

export interface ExposureRow {
  symbol: string;
  valueUsd: number;
  pct: number;
  /** Where it sits — "Spot", "Hyperliquid", or both. */
  venues: string[];
}

export interface RiskMetric {
  key: string;
  label: string;
  value: string;
  /** Null when there is no saved preference to measure against. */
  limit: string | null;
  breached: boolean;
  detail: string;
}

export interface TodayRow {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  detail: string | null;
}

export interface PersonalizedContext {
  asOf: string;
  /** Null when nothing could be totalled — never 0 as a stand-in. */
  totalEquityUsd: number | null;
  availableCapitalUsd: number | null;
  change24h: { usdChange: number; pctChange: number; coveragePct: number } | null;
  exposures: ExposureRow[];
  largestExposure: ExposureRow | null;
  positionCount: number;
  openOrderCount: number;
  risk: RiskMetric[];
  today: TodayRow[];
  memories: PersonalizedMemory[];
  /**
   * Prediction markets, when the question touched them.
   *
   * Null means the facet was not requested — NOT that exposure is zero. The
   * summary inside carries its own `connected` flag for the other case.
   */
  prediction: PredictionContext | null;
  /** Sources that failed, so the model is told its picture is incomplete. */
  unavailable: Array<{ scope: string; reason: string }>;
  /** True when the operator has nothing to personalize around yet. */
  empty: boolean;
}

export interface PredictionContextPosition {
  market: string;
  outcome: string;
  currentValueUsd: number | null;
  probabilityPct: number | null;
  entryProbabilityPct: number | null;
  pnlUsd: number | null;
  maxLossUsd: number | null;
  maxPayoutUsd: number | null;
  endsAt: string | null;
  status: string;
}

export interface PredictionContext {
  connected: boolean;
  /** Why not, when `connected` is false. */
  unavailableReason: string | null;
  valueUsd: number | null;
  capitalAtRiskUsd: number | null;
  maxPayoutUsd: number | null;
  unrealisedPnlUsd: number | null;
  sharePctOfPortfolio: number | null;
  activeMarkets: number | null;
  resolvingWithin7d: number | null;
  claimableValueUsd: number | null;
  /** The largest few, not everything — see the note on intent-aware context. */
  positions: PredictionContextPosition[];
}

export interface PersonalizedInsight {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  /** The prompt this insight suggests asking, if any. */
  prompt: string | null;
}
