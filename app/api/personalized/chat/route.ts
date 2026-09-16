import { NextResponse } from "next/server";
import { prepareAction } from "@/lib/personalized/actions";
import { inferProposal } from "@/lib/personalized/proposal";
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
import { rateLimited, resolve } from "@/lib/personalized/session";
import type {
  PersonalizedAnswer,
  PersonalizedStreamEvent,
} from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   One turn of Personalized, streamed.

   Server-Sent Events rather than a plain JSON response, because the wait is
   long enough to need narrating: the context read fans out to an RPC and the
   venues, and a reasoning turn runs three model calls. Silence for fifteen
   seconds reads as broken.

   What is streamed is STATUS and the finished answer — never reasoning. The
   status strings are written here, not by a model, so there is no path by
   which internal deliberation reaches the wire.

   The answer arrives as one `answer` event rather than as token deltas. That
   is deliberate: the payload is a validated structure with insights and
   metrics, and a half-parsed JSON object is not renderable. The status line
   carries the sense of progress that token streaming would, without showing
   the operator a malformed object mid-flight.
--------------------------------------------------------------------------- */

/* node:crypto and the exchange signing path need the Node runtime. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 4_000;

function sse(event: PersonalizedStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request): Promise<Response> {
  const resolved = await resolve(request);
  if ("response" in resolved) return resolved.response;
  const { session } = resolved;

  let body: { message?: unknown; conversationId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length === 0) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message is longer than ${MAX_MESSAGE_LENGTH} characters` },
      { status: 400 },
    );
  }

  /* Keyed on the verified id, falling back to the wallet when the profile
     store is down — never on anything the client supplied. */
  const rateKey = session.userId ?? session.solanaAddress ?? "anonymous";
  if (rateLimited(rateKey)) {
    return NextResponse.json(
      { error: "Too many requests. Wait a moment and try again." },
      { status: 429 },
    );
  }

  const requestedConversation =
    typeof body.conversationId === "string" ? body.conversationId : null;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: PersonalizedStreamEvent): void => {
        if (closed) return;
        controller.enqueue(encoder.encode(sse(event)));
      };

      /* The operator pressing Stop aborts the request, which aborts the
         provider calls through this signal rather than leaving three model
         calls running and billing for output nobody will read. */
      const onAbort = (): void => {
        closed = true;
      };
      request.signal.addEventListener("abort", onAbort);

      try {
        const intent = classifyIntent(message);

        send({ type: "status", status: "Reading your portfolio…" });

        /* Conversation and context are independent reads. */
        const [built, conversation] = await Promise.all([
          buildContext({
            userId: session.userId,
            solanaAddress: session.solanaAddress,
            sessionWallet: session.sessionWallet,
            intent,
          }),
          (async () => {
            if (session.userId === null) return null;
            const record = await ensureConversation(
              session.userId,
              requestedConversation,
              message,
            );
            if (record === null) return null;
            const history = await conversationContext(session.userId, record.id);
            return { record, history };
          })(),
        ]);

        if (request.signal.aborted) {
          controller.close();
          return;
        }

        const history = conversation?.history ?? { summary: null, recent: [] };

        /* The user's turn is written before the model runs, so a failed or
           stopped generation still leaves the question in the transcript. */
        if (conversation !== null && session.userId !== null) {
          await appendMessage({
            userId: session.userId,
            conversationId: conversation.record.id,
            role: "user",
            content: message,
          });
        }

        const run = await runPersonalized({
          intent,
          context: built.context,
          conversation: history,
          message,
          signal: request.signal,
          onStatus: (status) => send({ type: "status", status }),
        });

        if (request.signal.aborted) {
          controller.close();
          return;
        }

        logRun(run.meta, intent.task);

        let answer: PersonalizedAnswer = run.answer;

        /* ---- Action planning attaches a SERVER-BUILT preview ----

           The model's prose is kept; its proposed numbers are not. The
           proposal below is derived from the question and resolved against
           the live snapshot by `prepareAction`, which re-reads every balance.
           Nothing the model wrote reaches the preview as a value. */
        if (intent.task === "ACTION_PLANNING" && built.snapshot !== null) {
          const proposal = inferProposal(message, intent.symbols);
          if (proposal !== null) {
            const limit = built.context.memories.find(
              (memory) => memory.type === "concentration_limit",
            );
            const action = prepareAction(proposal, built.snapshot, {
              concentrationLimit:
                typeof limit?.value === "number" ? limit.value : null,
            });
            answer = { ...answer, preparedAction: action };
            send({ type: "prepared_action", action });
          }
        }

        send({ type: "answer", answer });

        let messageId = "unsaved";
        if (conversation !== null && session.userId !== null) {
          const saved = await appendMessage({
            userId: session.userId,
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
          messageId = saved?.id ?? "unsaved";
          /* Compress anything that has fallen out of the replay window, so
             the next turn does not have to carry it verbatim. */
          void summariseOlder(session.userId, conversation.record.id);
        }

        send({
          type: "done",
          messageId,
          conversationId: conversation?.record.id ?? "",
        });
      } catch (error: unknown) {
        if (error instanceof BothProvidersFailedError) {
          send({ type: "error", error: error.message });
        } else {
          console.error("[personalized chat]", error);
          send({
            type: "error",
            error:
              error instanceof Error
                ? error.message
                : "Something went wrong answering that.",
          });
        }
      } finally {
        request.signal.removeEventListener("abort", onAbort);
        closed = true;
        try {
          controller.close();
        } catch {
          /* Already closed by an abort. */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      /* Proxies buffer by default, which holds every event until the buffer
         fills — indistinguishable from the endpoint hanging. */
      "x-accel-buffering": "no",
    },
  });
}
