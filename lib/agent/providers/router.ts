import "server-only";

import { anthropicProvider } from "@/lib/agent/providers/anthropic";
import { geminiProvider } from "@/lib/agent/providers/gemini";
import {
  ProviderError,
  type Provider,
  type ProviderId,
  type ProviderRequest,
  type ProviderResult,
} from "@/lib/agent/providers/types";
import { optional } from "@/lib/env";

/* ---------------------------------------------------------------------------
   Anthropic first, Gemini behind it.

   Two rules do most of the work here, and both are about *not* retrying:

   - A 400 is not retried. The request is malformed, and Gemini will reject
     the same malformed request just as fast, having cost a second round trip
     to learn nothing.
   - A refusal is not retried. The model declined on policy grounds; a second
     provider will decline too, and quietly shopping for a provider that says
     yes is not something this should do on its own.

   With `onText`, the primary is streamed. A third rule follows from that:
   once any text has reached the caller, a failure is not retried either.
   The person has already read the start of one answer, and a second
   provider's answer spliced after it would be two half-answers.
--------------------------------------------------------------------------- */

export interface RoutedResult extends ProviderResult {
  primaryProvider: ProviderId;
  fellBack: boolean;
  fallbackReason: string | null;
}

/* ---------------------------------------------------------------------------
   Circuit breaker.

   Three consecutive Anthropic failures open the circuit for 60 seconds, and
   requests go straight to Gemini rather than paying a 30-second timeout each
   to rediscover that Anthropic is down. After 60s one trial request is let
   through; if it succeeds the circuit closes.

   State is per server instance. On serverless that means each cold instance
   learns independently, so the breaker limits damage within an instance
   rather than across the fleet. Sharing it would mean a round trip to Redis
   on the hot path of every run, to save at most three requests per instance.
--------------------------------------------------------------------------- */

const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 60_000;

const breaker = {
  consecutiveFailures: 0,
  openedAt: null as number | null,
  /** Set while a half-open trial is in flight, so only one is allowed. */
  trialInFlight: false,
};

type BreakerState = "closed" | "open" | "half_open";

function breakerState(now: number): BreakerState {
  if (breaker.openedAt === null) return "closed";
  if (now - breaker.openedAt < OPEN_DURATION_MS) return "open";
  return "half_open";
}

function recordSuccess(): void {
  breaker.consecutiveFailures = 0;
  breaker.openedAt = null;
  breaker.trialInFlight = false;
}

function recordFailure(now: number): void {
  breaker.consecutiveFailures += 1;
  breaker.trialInFlight = false;
  if (breaker.consecutiveFailures >= FAILURE_THRESHOLD) {
    breaker.openedAt = now;
  }
}

/** Test seam. Nothing in the app calls this. */
export function resetCircuitBreaker(): void {
  breaker.consecutiveFailures = 0;
  breaker.openedAt = null;
  breaker.trialInFlight = false;
}

export function circuitBreakerSnapshot(): {
  state: BreakerState;
  consecutiveFailures: number;
} {
  return {
    state: breakerState(Date.now()),
    consecutiveFailures: breaker.consecutiveFailures,
  };
}

/* ------------------------------------------------------------------------- */

/** Gemini is optional; without a key there is simply no fallback. */
function fallbackProvider(): Provider | null {
  return optional("GEMINI_API_KEY") === undefined ? null : geminiProvider();
}

function describe(error: unknown): string {
  if (error instanceof ProviderError) return `${error.kind}: ${error.message}`;
  return error instanceof Error ? error.message : "unknown error";
}

export async function route(
  request: ProviderRequest,
  /** Injectable for tests; production always uses the real pair. */
  providers?: { primary: Provider; fallback: Provider | null },
  /** Streams the primary's text as it is generated, where it can stream. */
  onText?: (delta: string) => void,
): Promise<RoutedResult> {
  const primary = providers?.primary ?? anthropicProvider();
  const fallback =
    providers === undefined ? fallbackProvider() : providers.fallback;

  let emitted = false;
  const callPrimary = (): Promise<ProviderResult> =>
    onText !== undefined && primary.stream !== undefined
      ? primary.stream(request, (delta) => {
          emitted = true;
          onText(delta);
        })
      : primary.complete(request);

  const now = Date.now();
  const state = breakerState(now);

  /* Circuit open: skip the primary entirely. If there is no fallback
     configured, the circuit is irrelevant — try anyway, since failing without
     attempting is strictly worse than failing after attempting. */
  if (state === "open" && fallback !== null) {
    const result = await fallback.complete(request);
    return {
      ...result,
      primaryProvider: primary.id,
      fellBack: true,
      fallbackReason: `circuit_open: ${breaker.consecutiveFailures} consecutive ${primary.id} failures`,
    };
  }

  if (state === "half_open") {
    /* One trial at a time. A burst arriving the moment the window expires
       would otherwise all be trials, which is the stampede the breaker
       exists to prevent. */
    if (breaker.trialInFlight && fallback !== null) {
      const result = await fallback.complete(request);
      return {
        ...result,
        primaryProvider: primary.id,
        fellBack: true,
        fallbackReason: "circuit_half_open: trial already in flight",
      };
    }
    breaker.trialInFlight = true;
  }

  try {
    const result = await callPrimary();
    recordSuccess();
    return {
      ...result,
      primaryProvider: primary.id,
      fellBack: false,
      fallbackReason: null,
    };
  } catch (error) {
    const providerError =
      error instanceof ProviderError
        ? error
        : new ProviderError("network", primary.id, describe(error));

    /* A malformed request is not a health signal about the provider, so it
       must not count toward opening the circuit. Counting it would let a bug
       in this codebase trip the breaker and route everything to Gemini. */
    if (providerError.kind !== "bad_request") {
      recordFailure(Date.now());
    } else {
      breaker.trialInFlight = false;
    }

    if (!providerError.shouldFallBack || fallback === null || emitted) throw providerError;

    const result = await fallback.complete(request);
    return {
      ...result,
      primaryProvider: primary.id,
      fellBack: true,
      fallbackReason: `${providerError.kind}: ${providerError.message.slice(0, 200)}`,
    };
  }
}
