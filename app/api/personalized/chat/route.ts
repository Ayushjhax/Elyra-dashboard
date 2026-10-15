import { NextResponse } from "next/server";
import { describeAttachments, validateAttachments } from "@/lib/attachments";
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
import {
  CONTEXT_SOURCES,
  isContextSource,
  type ContextSource,
  type PersonalizedAnswer,
  type PersonalizedStreamEvent,
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

/**
 * The sources this question may read, from the composer's selection.
 *
 * Absent means all of them — the behaviour before the selection existed.
 * Anything malformed is a 400 rather than a silent "all": a person who
 * turned their portfolio off must not have it sent because a field was
 * misspelled.
 */
function readSources(raw: unknown): { exclude: ContextSource[] } | { error: string } {
  if (raw === undefined || raw === null) return { exclude: [] };
  if (!Array.isArray(raw) || !raw.every(isContextSource)) {
    return { error: "sources must be a list of portfolio, positions, activity or memory." };
  }
  return { exclude: CONTEXT_SOURCES.filter((source) => !raw.includes(source)) };
}

export async function POST(request: Request): Promise<Response> {
  const resolved = await resolve(request);
  if ("response" in resolved) return resolved.response;
  const { session } = resolved;

  let body: {
    message?: unknown;
    conversationId?: unknown;
    sources?: unknown;
    attachments?: unknown;
    retry?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const typed = typeof body.message === "string" ? body.message.trim() : "";

  /* Checked the same way every route that carries files checks them —
     type, leading bytes, count, size — and never written anywhere. */
  const checked = validateAttachments(body.attachments);
  if ("error" in checked) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const { attachments } = checked;

  const sources = readSources(body.sources);
  if ("error" in sources) {
    return NextResponse.json({ error: sources.error }, { status: 400 });
  }

  if (typed.length === 0 && attachments.length === 0) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }
  /* A file on its own is still a question — "what is this?" — and the
     classifier and the transcript both need words to work with. */
  const message = typed.length > 0 ? typed : "Look at what I attached and tell me what matters for my capital.";
  /* What the transcript keeps: the words, and a note of what was attached. */
  const stored = [typed, describeAttachments(attachments)].filter((part) => part.length > 0).join("\n\n");
  const retry = body.retry === true;

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
            exclude: sources.exclude,
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

        if (conversation !== null) {
          send({ type: "conversation", conversationId: conversation.record.id });
        }

        const storedHistory = conversation?.history ?? { summary: null, recent: [] };
        const last = storedHistory.recent.at(-1);
        /* A retry of a turn that failed after its question was written: the
           question is already the conversation's last message. Writing it
           again would put it in the transcript twice, and replaying it to the
           model would ask it twice. */
        const alreadyStored =
          retry && last !== undefined && last.role === "user" && last.content === stored;
        const history = alreadyStored
          ? { ...storedHistory, recent: storedHistory.recent.slice(0, -1) }
          : storedHistory;

        /* The user's turn is written before the model runs, so a failed or
           stopped generation still leaves the question in the transcript. */
        if (conversation !== null && session.userId !== null && !alreadyStored) {
          await appendMessage({
            userId: session.userId,
            conversationId: conversation.record.id,
            role: "user",
            content: stored,
          });
        }

        const run = await runPersonalized({
          intent,
          context: built.context,
          conversation: history,
          message,
          attachments,
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
