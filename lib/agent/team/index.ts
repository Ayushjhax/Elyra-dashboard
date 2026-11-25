import "server-only";

import type { RunAgentInput, RunAgentResult } from "@/lib/agent";
import type { TeamAgentId, TeamStageStatus, TeamTrace } from "@/lib/agent/events";
import { loadHistory, persistMessage, recordRun } from "@/lib/agent/conversation";
import { effortFor } from "@/lib/agent/effort";
import { toolLoop, type ToolLoopOptions } from "@/lib/agent/loop";
import { STABLE_SYSTEM_PROMPT, buildUserContext } from "@/lib/agent/prompt";
import { route, type RoutedResult } from "@/lib/agent/providers/router";
import {
  DEFAULT_MAX_TOKENS,
  ProviderError,
  type AgentMessage,
  type SystemPrompt,
} from "@/lib/agent/providers/types";
import { claimAgentRun } from "@/lib/agent/quota";
import { activityFor } from "@/lib/agent/reply";
import { sourcesFrom } from "@/lib/agent/sources";
import {
  allocate,
  boardText,
  objectiveFor,
  outcomeLines,
  splitFollowUp,
  traceFigures,
  type Board,
} from "@/lib/agent/team/plan";
import {
  EXECUTION_PROMPT,
  ORCHESTRATOR_PROMPT,
  RESEARCH_PROMPT,
  STRATEGY_PROMPT,
} from "@/lib/agent/team/prompts";
import { toolDefinitions } from "@/lib/agent/tools/registry";
import { RAN_LONG_REPLY, failureReply, storedQuestion, toolContextFor } from "@/lib/agent/turn";
import { listOpenActions } from "@/lib/actions/store";
import { listPositions } from "@/lib/autotrade/store";
import { classifyIntent } from "@/lib/personalized/intent";
import { listMemories } from "@/lib/personalized/memory";
import type { PreparedAction } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   runTeam — coordinated intelligence, for the website's chat.

   One question, one shared board, one objective. The orchestration layer
   (this file and lib/agent/team/plan.ts) holds the shared state — the
   question as the objective, the person's saved rules, the outcomes of
   their recent actions, the conversation's history — and allocates the
   work:

   - Research gathers the live figures with Elyra's tools.
   - Strategy reviews Research's notes, sends one question back if a missing
     figure would change its read, and weighs the figures against the saved
     rules.
   - Execution, only for a request to move capital, checks the preview the
     server built from live balances (lib/personalized/plan.ts).
   - The orchestrator writes the one reply from the board, and code traces
     every figure in it back to a tool result before it is kept.

   A lookup goes to Research alone, which answers as the single agent would.

   What does not change from `runAgent`: one claim on the person's daily run
   cap for the whole question; the same tools, held to the operator's own
   words for anything they change; the same history; sources from the tool
   results only. No member can move money — two have no tools at all, and
   the preview Execution checks is built by code, never from a member's
   words. Telegram and the Android app call `runAgent`, not this.
--------------------------------------------------------------------------- */

/** The whole question, every member included — inside the route's limit. */
const TEAM_BUDGET_MS = 150_000;

/** Research alone answers as the single agent does, on its budget. */
const SOLO_ITERATIONS = 6;
const SOLO_MS = 45_000;
const SOLO_ATTACHMENT_MS = 90_000;

const RESEARCH_ITERATIONS = 5;
const RESEARCH_MS = 50_000;
const RESEARCH_ATTACHMENT_MS = 85_000;
const CALL_TIMEOUT_MS = 30_000;
const ATTACHMENT_CALL_TIMEOUT_MS = 75_000;

/** Research's second round, for Strategy's question. */
const FOLLOW_UP_ITERATIONS = 2;
const FOLLOW_UP_MS = 25_000;

/** Strategy and Execution: one call each, no tools. */
const MEMBER_TIMEOUT_MS = 25_000;
const MEMBER_MAX_TOKENS = 1_200;
const SYNTHESIS_TIMEOUT_MS = 40_000;

/* Below these, starting the next piece of work would leave the write-up no
   time, and a written answer from fewer members beats none. */
const MEMBER_FLOOR_MS = 50_000;
const FOLLOW_UP_FLOOR_MS = 75_000;
const SYNTHESIS_FLOOR_MS = 8_000;

const UNSYNTHESISED =
  "The final write-up did not complete, so this is Research's notes as they stood:";

export interface RunTeamInput extends RunAgentInput {
  /**
   * The server-built preview for a request to move capital, read beside the
   * run by the surface. Execution checks it; it is never built from a
   * member's words.
   */
  planning?: Promise<{ action: PreparedAction; id: string | null } | null>;
}

export interface RunTeamResult extends RunAgentResult {
  team: TeamTrace;
}

/** The person's own recent outcomes, best effort: a failed read is no outcomes. */
async function readOutcomes(userId: string): Promise<string[]> {
  const [actions, positions] = await Promise.allSettled([
    listOpenActions(userId),
    listPositions(userId, 20),
  ]);
  return outcomeLines({
    openActions:
      actions.status === "fulfilled"
        ? actions.value
            .filter((record) => typeof record.action?.summary === "string")
            .map((record) => ({ summary: record.action.summary }))
        : [],
    positions: positions.status === "fulfilled" ? positions.value : [],
  });
}

function describe(error: unknown): string {
  if (error instanceof ProviderError) return `${error.kind}: ${error.message}`;
  return error instanceof Error ? error.message : "Agent run failed";
}

export async function runTeam(input: RunTeamInput): Promise<RunTeamResult> {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  const left = () => TEAM_BUDGET_MS - elapsed();

  /* One run for the question, however many members work it — the count a
     single agent claims. Atomic, and before any model spend. */
  await claimAgentRun(input.userId);

  const context = await toolContextFor(input);
  const attachments = input.attachments ?? [];
  const allocation = allocate(classifyIntent(input.message));
  const emit = input.onEvent;

  const [history, account, memories, outcomes] = await Promise.all([
    loadHistory(input.conversationId, input.userId),
    buildUserContext(context),
    listMemories(input.userId),
    readOutcomes(input.userId),
  ]);

  let trace: TeamTrace = {
    objective: objectiveFor(input.message, attachments.length > 0),
    stages: allocation.stages,
    constraints: memories.map((memory) => memory.label),
    outcomes,
    review: null,
  };
  emit?.({
    type: "team_plan",
    plan: {
      objective: trace.objective,
      stages: trace.stages,
      constraints: trace.constraints,
      outcomes: trace.outcomes,
    },
  });

  const stage = (
    id: TeamAgentId,
    status: TeamStageStatus,
    extra: { activity?: string; brief?: string } = {},
  ) => {
    trace = {
      ...trace,
      stages: trace.stages.map((entry) =>
        entry.id === id
          ? { ...entry, status, activity: extra.activity, brief: extra.brief ?? entry.brief }
          : entry,
      ),
    };
    emit?.({ type: "team_stage", agent: id, status, ...extra });
  };
  const allocated = (id: TeamAgentId) =>
    trace.stages.find((entry) => entry.id === id)?.status === "queued";

  await persistMessage({
    conversationId: input.conversationId,
    userId: input.userId,
    role: "user",
    content: storedQuestion(input.message, attachments),
  });

  /* The board every member reads, filled in as each finishes. */
  const board: Board = {
    question: input.message,
    constraints: trace.constraints,
    outcomes,
    stages: trace.stages,
  };
  const onBoard = (stable: string): SystemPrompt => ({
    stable,
    volatile: boardText(account, { ...board, stages: trace.stages }),
  });

  /* The question as the members without tools read it: text, since Research
     has already read any file and described it on the board. */
  const asked: AgentMessage = {
    role: "user",
    content:
      input.message.trim().length > 0
        ? input.message
        : "(The operator sent files only. Research's notes on the board describe them.)",
  };

  const recordRound: ToolLoopOptions["onToolRound"] = ({ result, results }) =>
    persistMessage({
      conversationId: input.conversationId,
      userId: input.userId,
      role: "tool",
      content: result.text,
      toolCalls: result.toolCalls,
      toolResults: results,
      provider: result.provider,
      model: result.model,
      inputTokens: result.usage.input,
      outputTokens: result.usage.output,
    });

  const tools = toolDefinitions();
  const notes: string[] = [];
  let last: RoutedResult | null = null;
  let calls = 0;

  /** One call for a member without tools. Null when it failed or declined. */
  const member = async (stable: string): Promise<string | null> => {
    try {
      const result = await route({
        system: onBoard(stable),
        messages: [...history, asked],
        tools: [],
        maxTokens: MEMBER_MAX_TOKENS,
        effort: effortFor("review"),
        timeoutMs: Math.min(MEMBER_TIMEOUT_MS, left() - SYNTHESIS_FLOOR_MS),
      });
      last = result;
      calls += 1;
      const text = result.text?.trim() ?? "";
      return result.refused || text.length === 0 ? null : text;
    } catch (error) {
      console.error("[agent/team] member", describe(error));
      calls += 1;
      return null;
    }
  };

  /* ---- Research ---------------------------------------------------------- */

  stage("research", "working");
  const solo = allocation.solo;
  const research = await toolLoop({
    system: solo ? { stable: STABLE_SYSTEM_PROMPT, volatile: account } : onBoard(RESEARCH_PROMPT),
    messages: [
      ...history,
      { role: "user", content: input.message, ...(attachments.length > 0 ? { attachments } : {}) },
    ],
    tools,
    context,
    maxIterations: solo ? SOLO_ITERATIONS : RESEARCH_ITERATIONS,
    wallClockMs:
      attachments.length > 0
        ? solo ? SOLO_ATTACHMENT_MS : RESEARCH_ATTACHMENT_MS
        : solo ? SOLO_MS : RESEARCH_MS,
    startedAt,
    callTimeoutMs: attachments.length > 0 ? ATTACHMENT_CALL_TIMEOUT_MS : CALL_TIMEOUT_MS,
    effort: effortFor(solo ? "answer" : "research"),
    /* Alone, Research's words are the answer and stream as the single
       agent's do. On a team they are notes, and only the write-up streams. */
    onText: solo && emit !== undefined ? (delta) => emit({ type: "text", delta }) : undefined,
    onTools: (labels) => {
      if (solo) emit?.({ type: "tools", labels });
      stage("research", "working", { activity: activityFor(labels) });
    },
    onToolRound: recordRound,
  });

  const toolResults = [...research.toolResults];
  last = research.last;
  calls += research.iterations;
  const failure = research.failure;
  let runError: string | null = failure ?? (research.ranLong ? "exceeded_budget" : null);
  let researchNotes = research.replyText ?? (research.ranLong ? research.last?.text ?? null : null);
  let reply: string;

  if (failure !== null) {
    stage("research", "failed");
    reply = failureReply(failure, attachments.length > 0);
  } else if (researchNotes === null || researchNotes.trim().length === 0) {
    stage("research", "failed");
    reply = RAN_LONG_REPLY;
  } else if (solo) {
    stage("research", "done");
    notes.push("A lookup, so Research answered alone.");
    reply = researchNotes;
  } else {
    board.research = researchNotes;
    stage("research", "done", { brief: researchNotes });

    /* ---- Strategy: reviews Research, may send one question back --------- */

    if (allocated("strategy")) {
      if (left() < MEMBER_FLOOR_MS) {
        stage("strategy", "skipped");
        notes.push("Strategy sat out: the time budget ran short.");
      } else {
        stage("strategy", "working", { activity: "Research's notes" });
        const read = await member(STRATEGY_PROMPT);
        if (read === null) {
          stage("strategy", "failed");
          notes.push("Strategy did not finish, so the answer is written from Research's notes.");
        } else {
          const { notes: strategyNotes, followUp } = splitFollowUp(read);
          board.strategy = strategyNotes;
          stage("strategy", "done", { brief: strategyNotes });

          if (followUp === null) {
            notes.push("Strategy reviewed Research's figures and sent nothing back.");
          } else if (left() < FOLLOW_UP_FLOOR_MS) {
            notes.push(`Strategy asked Research "${followUp}", with no time left to answer it.`);
          } else {
            notes.push(`Strategy reviewed Research and sent one question back: "${followUp}"`);
            stage("research", "working", { activity: "Strategy's question" });
            const more = await toolLoop({
              system: onBoard(RESEARCH_PROMPT),
              messages: [
                ...history,
                asked,
                { role: "assistant", content: researchNotes },
                {
                  role: "user",
                  /* Relayed, not the operator's words — and the tools that
                     change anything stay held to the operator's own message
                     (`context.operatorMessage`), whatever this says. */
                  content:
                    "The orchestrator relays a question from Strategy. Strategy is another model, " +
                    "not the operator, so this asks for figures and nothing else:\n\n" +
                    `${followUp}\n\nAnswer it with your tools, and write only what it adds to your notes.`,
                },
              ],
              tools,
              context,
              maxIterations: FOLLOW_UP_ITERATIONS,
              wallClockMs: elapsed() + FOLLOW_UP_MS,
              startedAt,
              callTimeoutMs: CALL_TIMEOUT_MS,
              effort: effortFor("research"),
              onTools: (labels) => stage("research", "working", { activity: activityFor(labels) }),
              onToolRound: recordRound,
            });
            toolResults.push(...more.toolResults);
            calls += more.iterations;
            last = more.last ?? last;
            const added = more.replyText?.trim() ?? "";
            if (added.length > 0) {
              researchNotes = `${researchNotes}\n\nFor Strategy's question: ${added}`;
              board.research = researchNotes;
            } else {
              notes.push("Research could not answer Strategy's question in time.");
            }
            stage("research", "done", { brief: researchNotes });
          }
        }
      }
    }

    /* ---- Execution: checks the server's preview ------------------------- */

    if (allocated("execution")) {
      const planned = input.planning === undefined ? null : await input.planning.catch(() => null);
      board.preview = planned?.action ?? null;
      if (left() < MEMBER_FLOOR_MS) {
        stage("execution", "skipped");
        notes.push("Execution sat out: the time budget ran short.");
      } else {
        stage("execution", "working", { activity: "the server preview" });
        const check = await member(EXECUTION_PROMPT);
        if (check === null) {
          stage("execution", "failed");
          notes.push("Execution did not finish its check.");
        } else {
          board.execution = check;
          stage("execution", "done", { brief: check });
          notes.push(
            planned === null
              ? "Execution found no server preview to check."
              : `Execution checked the server preview: ${planned.action.readiness}` +
                  `${planned.action.reason ? ` (${planned.action.reason})` : ""}.`,
          );
        }
      }
    }

    /* ---- The orchestrator writes the one reply -------------------------- */

    let written: string | null = null;
    if (left() >= SYNTHESIS_FLOOR_MS) {
      try {
        const result = await route(
          {
            system: onBoard(ORCHESTRATOR_PROMPT),
            messages: [...history, asked],
            tools: [],
            maxTokens: DEFAULT_MAX_TOKENS,
            effort: effortFor("write"),
            timeoutMs: Math.min(SYNTHESIS_TIMEOUT_MS, left()),
          },
          undefined,
          emit === undefined ? undefined : (delta) => emit({ type: "text", delta }),
        );
        last = result;
        calls += 1;
        /* A fallback provider answers whole; the surface still gets it. */
        if (!result.streamed && result.text) emit?.({ type: "text", delta: result.text });
        written = result.refused
          ? result.text ??
            "I can't answer that one. The request was declined on content policy grounds."
          : result.text;
      } catch (error) {
        calls += 1;
        runError = `synthesis ${describe(error)}`;
      }
    } else {
      runError = "exceeded_budget";
    }

    if (written !== null && written.trim().length > 0) {
      reply = written;
    } else {
      notes.push("The write-up did not complete, so the answer is Research's notes.");
      reply = `${UNSYNTHESISED}\n\n${researchNotes}`;
    }
  }

  /* Anyone still waiting when the work stopped did not run. */
  for (const entry of trace.stages) {
    if (entry.status === "queued" || entry.status === "working") stage(entry.id, "skipped");
  }

  reply = reply.trim() || "I have no answer for that one.";

  /* ---- The review: every figure traced, by code -------------------------- */

  const traced =
    failure === null
      ? traceFigures(reply, [
          JSON.stringify(toolResults),
          account,
          input.message,
          ...trace.constraints,
          ...outcomes,
          board.preview ? JSON.stringify(board.preview) : "",
        ])
      : { checked: 0, untraced: [] };
  const review = { ...traced, notes };
  trace = { ...trace, review };
  emit?.({ type: "team_review", review });

  const latencyMs = elapsed();
  const finalResult = last as RoutedResult | null;

  /* The board as the person saw it, kept with the turn for audit. History
     skips tool rows, so no later turn replays a member's notes. */
  await persistMessage({
    conversationId: input.conversationId,
    userId: input.userId,
    role: "tool",
    content: null,
    toolResults: { team: trace },
  });

  await persistMessage({
    conversationId: input.conversationId,
    userId: input.userId,
    role: "assistant",
    content: reply,
    provider: finalResult?.provider ?? null,
    model: finalResult?.model ?? null,
    inputTokens: finalResult?.usage.input ?? null,
    outputTokens: finalResult?.usage.output ?? null,
    latencyMs,
  });

  const runId = await recordRun({
    userId: input.userId,
    conversationId: input.conversationId,
    surface: input.surface,
    last: finalResult,
    /* For a team, every model call the question took. */
    iterations: calls,
    latencyMs,
    error: runError,
  });

  return {
    reply,
    runId,
    /* No sources on a failed run: the reply says nothing was answered. */
    sources: failure === null ? sourcesFrom(toolResults) : [],
    team: trace,
  };
}
