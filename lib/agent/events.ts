import type { PreparedAction } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   What /api/agent/chat streams, one JSON object per line — shared by the
   route, the website and the Android app, so a new event cannot reach one
   reader and not the other.

   Pure types. The run itself is in lib/agent, which is server-only.
--------------------------------------------------------------------------- */

/**
 * What a run reports while it works.
 *
 * `text` is the model's words as it writes them. `tools` means the turn so
 * far was the model deciding what to look up, not its answer: the surface
 * should set that text aside and show what is being read. The finished
 * reply — which may differ, on a timeout or a failure — comes back from
 * `runAgent` itself and is the one to keep.
 */
export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tools"; labels: string[] };

export type ChatStreamEvent =
  | AgentEvent
  /** A request to move capital became a server-built preview. `id` is the
      stored action a review card finishes; null when the preview is not
      ready and was not stored, in which case it carries its reason. */
  | { type: "prepared_action"; action: PreparedAction; id: string | null }
  | { type: "done"; reply: string; runId: string; sources: string[] }
  | { type: "error"; message: string };
