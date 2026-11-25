import "server-only";

import { route, type RoutedResult } from "@/lib/agent/providers/router";
import {
  DEFAULT_MAX_TOKENS,
  ProviderError,
  type AgentMessage,
  type Effort,
  type SystemPrompt,
  type ToolCall,
  type ToolDef,
} from "@/lib/agent/providers/types";
import { executeTool, type ToolContext } from "@/lib/agent/tools/registry";
import { toolLabel } from "@/lib/agent/sources";

/* ---------------------------------------------------------------------------
   The tool loop: call the model, run the tools it asks for, hand the results
   back, until it answers or the budget runs out.

   One loop for every caller — `runAgent`, and Research in a team run — so a
   rule about how a tool round is run cannot hold for one and not the other.
   It writes nothing: a caller that keeps an audit of tool rounds does it in
   `onToolRound`.
--------------------------------------------------------------------------- */

export interface ToolLoopOptions {
  system: SystemPrompt;
  /** Appended to as the loop runs: the tool rounds go onto this array. */
  messages: AgentMessage[];
  tools: ToolDef[];
  context: ToolContext;
  /** Iterations, not tool calls: one iteration may run several tools at once. */
  maxIterations: number;
  /** Measured from `startedAt`, so time spent before the loop counts. */
  wallClockMs: number;
  startedAt: number;
  /** Ceiling on one provider call, inside what is left of the wall clock. */
  callTimeoutMs: number;
  maxTokens?: number;
  /** How hard the model thinks on each call (lib/agent/effort.ts). Absent: the model's default. */
  effort?: Effort;
  /** The model's words as they are written. Absent: nothing streams. */
  onText?: (delta: string) => void;
  /** The model went to read something; the labels say what. */
  onTools?: (labels: string[]) => void;
  /** After each tool round, for a caller that records them. */
  onToolRound?: (round: {
    result: RoutedResult;
    results: Array<{ name: string; result: unknown }>;
  }) => Promise<void>;
}

export interface ToolLoopResult {
  /** The model's answer; null when it never gave one. */
  replyText: string | null;
  /** The last provider result, for the run's record. */
  last: RoutedResult | null;
  iterations: number;
  /** Stopped on the clock or the iteration cap with work still pending. */
  ranLong: boolean;
  /** A failure kind and message, for the run's record; null when none. */
  failure: string | null;
  /** Every tool result, in order, for sources and checks. */
  toolResults: Array<{ name: string; result: unknown }>;
}

/** Runs one turn's tool calls together and returns them as tool messages. */
async function runTools(
  calls: ToolCall[],
  context: ToolContext,
): Promise<{ messages: AgentMessage[]; results: Array<{ name: string; result: unknown }> }> {
  /* allSettled, not all: one failing tool must not discard the results of the
     others that succeeded in the same turn. executeTool already converts a
     throw into a result, so a rejection here is a bug rather than a tool
     failure — but it is still not worth losing the turn over. */
  const settled = await Promise.allSettled(
    calls.map((call) => executeTool(call.name, call.arguments, context)),
  );

  const messages: AgentMessage[] = [];
  const results: Array<{ name: string; result: unknown }> = [];

  settled.forEach((outcome, index) => {
    const call = calls[index];
    const result =
      outcome.status === "fulfilled"
        ? outcome.value.result
        : { error: "Tool did not complete." };

    results.push({ name: call.name, result });
    messages.push({
      role: "tool",
      toolCallId: call.id,
      name: call.name,
      result,
    });
  });

  return { messages, results };
}

export async function toolLoop(options: ToolLoopOptions): Promise<ToolLoopResult> {
  const { messages, onText } = options;
  const toolResults: Array<{ name: string; result: unknown }> = [];

  let iterations = 0;
  let ranLong = false;
  let last: RoutedResult | null = null;
  let replyText: string | null = null;
  let failure: string | null = null;

  try {
    while (iterations < options.maxIterations) {
      const remaining = options.wallClockMs - (Date.now() - options.startedAt);
      if (remaining <= 0) {
        ranLong = true;
        break;
      }

      iterations += 1;

      const result = await route(
        {
          system: options.system,
          messages,
          tools: options.tools,
          maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(options.effort === undefined ? {} : { effort: options.effort }),
          /* Never let one provider call outlive the run's own budget. */
          timeoutMs: Math.min(remaining, options.callTimeoutMs),
        },
        undefined,
        onText,
      );
      last = result;

      if (result.refused) {
        replyText =
          result.text ??
          "I can't answer that one. The request was declined on content policy grounds.";
        break;
      }

      if (result.toolCalls.length === 0) {
        replyText = result.text;
        /* A fallback provider answers whole; the surface still gets it. */
        if (!result.streamed && result.text) onText?.(result.text);
        break;
      }

      options.onTools?.([...new Set(result.toolCalls.map((call) => toolLabel(call.name)))]);

      messages.push({
        role: "assistant",
        content: result.text ?? "",
        toolCalls: result.toolCalls,
        ...(result.rawContent !== undefined
          ? { providerContent: { provider: result.provider, blocks: result.rawContent } }
          : {}),
      });

      const { messages: toolMessages, results } = await runTools(
        result.toolCalls,
        options.context,
      );
      messages.push(...toolMessages);
      toolResults.push(...results);

      await options.onToolRound?.({ result, results });

      /* Ran out of iterations with tool calls still pending. */
      if (iterations >= options.maxIterations) ranLong = true;
    }
  } catch (error) {
    /* Record the failure *kind*, not just the message. Reading agent_runs
       later, "bad_request" and "timeout" call for completely different
       responses, and the message alone does not distinguish them. */
    failure =
      error instanceof ProviderError
        ? `${error.kind}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Agent run failed";
  }

  return { replyText, last, iterations, ranLong, failure, toolResults };
}
