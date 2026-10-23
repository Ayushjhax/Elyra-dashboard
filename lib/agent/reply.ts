import type { ChatStreamEvent } from "@/lib/agent/events";
import type { PreparedAction } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   Turning the agent's stream into the reply bubble — the one rule the
   website (lib/agentChat.ts) and the Android app (mobile/src/lib/agentChat.ts)
   both follow, so the two cannot disagree about what an answer says.

   - `text` deltas build the draft, and the bubble shows it as it is written.
   - `tools` sets the draft aside: those words were the model choosing what to
     read, not its answer. The bubble says what is being read instead.
   - `prepared_action` attaches the server's preview to the reply.
   - `done` replaces everything with the reply the server kept, and its
     sources; `error` replaces it with the server's sentence.
   - A stream that ends without either keeps what arrived and says it was cut
     short. A request that never got an answer says so.

   Pure: no store and no network. The caller applies each update.
--------------------------------------------------------------------------- */

export type ReplyUpdate =
  /** The draft so far, while it is being written. */
  | { kind: "text"; text: string }
  /** The model is reading; `activity` is "portfolio holdings, funding rate". */
  | { kind: "reading"; activity: string }
  | { kind: "action"; action: PreparedAction; id: string | null }
  /** The reply is finished. `failed` when it is an error, not an answer. */
  | { kind: "settled"; text: string; sources: string[]; failed: boolean };

/** The words the working line shows for a set of tool labels. */
export function activityFor(labels: readonly string[]): string {
  return labels.join(", ").toLowerCase();
}

/** "Reading portfolio holdings…", or the generic line before any tool runs. */
export function workingLine(activity: string | undefined): string {
  return activity ? `Reading ${activity}…` : "Elyra is working…";
}

export interface ReplyFold {
  /** Whether a `done` or `error` has arrived. */
  readonly finished: boolean;
  /** One streamed event, as the update the bubble needs; null for none. */
  event(event: ChatStreamEvent): ReplyUpdate | null;
  /** The stream ended. An update only when it ended without an answer. */
  ended(): ReplyUpdate | null;
  /** The connection failed partway, or before anything arrived. */
  dropped(): ReplyUpdate;
}

export function createReplyFold(): ReplyFold {
  let draft = "";
  let finished = false;

  const settle = (text: string, sources: string[], failed: boolean): ReplyUpdate => {
    finished = true;
    return { kind: "settled", text, sources, failed };
  };

  return {
    get finished() {
      return finished;
    },
    event(event) {
      if (finished) return null;
      switch (event.type) {
        case "text":
          draft += event.delta;
          return { kind: "text", text: draft };
        case "tools":
          draft = "";
          return { kind: "reading", activity: activityFor(event.labels) };
        case "prepared_action":
          return { kind: "action", action: event.action, id: event.id };
        case "done":
          return settle(event.reply, event.sources, false);
        case "error":
          return settle(event.message, [], true);
        default:
          /* An event a newer server sends that this build does not know. */
          return null;
      }
    },
    ended() {
      if (finished) return null;
      return draft.length > 0
        ? settle(`${draft}\n\n(The connection closed before the answer finished.)`, [], true)
        : settle("The connection closed before an answer arrived.", [], true);
    },
    dropped() {
      return draft.length > 0
        ? settle(`${draft}\n\n(The connection dropped before the answer finished.)`, [], true)
        : settle("Could not reach the agent. Check your connection.", [], true);
    },
  };
}
