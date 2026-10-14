import { NextResponse } from "next/server";
import { UsageLimitError, ensureConversation, runAgent, type AgentEvent } from "@/lib/agent";
import { validateAttachments } from "@/lib/attachments";
import { getSessionUser, hasProfile, profileUnavailable } from "@/lib/auth/session";

/* ---------------------------------------------------------------------------
   The web surface.

   It authenticates, resolves a conversation, and calls runAgent. It holds no
   prompt text, no tool definitions and no provider logic — all of that lives
   in lib/agent and is shared with Telegram.

   The request body carries a message and nothing else that matters. `userId`
   comes from the verified Privy token; a userId in the body is ignored, and
   there is no code path that would read one.

   `attachments` carries images, PDFs and text files, checked here by
   lib/attachments.ts — type, leading bytes, count and size — before any of
   it reaches the model. A message may be files alone.

   With `stream: true` the answer comes back as newline-delimited JSON while
   it is written: `text` deltas, `tools` when the model goes to read
   something, then one `done` with the finished reply and its sources (or
   one `error`). Everything that can be refused — no session, no database,
   a bad message — is refused before the stream opens, with a status code.
--------------------------------------------------------------------------- */

export type ChatStreamEvent =
  | AgentEvent
  | { type: "done"; reply: string; runId: string; sources: string[] }
  | { type: "error"; message: string };

/* node:crypto and the exchange signing path need the Node runtime. */
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 4_000;

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (user === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  /* Chat is stored: every turn is written to `messages` and read back as
     history, and the run counter that caps usage lives in the same database.
     Without a row there is nowhere to put any of it, and answering anyway
     would produce a conversation that forgets itself between requests. */
  if (!hasProfile(user)) return profileUnavailable("Agent chat");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const message =
    typeof body === "object" && body !== null && "message" in body
      ? String((body as { message: unknown }).message ?? "")
      : "";
  const stream =
    typeof body === "object" && body !== null && (body as { stream?: unknown }).stream === true;

  const checked = validateAttachments(
    typeof body === "object" && body !== null ? (body as { attachments?: unknown }).attachments : undefined,
  );
  if ("error" in checked) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const { attachments } = checked;

  const trimmed = message.trim();
  if (trimmed.length === 0 && attachments.length === 0) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message is longer than ${MAX_MESSAGE_LENGTH} characters` },
      { status: 400 },
    );
  }

  if (stream) {
    const userId = user.userId;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ChatStreamEvent) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            /* The reader went away; the run still finishes and is saved. */
          }
        };
        try {
          const conversationId = await ensureConversation({ userId, surface: "web" });
          const { reply, runId, sources } = await runAgent({
            userId,
            conversationId,
            message: trimmed,
            surface: "web",
            sessionWallet: user.walletAddress,
            solanaAddress: user.solanaAddress,
            attachments,
            onEvent: send,
          });
          send({ type: "done", reply, runId, sources });
        } catch (error) {
          if (error instanceof UsageLimitError) {
            send({ type: "error", message: error.message });
          } else {
            console.error("[agent/chat]", error);
            send({ type: "error", message: "The agent could not complete that request." });
          }
        } finally {
          try {
            controller.close();
          } catch {
            /* Already closed by a disconnect. */
          }
        }
      },
    });

    return new Response(body, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
        /* Proxies that buffer would hold every delta until the end. */
        "x-accel-buffering": "no",
      },
    });
  }

  try {
    const conversationId = await ensureConversation({
      userId: user.userId,
      surface: "web",
    });

    const { reply, runId, sources } = await runAgent({
      userId: user.userId,
      conversationId,
      message: trimmed,
      surface: "web",
      sessionWallet: user.walletAddress,
      solanaAddress: user.solanaAddress,
      attachments,
    });

    return NextResponse.json({ reply, runId, conversationId, sources });
  } catch (error) {
    if (error instanceof UsageLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    /* The real error goes to the server log; the client gets a sentence. An
       upstream message can carry a key fragment or an internal hostname. */
    console.error("[agent/chat]", error);
    return NextResponse.json(
      { error: "The agent could not complete that request." },
      { status: 500 },
    );
  }
}
