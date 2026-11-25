import type { PreparedAction } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   What /api/agent/chat streams, one JSON object per line — shared by the
   route, the website and the Android app, so a new event cannot reach one
   reader and not the other.

   Pure types. The run itself is in lib/agent, which is server-only.
--------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   The team.

   On the web a question is answered by a small team around one shared board
   (lib/agent/team): Research gathers the live figures, Strategy reads them
   against the person's saved rules and reviews what Research missed,
   Execution checks a capital move the server prepared, and the orchestrator
   writes the one reply. These are the shapes the person sees it through.
--------------------------------------------------------------------------- */

/** The specialists, in the order they work. */
export type TeamAgentId = "research" | "strategy" | "execution";

/** Where one specialist is in its task. */
export type TeamStageStatus = "queued" | "working" | "done" | "skipped" | "failed";

export interface TeamStage {
  id: TeamAgentId;
  /** What the orchestrator gave it, in one sentence — or why it sat out. */
  task: string;
  status: TeamStageStatus;
  /** What it is reading right now, while it works. */
  activity?: string;
  /** What it put on the shared board. Model-written notes, shown as such. */
  brief?: string;
}

/** The orchestrator's check on the finished reply. Computed by code. */
export interface TeamReview {
  /** Figures in the reply. */
  checked: number;
  /** Figures that match nothing a tool returned or the account context held. */
  untraced: string[];
  /** One line per hand-off: what each member checked of the one before. */
  notes: string[];
}

/** The shared board one question is worked on, as the person sees it. */
export interface TeamTrace {
  /** The question, as the objective every member works toward. */
  objective: string;
  stages: TeamStage[];
  /** The person's saved rules, which every member is held to. */
  constraints: string[];
  /** Outcomes of the person's own recent actions, read back as feedback. */
  outcomes: string[];
  review: TeamReview | null;
}

/**
 * What a run reports while it works.
 *
 * `text` is the model's words as it writes them. `tools` means the turn so
 * far was the model deciding what to look up, not its answer: the surface
 * should set that text aside and show what is being read. The finished
 * reply — which may differ, on a timeout or a failure — comes back from
 * `runAgent` itself and is the one to keep.
 *
 * The `team_` events come only from a team run, which only the website asks
 * for. A reader that does not know them ignores them.
 */
export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tools"; labels: string[] }
  /** The orchestrator's allocation, before anyone works. */
  | { type: "team_plan"; plan: Omit<TeamTrace, "review"> }
  /** One member started, is reading something, finished, or sat out. */
  | { type: "team_stage"; agent: TeamAgentId; status: TeamStageStatus; activity?: string; brief?: string }
  /** The check on the finished reply, sent before `done`. */
  | { type: "team_review"; review: TeamReview };

export type ChatStreamEvent =
  | AgentEvent
  /** A request to move capital became a server-built preview. `id` is the
      stored action a review card finishes; null when the preview is not
      ready and was not stored, in which case it carries its reason. */
  | { type: "prepared_action"; action: PreparedAction; id: string | null }
  | { type: "done"; reply: string; runId: string; sources: string[] }
  | { type: "error"; message: string };
