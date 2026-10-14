import "server-only";

import type { Attachment } from "@/lib/attachments";

/* ---------------------------------------------------------------------------
   The neutral surface between the agent loop and a model provider.

   Nothing above this file knows which provider ran. Nothing below it knows
   what the tools do. Adding a third provider means one more adapter and one
   line in the router.
--------------------------------------------------------------------------- */

export type ProviderId = "anthropic" | "gemini";

/** A model's request to run one tool. */
export interface ToolCall {
  /**
   * Provider-assigned call id. Anthropic round-trips this faithfully; Gemini
   * has no equivalent and matches responses by tool *name* instead, which is
   * why the Gemini adapter has to collapse duplicate names in a turn.
   */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type AgentMessage =
  | {
      role: "user";
      content: string;
      /** Files sent with this turn. Only ever on the newest user message:
          history is replayed as text, with a note of what was attached. */
      attachments?: Attachment[];
    }
  | {
      role: "assistant";
      content: string;
      toolCalls?: ToolCall[];
      /**
       * The turn exactly as its provider returned it — thinking blocks and
       * their signatures included — for that provider's adapter to send back
       * unchanged on the tool continuation. Another provider ignores it and
       * reads `content` and `toolCalls`.
       */
      providerContent?: { provider: ProviderId; blocks: unknown[] };
    }
  | { role: "tool"; toolCallId: string; name: string; result: unknown };

/**
 * A JSON Schema object describing a tool's parameters.
 *
 * Deliberately loose: the registry writes plain object schemas, and
 * sanitizeSchemaForGemini strips what Gemini's parser rejects.
 */
export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: unknown[];
  [key: string]: unknown;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: JsonSchema;
}

/**
 * The system prompt, split at its cache boundary.
 *
 * Caching is a prefix match, so anything that changes between runs must come
 * after everything that does not. `stable` is the agent's identity and rules;
 * `volatile` is the per-run user context — watchlist, positions, equity.
 * Interleaving them would invalidate the cache on every single run.
 */
export interface SystemPrompt {
  stable: string;
  volatile: string;
}

export interface ProviderRequest {
  system: SystemPrompt;
  messages: AgentMessage[];
  tools: ToolDef[];
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ProviderResult {
  text: string | null;
  toolCalls: ToolCall[];
  provider: ProviderId;
  model: string;
  usage: { input: number; output: number };
  /**
   * True when the model declined on policy grounds. The router must surface
   * this rather than fall back — a second provider will decline too, and
   * retrying spends money to reach the same answer.
   */
  refused: boolean;
  refusalReason: string | null;
  /** The provider's own content blocks, for `providerContent` on a continuation. */
  rawContent?: unknown[];
  /** Text reached the caller as it was generated, through `onText`. */
  streamed?: boolean;
}

/* ---------------------------------------------------------------------------
   Failures.

   The router's fallback rules are written against `kind`, so the taxonomy is
   the contract: an adapter that mislabels a 400 as retryable would send every
   malformed request to a second provider to fail identically.
--------------------------------------------------------------------------- */

export type ProviderFailure =
  | "rate_limited"
  | "server_error"
  | "network"
  | "timeout"
  | "bad_request"
  | "auth"
  | "malformed_response";

export class ProviderError extends Error {
  readonly kind: ProviderFailure;
  readonly provider: ProviderId;
  readonly status: number | null;

  constructor(
    kind: ProviderFailure,
    provider: ProviderId,
    message: string,
    status: number | null = null,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
    this.kind = kind;
    this.provider = provider;
    this.status = status;
  }

  /**
   * Whether another provider is worth trying.
   *
   * Not `auth` — a missing key is a deployment problem, and the fallback
   * provider's key is probably missing too, but more importantly the failure
   * needs to be visible rather than papered over.
   *
   * Not `bad_request` — the request is malformed and will be malformed for
   * everyone.
   */
  get shouldFallBack(): boolean {
    return (
      this.kind === "rate_limited" ||
      this.kind === "server_error" ||
      this.kind === "network" ||
      this.kind === "timeout"
    );
  }
}

/** Every adapter is this. */
export interface Provider {
  readonly id: ProviderId;
  readonly model: string;
  complete(request: ProviderRequest): Promise<ProviderResult>;
  /**
   * As `complete`, with text handed to `onText` as it is generated. Optional:
   * a provider without it is called through `complete`, and its text arrives
   * whole.
   */
  stream?(request: ProviderRequest, onText: (delta: string) => void): Promise<ProviderResult>;
}

/** Ceiling on a single provider call, per the spec's 30s fallback trigger. */
export const PROVIDER_TIMEOUT_MS = 30_000;

/** Enough for a full report; the prompt caps ordinary replies far below this. */
export const DEFAULT_MAX_TOKENS = 4_096;
