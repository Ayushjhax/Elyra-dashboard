import "server-only";

import { anthropicProvider } from "@/lib/agent/providers/anthropic";
import { geminiProvider } from "@/lib/agent/providers/gemini";
import {
  ProviderError,
  type Provider,
  type ProviderRequest,
  type ProviderResult,
} from "@/lib/agent/providers/types";
import type { Attachment } from "@/lib/attachments";
import { optional } from "@/lib/env";
import { parseAnswer } from "@/lib/personalized/answer";
import { buildPrompt, buildSynthesisPrompt } from "@/lib/personalized/prompt";
import type { ConversationContext } from "@/lib/personalized/conversations";
import type {
  Intent,
  PersonalizedAnswer,
  PersonalizedContext,
} from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   Running the models.

   Built on the provider layer that already exists — `anthropicProvider` and
   `geminiProvider` implement one `Provider` interface with a shared error
   taxonomy, and this file adds the orchestration above it rather than a
   second way to call a model. Nothing here constructs an HTTP request.

   The difference from `lib/agent`'s loop is what a turn is FOR. That loop is
   an agent with tools, iterating until it has gathered enough. This one has
   no tools: the context was assembled deterministically before the model was
   called, and the model's only job is to explain it. A model that cannot
   fetch cannot fetch something wrong.

   ── Why two models, and when ───────────────────────────────────────────

   Only for PERSONALIZED_REASONING. Two frontier models answering "how many
   positions do I have" is waste the operator eventually pays for, so FAST
   takes one cheap turn and ACTION_PLANNING takes one careful one.

   For reasoning, the second model is not a vote — it is a check. It sees the
   same context AND the first answer, and is asked to find figures that are
   not supported. Then a third call resolves the two against the data. The
   failure this catches is the one that matters here: a confident, plausible,
   slightly wrong number about someone's money.
--------------------------------------------------------------------------- */

export interface RunOptions {
  intent: Intent;
  context: PersonalizedContext;
  conversation: ConversationContext;
  message: string;
  /** Aborted when the operator presses Stop. Passed through to every call. */
  signal?: AbortSignal;
  /** Files sent with this question — validated by the route, never stored. */
  attachments?: Attachment[];
  /** High-level progress only. Never internal reasoning. */
  onStatus?: (status: string) => void;
}

export interface RunResult {
  answer: PersonalizedAnswer;
  /** For the run log and the message row. Never shown to the operator. */
  meta: {
    provider: string;
    model: string;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    /** Which models actually ran, for cost accounting. */
    calls: Array<{ provider: string; model: string; ms: number; ok: boolean }>;
    fellBack: boolean;
    degraded: boolean;
  };
}

export class BothProvidersFailedError extends Error {
  constructor() {
    super(
      "Elyra's reasoning service is temporarily unavailable. Your portfolio data is still available.",
    );
    this.name = "BothProvidersFailedError";
  }
}

/** Gemini is optional. Without a key there is one model and no cross-check. */
function gemini(): Provider | null {
  return optional("GEMINI_API_KEY") === undefined ? null : geminiProvider();
}

/**
 * Anthropic is a required variable, so `optional()` will not accept its name
 * and the provider is constructed directly — exactly as `lib/agent`'s router
 * does. A missing key surfaces as an EnvError on the first call, which is the
 * correct loud failure for a deployment mistake.
 */
function anthropic(): Provider {
  return anthropicProvider();
}

interface Attempt {
  result: ProviderResult | null;
  ms: number;
  error: ProviderError | null;
}

/** One provider call, timed, never throwing. */
async function attempt(
  provider: Provider,
  request: ProviderRequest,
): Promise<Attempt> {
  const startedAt = Date.now();
  try {
    const result = await provider.complete(request);
    return { result, ms: Date.now() - startedAt, error: null };
  } catch (error: unknown) {
    const providerError =
      error instanceof ProviderError
        ? error
        : new ProviderError(
            "network",
            provider.id,
            error instanceof Error ? error.message : "unknown error",
          );
    return { result: null, ms: Date.now() - startedAt, error: providerError };
  }
}

function request(
  system: ReturnType<typeof buildPrompt>,
  message: string,
  signal?: AbortSignal,
  attachments: Attachment[] = [],
): ProviderRequest {
  /* No tools. The context is already assembled; a model that cannot fetch
     cannot fetch the wrong thing, and every figure it can state was put in
     front of it deterministically. Attachments ride on the question itself,
     to every model that reads it — the checker cannot check a figure it
     cannot see. */
  return {
    system,
    messages: [{ role: "user", content: message, ...(attachments.length > 0 ? { attachments } : {}) }],
    tools: [],
    maxTokens: 2_048,
    timeoutMs: signal === undefined ? undefined : 45_000,
  };
}

/* ---------------------------------------------------------------------------
   The run
--------------------------------------------------------------------------- */

export async function runPersonalized(options: RunOptions): Promise<RunResult> {
  const { intent, context, conversation, message, onStatus } = options;
  const calls: RunResult["meta"]["calls"] = [];
  const startedAt = Date.now();

  const primary = anthropic();
  const secondary = gemini();

  const prompt = buildPrompt({ intent, context, conversation, message });
  const single = request(prompt, message, options.signal, options.attachments);

  onStatus?.("Reading your portfolio…");

  /* ---- First answer: Anthropic, falling back to Gemini ---- */
  let first: Attempt = await attempt(primary, single);
  let firstProvider: Provider = primary;
  calls.push({
    provider: primary.id,
    model: primary.model,
    ms: first.ms,
    ok: first.result !== null,
  });

  let fellBack = false;
  if (first.result === null && secondary !== null) {
    /* A refusal is not retried on another provider: the second will decline
       too, and shopping for a provider that says yes is not something this
       should do on its own. */
    const shouldTry = first.error === null || first.error.shouldFallBack;
    if (shouldTry) {
      onStatus?.("Switching model…");
      first = await attempt(secondary, single);
      firstProvider = secondary;
      fellBack = true;
      calls.push({
        provider: secondary.id,
        model: secondary.model,
        ms: first.ms,
        ok: first.result !== null,
      });
    }
  }

  if (first.result === null) throw new BothProvidersFailedError();

  const firstText = first.result.text ?? "";

  /* A policy refusal is surfaced as-is rather than dressed up. */
  if (first.result.refused) {
    return {
      answer: {
        message:
          first.result.refusalReason ??
          "I can't answer that one. Ask me about your positions, exposure or capital instead.",
      },
      meta: {
        provider: first.result.provider,
        model: first.result.model,
        latencyMs: Date.now() - startedAt,
        inputTokens: first.result.usage.input,
        outputTokens: first.result.usage.output,
        calls,
        fellBack,
        degraded: false,
      },
    };
  }

  /* ---- One model is enough for a lookup or an action preview ---- */
  const crossCheck =
    intent.task === "PERSONALIZED_REASONING" &&
    secondary !== null &&
    firstProvider.id !== secondary.id;

  if (!crossCheck) {
    return {
      answer: parseAnswer(firstText),
      meta: {
        provider: first.result.provider,
        model: first.result.model,
        latencyMs: Date.now() - startedAt,
        inputTokens: first.result.usage.input,
        outputTokens: first.result.usage.output,
        calls,
        fellBack,
        degraded: false,
      },
    };
  }

  /* ---- Second opinion, then synthesis ---- */
  onStatus?.("Checking the figures…");

  const critiquePrompt = buildPrompt({
    intent,
    context,
    conversation,
    message,
    critiqueOf: firstText,
  });
  const second = await attempt(
    secondary,
    request(critiquePrompt, message, options.signal, options.attachments),
  );
  calls.push({
    provider: secondary.id,
    model: secondary.model,
    ms: second.ms,
    ok: second.result !== null,
  });

  /* The cross-check is an enhancement, not a dependency. If it fails, the
     first answer stands — degraded, and recorded as such. */
  if (second.result === null || second.result.text === null) {
    return {
      answer: parseAnswer(firstText),
      meta: {
        provider: first.result.provider,
        model: first.result.model,
        latencyMs: Date.now() - startedAt,
        inputTokens: first.result.usage.input,
        outputTokens: first.result.usage.output,
        calls,
        fellBack,
        degraded: true,
      },
    };
  }

  onStatus?.("Putting it together…");

  const synthesis = await attempt(
    firstProvider,
    request(
      buildSynthesisPrompt({
        context,
        message,
        first: firstText,
        second: second.result.text,
      }),
      message,
      options.signal,
      options.attachments,
    ),
  );
  calls.push({
    provider: firstProvider.id,
    model: firstProvider.model,
    ms: synthesis.ms,
    ok: synthesis.result !== null,
  });

  /* Synthesis failing falls back to the CHECKED answer rather than the
     original: the second model saw the context and the draft, so its version
     is the better-grounded of the two. */
  const finalText =
    synthesis.result?.text ?? second.result.text ?? firstText;

  const inputTokens =
    first.result.usage.input +
    second.result.usage.input +
    (synthesis.result?.usage.input ?? 0);
  const outputTokens =
    first.result.usage.output +
    second.result.usage.output +
    (synthesis.result?.usage.output ?? 0);

  return {
    answer: parseAnswer(finalText),
    meta: {
      provider: synthesis.result?.provider ?? second.result.provider,
      model: synthesis.result?.model ?? second.result.model,
      latencyMs: Date.now() - startedAt,
      inputTokens,
      outputTokens,
      calls,
      fellBack,
      degraded: synthesis.result === null,
    },
  };
}

/**
 * One line per run, for cost and latency.
 *
 * Metadata only: which provider, which model, how long, how many tokens.
 * Never the prompt, never the context, never the answer — the first two carry
 * the operator's balances and the third is their private analysis.
 */
export function logRun(meta: RunResult["meta"], task: string): void {
  console.log(
    JSON.stringify({
      event: "personalized-run",
      task,
      provider: meta.provider,
      model: meta.model,
      latencyMs: meta.latencyMs,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      calls: meta.calls,
      fellBack: meta.fellBack,
      degraded: meta.degraded,
    }),
  );
}
