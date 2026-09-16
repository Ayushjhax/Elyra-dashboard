import "server-only";

import { buildContext } from "@/lib/personalized/context";
import {
  appendMessage,
  conversationContext,
  ensureConversation,
  summariseOlder,
} from "@/lib/personalized/conversations";
import { classifyIntent } from "@/lib/personalized/intent";
import {
  BothProvidersFailedError,
  logRun,
  runPersonalized,
} from "@/lib/personalized/orchestrator";
import { renderAnswerForTelegram } from "@/lib/personalized/render/telegram";
import { prepareAction } from "@/lib/personalized/actions";
import { inferProposal } from "@/lib/personalized/proposal";
import type { PreparedAction } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   Telegram, answered by the SAME runtime as the dashboard.

   This file is the fix for the split the brief calls non-negotiable. Before
   it, Telegram called `lib/agent`'s tool loop while Personalized called
   `lib/personalized`'s context+synthesis runtime — two agents, two memories,
   two conversation stores, one user. A risk limit saved on the web was
   invisible in the chat, and "what changed since then?" could not work
   because the two halves did not share a transcript.

   Now Telegram is a RENDERER. It builds the same context, runs the same
   orchestrator, writes to the same `personalized_conversations`, reads the
   same `personalized_memories`, and differs only in how the resulting
   `PersonalizedAnswer` is drawn.

   The old `lib/agent` path is untouched and still serves `/report`,
   `/positions` and `/watch` — those are deterministic, need no model, and
   rewriting them would be churn for no gain.
--------------------------------------------------------------------------- */

export interface TelegramAgentInput {
  userId: string;
  chatId: number;
  message: string;
  solanaAddress: string | null;
  sessionWallet: string | null;
  /** False in a group. Gates every private figure — see §41. */
  isPrivateChat: boolean;
}

export interface TelegramAgentReply {
  html: string;
  suggestions: string[];
  /**
   * The server-built preview, when this turn produced one.
   *
   * Returned so the caller can attach a button. It is NOT rendered by the
   * caller — `html` already contains it — and nothing the model wrote became
   * a number in it: every amount was re-derived from the live snapshot by
   * `prepareAction`.
   */
  preparedAction?: PreparedAction;
}

/**
 * One turn.
 *
 * The conversation is keyed on the Elyra user rather than on the chat, so a
 * question asked in Telegram lands in the same thread the dashboard reads —
 * which is what makes continuing a conversation across channels work at all.
 */
export async function answerFromTelegram(
  input: TelegramAgentInput,
): Promise<TelegramAgentReply> {
  const intent = classifyIntent(input.message);

  /* A group chat may ask about the market and nothing else. Enforced before
     any context is built, so a private figure is never even read into memory
     in a context where it could be rendered. */
  if (!input.isPrivateChat) {
    const privateFacets = intent.facets.filter(
      (facet) => facet !== "equity" && facet !== "memory",
    );
    if (privateFacets.length > 0 || intent.task === "ACTION_PLANNING") {
      const { groupChatRefusal } = await import("@/lib/personalized/render/telegram");
      return { html: groupChatRefusal(), suggestions: [] };
    }
  }

  const [built, conversation] = await Promise.all([
    buildContext({
      userId: input.userId,
      solanaAddress: input.solanaAddress,
      sessionWallet: input.sessionWallet,
      intent,
    }),
    (async () => {
      const record = await ensureConversation(input.userId, null, input.message);
      if (record === null) return null;
      return { record, history: await conversationContext(input.userId, record.id) };
    })(),
  ]);

  const history = conversation?.history ?? { summary: null, recent: [] };

  if (conversation !== null) {
    await appendMessage({
      userId: input.userId,
      conversationId: conversation.record.id,
      role: "user",
      content: input.message,
    });
  }

  try {
    const run = await runPersonalized({
      intent,
      context: built.context,
      conversation: history,
      message: input.message,
    });

    logRun(run.meta, `${intent.task}:telegram`);

    let answer = run.answer;

    /* Action planning attaches a server-built preview, exactly as the web
       route does. Nothing the model wrote becomes a number here: the
       proposal is parsed from the operator's own words and every amount is
       re-derived from the live snapshot. */
    if (intent.task === "ACTION_PLANNING" && built.snapshot !== null) {
      const proposal = inferProposal(input.message, intent.symbols);
      if (proposal !== null) {
        const limit = built.context.memories.find(
          (memory) => memory.type === "concentration_limit",
        );
        answer = {
          ...answer,
          preparedAction: prepareAction(proposal, built.snapshot, {
            concentrationLimit: typeof limit?.value === "number" ? limit.value : null,
          }),
        };
      }
    }

    if (conversation !== null) {
      await appendMessage({
        userId: input.userId,
        conversationId: conversation.record.id,
        role: "assistant",
        content: answer.message,
        answer,
        run: {
          provider: run.meta.provider,
          model: run.meta.model,
          latencyMs: run.meta.latencyMs,
          inputTokens: run.meta.inputTokens,
          outputTokens: run.meta.outputTokens,
        },
      });
      void summariseOlder(input.userId, conversation.record.id);
    }

    const rendered = renderAnswerForTelegram(answer);
    return {
      html: rendered.text,
      suggestions: rendered.suggestions,
      ...(answer.preparedAction === undefined
        ? {}
        : { preparedAction: answer.preparedAction }),
    };
  } catch (error: unknown) {
    if (error instanceof BothProvidersFailedError) {
      return { html: escape(error.message), suggestions: [] };
    }
    console.error("[telegram personalized]", error);
    return {
      html: "Something went wrong answering that. Nothing was changed.",
      suggestions: [],
    };
  }
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
