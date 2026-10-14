"use client";

import type { ChatStreamEvent } from "@/app/api/agent/chat/route";
import { nextMessageId, useElyraStore } from "@/lib/store";

/* ---------------------------------------------------------------------------
   Talking to the agent, from the browser.

   Module-level rather than inside a panel, for the reason the conversation
   lives in the store: the agent panel is a column from 1280px and a drawer
   below it, and either can be closed mid-request. Out here the request runs
   to the end whatever is or is not mounted, and any panel that opens later
   reads the finished message from the store.

   Files staged in the composer travel with the question as `attachments`
   and are cleared from it; the conversation keeps only their names and an
   image's thumbnail, for this session.

   The reply streams. The route sends newline-delimited events as the model
   writes: text as it is generated, a `tools` event when the model goes to
   read something — the words before it were the model deciding what to look
   up, so they are set aside and the bubble says what is being read — and a
   final `done` whose reply is the one kept, with the sources the tools
   actually returned.
--------------------------------------------------------------------------- */

/** Privy's token getter, handed in by the caller: only a hook can reach it. */
export type TokenGetter = () => Promise<string | null>;

/** Reads NDJSON events off a response body as they arrive. */
async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) {
        try {
          yield JSON.parse(line) as ChatStreamEvent;
        } catch {
          /* A malformed line is skipped rather than ending the answer. */
        }
      }
      newline = buffer.indexOf("\n");
    }
  }
  const tail = (buffer + decoder.decode()).trim();
  if (tail.length > 0) {
    try {
      yield JSON.parse(tail) as ChatStreamEvent;
    } catch {
      /* Ignored, as above. */
    }
  }
}

/**
 * Ask the agent. Appends the question and an empty reply bubble at once, so
 * the panel can show the agent working in the place its answer will land.
 *
 * No user identifier is sent: the route derives it from the token and ignores
 * anything the body claims.
 */
export async function sendToAgent(raw: string, getToken: TokenGetter): Promise<void> {
  const text = raw.trim();
  const store = useElyraStore.getState();
  /* Whatever is staged in the composer goes with the question, however it
     was asked — the files are on screen beside it. */
  const files = store.composerAttachments;
  if ((text.length === 0 && files.length === 0) || store.agentPending) return;

  store.appendMessage({
    id: nextMessageId("user"),
    role: "user",
    text,
    at: new Date().toISOString(),
    ...(files.length > 0
      ? { attachments: files.map((file) => ({ name: file.name, kind: file.kind, previewUrl: file.previewUrl })) }
      : {}),
  });
  store.setComposerDraft("");
  store.clearComposerAttachments();

  const replyId = nextMessageId("agent");
  store.appendMessage({ id: replyId, role: "agent", text: "", at: new Date().toISOString() });
  store.setAgentPending(true);

  const patch = useElyraStore.getState().patchMessage;
  const setStreamingId = useElyraStore.getState().setStreamingId;
  let draft = "";
  let finished = false;

  const settle = (reply: string, sources: string[] = []) => {
    finished = true;
    patch(replyId, {
      text: reply,
      sources,
      activity: undefined,
      /* Stamped when the answer arrived, not when it was asked for. */
      at: new Date().toISOString(),
    });
  };

  try {
    const token = await getToken();
    const response = await fetch("/api/agent/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        /* Sent explicitly rather than relying on Privy's cookie, so this works
           regardless of how cookies are configured for the app. */
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message: text,
        stream: true,
        ...(files.length > 0
          ? { attachments: files.map((file) => ({ name: file.name, mediaType: file.mediaType, data: file.data })) }
          : {}),
      }),
    });

    const streamed = (response.headers.get("content-type") ?? "").includes("ndjson");
    if (!response.ok || !streamed || response.body === null) {
      /* Refused before the stream opened — signed out, no database, a bad
         message — or a server that answered whole. */
      const payload = (await response.json().catch(() => null)) as
        | { reply?: string; error?: string; sources?: string[] }
        | null;
      settle(
        response.ok
          ? (payload?.reply ?? "No reply came back.")
          : (payload?.error ?? "The agent could not complete that request."),
        payload?.sources ?? [],
      );
    } else {
      for await (const event of events(response.body)) {
        if (event.type === "text") {
          draft += event.delta;
          setStreamingId(replyId);
          patch(replyId, { text: draft, activity: undefined });
        } else if (event.type === "tools") {
          /* What came before was the model choosing what to read. */
          draft = "";
          setStreamingId(null);
          patch(replyId, { text: "", activity: event.labels.join(", ").toLowerCase() });
        } else if (event.type === "done") {
          settle(event.reply, event.sources);
        } else if (event.type === "error") {
          settle(event.message);
        }
      }
      if (!finished) {
        settle(draft.length > 0 ? `${draft}\n\n(The connection closed before the answer finished.)` : "The connection closed before an answer arrived.");
      }
    }
  } catch {
    settle(
      draft.length > 0
        ? `${draft}\n\n(The connection dropped before the answer finished.)`
        : "Could not reach the agent. Check your connection.",
    );
  } finally {
    const settled = useElyraStore.getState();
    settled.setStreamingId(null);
    settled.setAgentPending(false);
  }
}
