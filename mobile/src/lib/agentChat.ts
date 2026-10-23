import type { ChatStreamEvent } from "@/lib/agent/events";
import { createReplyFold, type ReplyUpdate } from "@/lib/agent/reply";
import type { AttachmentPayload } from "@/lib/attachments";
import type { ChatMessage } from "@/lib/types";
import { ApiError, streamNdjson } from "~/lib/api";
import { useAppStore } from "~/lib/store";

/* ---------------------------------------------------------------------------
   Talking to the agent — the website's lib/agentChat.ts, for the app.

   Module-level rather than inside the chat screen, for the reason the
   conversation lives in the store: the screen can be left mid-answer — a
   tab switch, a review card opened, the app sent to the background — and
   the request runs to the end whatever is mounted. Coming back shows the
   finished message.

   The reply streams over expo/fetch (lib/api.ts), and each event changes the
   bubble the way lib/agent/reply.ts says, the same rule the website follows:
   text as it is written, "Reading portfolio holdings…" while tools run, the
   server's finished reply and its sources at the end.

   One request at a time. Files staged in the composer travel with the
   question and are cleared from it; the conversation keeps only their names
   and an image's thumbnail. A failed reply can be retried: its question and
   files are held here, in memory, for this session only.
--------------------------------------------------------------------------- */

/** The request in flight, so an account change can stop it. */
let active: AbortController | null = null;

/** What a failed reply asked, so it can be asked again. Never on disk. */
const retryable = new Map<string, { text: string; files: AttachmentPayload[] }>();

let counter = 0;
function nextId(role: "user" | "agent"): string {
  counter += 1;
  return `${role}_${Date.now().toString(36)}_${counter}`;
}

/**
 * Ends the conversation: stops a reply still arriving and clears the
 * transcript, the draft and anything staged. Run when the account it
 * belonged to signs out or another signs in.
 */
export function endConversation(): void {
  active?.abort();
  active = null;
  retryable.clear();
  useAppStore.getState().clearConversation();
}

/** Streams one question into the reply bubble `replyId`. */
async function run(replyId: string, text: string, files: AttachmentPayload[]): Promise<void> {
  const store = useAppStore.getState();
  store.setAgentPending(true);
  const controller = new AbortController();
  active = controller;

  /* After `endConversation` nothing here may write: the transcript belongs
     to an account that is no longer signed in. */
  const alive = () => !controller.signal.aborted;
  const patch = (next: Parameters<typeof store.patchMessage>[1]) => {
    if (alive()) useAppStore.getState().patchMessage(replyId, next);
  };
  const streaming = (on: boolean) => {
    if (alive()) useAppStore.getState().setStreamingId(on ? replyId : null);
  };

  const fold = createReplyFold();
  const apply = (update: ReplyUpdate | null) => {
    if (update === null) return;
    switch (update.kind) {
      case "text":
        streaming(true);
        patch({ text: update.text, activity: undefined });
        break;
      case "reading":
        streaming(false);
        patch({ text: "", activity: update.activity });
        break;
      case "action":
        patch({ preparedAction: update.action, preparedActionId: update.id });
        break;
      case "settled":
        if (update.failed) retryable.set(replyId, { text, files });
        else retryable.delete(replyId);
        patch({
          text: update.text,
          sources: update.sources,
          activity: undefined,
          failed: update.failed ? true : undefined,
          /* Stamped when the answer arrived, not when it was asked for. */
          at: new Date().toISOString(),
        });
        break;
    }
  };

  try {
    const events = streamNdjson<ChatStreamEvent>("/api/agent/chat", {
      method: "POST",
      signal: controller.signal,
      body: { message: text, stream: true, ...(files.length > 0 ? { attachments: files } : {}) },
    });
    for await (const event of events) apply(fold.event(event));
    apply(fold.ended());
  } catch (error) {
    if (alive() && !fold.finished) {
      /* Refused before the stream opened — the server's own sentence (a bad
         attachment, the usage limit) — or the connection failed. */
      apply(
        error instanceof ApiError && error.status > 0
          ? fold.event({ type: "error", message: error.message })
          : fold.dropped(),
      );
    }
  } finally {
    if (active === controller) active = null;
    if (alive()) {
      const settled = useAppStore.getState();
      settled.setStreamingId(null);
      settled.setAgentPending(false);
    }
  }
}

/**
 * Ask the agent. Appends the question and an empty reply bubble at once, so
 * the screen shows the agent working where its answer will land.
 *
 * No user identifier is sent: the API derives it from the token.
 */
export async function sendToAgent(raw: string): Promise<void> {
  const text = raw.trim();
  const store = useAppStore.getState();
  const staged = store.composerAttachments;
  if ((text.length === 0 && staged.length === 0) || store.agentPending) return;

  store.appendMessage({
    id: nextId("user"),
    role: "user",
    text,
    at: new Date().toISOString(),
    ...(staged.length > 0
      ? { attachments: staged.map((file) => ({ name: file.name, kind: file.kind, previewUrl: file.previewUrl })) }
      : {}),
  });
  store.setComposerDraft("");
  store.clearComposerAttachments();

  const replyId = nextId("agent");
  store.appendMessage({ id: replyId, role: "agent", text: "", at: new Date().toISOString() });
  await run(
    replyId,
    text,
    staged.map((file) => ({ name: file.name, mediaType: file.mediaType, data: file.data })),
  );
}

/** Whether a failed reply still has its question to ask again. */
export function canRetry(replyId: string): boolean {
  return retryable.has(replyId);
}

/** Asks a failed reply's question again, into the same bubble. */
export async function retryReply(replyId: string): Promise<void> {
  const saved = retryable.get(replyId);
  if (saved === undefined || useAppStore.getState().agentPending) return;
  retryable.delete(replyId);
  useAppStore.getState().patchMessage(replyId, {
    text: "",
    failed: undefined,
    sources: undefined,
    activity: undefined,
    preparedAction: undefined,
    preparedActionId: undefined,
  });
  await run(replyId, saved.text, saved.files);
}

/**
 * A question the app answered itself — a shortcut that started a report,
 * say — kept in the conversation beside the agent's answers.
 */
export function appendExchange(question: string, reply: Omit<ChatMessage, "id" | "role" | "at">): void {
  const store = useAppStore.getState();
  const at = new Date().toISOString();
  store.appendMessage({ id: nextId("user"), role: "user", text: question, at });
  store.appendMessage({ id: nextId("agent"), role: "agent", at, ...reply });
}
