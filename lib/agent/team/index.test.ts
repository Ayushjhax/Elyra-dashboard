import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";
import type { AgentEvent } from "@/lib/agent/events";
import type { PreparedAction } from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   runTeam end to end, with the model and the tools mocked: who works on a
   question, what each reads, the hand-offs, and what is kept.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  anthropic: vi.fn(),
  executeTool: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));

vi.mock("@/lib/exchange/portfolio", () => ({
  getPortfolio: async () => ({ positions: [], equities: [], failures: [] }),
  summarise: () => ({
    equity: 0,
    totalUnrealizedPnl: 0,
    grossExposure: 0,
    netExposure: 0,
    largestPosition: null,
    positionCount: 0,
    venues: [],
    failures: [],
  }),
}));

vi.mock("@/lib/agent/providers/anthropic", () => ({
  anthropicProvider: () => ({ id: "anthropic", model: "claude-sonnet-5", complete: state.anthropic }),
}));
vi.mock("@/lib/agent/providers/gemini", () => ({
  geminiProvider: () => ({ id: "gemini", model: "gemini", complete: vi.fn() }),
}));

/* One market tool, answered from here rather than the network. */
vi.mock("@/lib/agent/tools/registry", () => ({
  toolDefinitions: () => [
    { name: "get_market_snapshot", description: "prices", parameters: { type: "object" } },
  ],
  executeTool: state.executeTool,
}));

const { runTeam } = await import("@/lib/agent/team");
const { UsageLimitError } = await import("@/lib/agent");
const { ProviderError } = await import("@/lib/agent/providers/types");
const { resetCircuitBreaker } = await import("@/lib/agent/providers/router");

const USER = "user-a";

function says(text: string) {
  return {
    text,
    toolCalls: [],
    provider: "anthropic",
    model: "claude-sonnet-5",
    usage: { input: 10, output: 20 },
    refused: false,
    refusalReason: null,
  };
}

function reads(symbols: string[]) {
  return {
    ...says(""),
    text: null,
    toolCalls: [{ id: "t1", name: "get_market_snapshot", arguments: { symbols } }],
  };
}

/** The role each model call was given, read off its system prompt. */
function roles(): string[] {
  return state.anthropic.mock.calls.map(([request]) => {
    const stable = String(request.system.stable);
    const role = /## Your role: ([A-Za-z ]+)/.exec(stable)?.[1]?.trim();
    return role ?? "single agent";
  });
}

const PREVIEW: PreparedAction = {
  id: "p1",
  kind: "swap",
  summary: "Swap 6.2 SOL to USDC",
  fields: [{ label: "Sell", value: "6.2 SOL", derived: true }],
  readiness: "ready",
  reason: null,
  warnings: [],
  preparedAt: "2026-11-17T00:00:00Z",
};

beforeEach(() => {
  resetCircuitBreaker();
  delete process.env.GEMINI_API_KEY;
  process.env.AGENT_MAX_RUNS_PER_DAY = "100";
  state.db = new FakeSupabase();
  state.db.seed("profiles", [{ id: USER, privy_did: "did:privy:a" }]);
  state.db.seed("conversations", [{ id: "conv-a", user_id: USER, surface: "web", telegram_chat_id: null }]);
  state.anthropic.mockReset();
  state.executeTool.mockReset();
  state.executeTool.mockResolvedValue({
    ok: true,
    result: { symbol: "SOL", price: 181.4032, change24hPct: -3.2156, source: "pyth" },
  });
});

function ask(message: string, extra: { planning?: Promise<{ action: PreparedAction; id: string | null } | null> } = {}) {
  const events: AgentEvent[] = [];
  const done = runTeam({
    userId: USER,
    conversationId: "conv-a",
    message,
    surface: "web",
    onEvent: (event) => events.push(event),
    ...extra,
  });
  return { done, events };
}

describe("a lookup", () => {
  it("goes to Research alone, which answers and streams as the single agent does", async () => {
    state.anthropic.mockResolvedValueOnce(says("Your USDC balance is not connected."));

    const { done, events } = ask("what is my USDC balance");
    const result = await done;

    expect(roles()).toEqual(["single agent"]);
    expect(result.reply).toBe("Your USDC balance is not connected.");
    expect(events.filter((event) => event.type === "text")).toHaveLength(1);
    expect(result.team.stages.map((stage) => [stage.id, stage.status])).toEqual([
      ["research", "done"],
      ["strategy", "skipped"],
      ["execution", "skipped"],
    ]);
    expect(result.team.review?.notes).toContain("A lookup, so Research answered alone.");
  });
});

describe("an analysis question", () => {
  const QUESTION = "Am I too exposed to SOL given my limits?";

  it("runs Research, Strategy and the write-up, and streams only the write-up", async () => {
    state.anthropic
      .mockResolvedValueOnce(reads(["SOL"]))
      .mockResolvedValueOnce(says("SOL 181.4032 from Pyth, down 3.2156% on the day."))
      .mockResolvedValueOnce(says("Research has price. Exposure sits under the 25% rule.\nFOLLOW_UP: none"))
      .mockResolvedValueOnce(says("SOL is at $181.40, down 3.2% today."));

    const { done, events } = ask(QUESTION);
    const result = await done;

    expect(roles()).toEqual(["Research", "Research", "Strategy", "the orchestrator"]);
    expect(result.reply).toBe("SOL is at $181.40, down 3.2% today.");

    /* Research's and Strategy's notes are the board's, not the answer's. */
    const streamed = events.flatMap((event) => (event.type === "text" ? [event.delta] : []));
    expect(streamed).toEqual(["SOL is at $181.40, down 3.2% today."]);

    /* Each member reads the one before it on the board. */
    const [, , strategy, synthesis] = state.anthropic.mock.calls.map(([request]) => String(request.system.volatile));
    expect(strategy).toContain("SOL 181.4032 from Pyth");
    expect(synthesis).toContain("Exposure sits under the 25% rule.");
    expect(synthesis).not.toContain("FOLLOW_UP");

    expect(result.team.stages.find((stage) => stage.id === "strategy")).toMatchObject({
      status: "done",
      brief: "Research has price. Exposure sits under the 25% rule.",
    });
    expect(result.team.review).toMatchObject({ checked: 2, untraced: [] });
    expect(result.team.review?.notes).toContain("Strategy reviewed Research's figures and sent nothing back.");
    expect(result.sources).toContain("Pyth");

    /* The plan comes first and the review before the end. */
    expect(events[0].type).toBe("team_plan");
    expect(events.at(-1)?.type).toBe("team_review");
  });

  it("sends Strategy's question back to Research, with the operator's words still the only ones that can change anything", async () => {
    state.anthropic
      .mockResolvedValueOnce(says("SOL 181.4032 from Pyth."))
      .mockResolvedValueOnce(says("Funding is missing.\nFOLLOW_UP: What is SOL funding on Hyperliquid?"))
      .mockResolvedValueOnce(reads(["SOL"]))
      .mockResolvedValueOnce(says("Funding was not returned."))
      .mockResolvedValueOnce(says("SOL is at $181.40; funding is -0.01%."));

    const result = await ask(QUESTION).done;

    expect(roles()).toEqual(["Research", "Strategy", "Research", "Research", "the orchestrator"]);
    /* The loop appends tool rounds to the array the mock holds, so find the
       relayed turn by what it says rather than by position. */
    const relay = (state.anthropic.mock.calls[2][0].messages as Array<{ role: string; content?: unknown }>).find(
      (message) => message.role === "user" && String(message.content).includes("relays"),
    );
    expect(relay?.role).toBe("user");
    expect(relay?.content).toContain("Strategy is another model, not the operator");
    expect(relay?.content).toContain("What is SOL funding on Hyperliquid?");
    expect(state.executeTool.mock.calls[0][2].operatorMessage).toBe(QUESTION);

    expect(result.team.review?.notes[0]).toContain("sent one question back");
    expect(result.team.stages[0].brief).toContain("For Strategy's question: Funding was not returned.");
    /* The write-up's funding figure is in no tool result. */
    expect(result.team.review?.untraced).toEqual(["-0.01%"]);
  });

  it("reads the person's saved rules and recent outcomes onto the board", async () => {
    state.db.seed("personalized_memories", [
      {
        id: "m1",
        user_id: USER,
        type: "concentration_limit",
        key: "concentration_limit",
        value: 25,
        confidence: 1,
        source: "explicit",
        label: "Max 25% in any one asset",
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
        confirmed_at: null,
      },
    ]);
    state.anthropic
      .mockResolvedValueOnce(says("Notes."))
      .mockResolvedValueOnce(says("Read.\nFOLLOW_UP: none"))
      .mockResolvedValueOnce(says("Answer."));

    const result = await ask(QUESTION).done;

    expect(result.team.constraints).toEqual(["Max 25% in any one asset"]);
    expect(String(state.anthropic.mock.calls[1][0].system.volatile)).toContain("- Max 25% in any one asset");
  });

  it("answers from Research's notes when the write-up fails, and records why", async () => {
    state.anthropic
      .mockResolvedValueOnce(says("SOL 181.4032 from Pyth."))
      .mockResolvedValueOnce(says("Read.\nFOLLOW_UP: none"))
      .mockRejectedValueOnce(new ProviderError("bad_request", "anthropic", "HTTP 400", 400));

    const result = await ask(QUESTION).done;

    expect(result.reply).toContain("The final write-up did not complete");
    expect(result.reply).toContain("SOL 181.4032 from Pyth.");
    expect(String(state.db.rows("agent_runs")[0].error)).toContain("synthesis bad_request");
  });

  it("stops at Research's failure with the single agent's sentence, and no sources", async () => {
    state.anthropic.mockRejectedValueOnce(new ProviderError("bad_request", "anthropic", "HTTP 400", 400));

    const result = await ask(QUESTION).done;

    expect(roles()).toEqual(["Research"]);
    expect(result.reply).toContain("no answer for that one");
    expect(result.sources).toEqual([]);
    expect(result.team.stages.map((stage) => stage.status)).toEqual(["failed", "skipped", "skipped"]);
  });
});

describe("a request to move capital", () => {
  it("has Execution check the server's preview, never one a member wrote", async () => {
    state.anthropic
      .mockResolvedValueOnce(says("SOL 181.4032 from Pyth."))
      .mockResolvedValueOnce(says("Within the rules.\nFOLLOW_UP: none"))
      .mockResolvedValueOnce(says("The preview is ready: it sells 6.2 SOL."))
      .mockResolvedValueOnce(says("The review card sells 6.2 SOL for USDC; you sign it in Elyra."));

    const result = await ask("swap half my SOL to USDC", {
      planning: Promise.resolve({ action: PREVIEW, id: "a1" }),
    }).done;

    expect(roles()).toEqual(["Research", "Strategy", "Execution", "the orchestrator"]);
    const execution = String(state.anthropic.mock.calls[2][0].system.volatile);
    expect(execution).toContain("built by code from live balances");
    expect(execution).toContain("Summary: Swap 6.2 SOL to USDC");
    expect(result.team.review?.notes).toContain("Execution checked the server preview: ready.");
    /* 6.2 traces to the preview, which code built. */
    expect(result.team.review?.untraced).toEqual([]);
  });

  it("says so when no preview could be built", async () => {
    state.anthropic
      .mockResolvedValueOnce(says("Notes."))
      .mockResolvedValueOnce(says("Read.\nFOLLOW_UP: none"))
      .mockResolvedValueOnce(says("No preview."))
      .mockResolvedValueOnce(says("Answer."));

    const result = await ask("swap half my SOL to USDC", { planning: Promise.resolve(null) }).done;

    expect(String(state.anthropic.mock.calls[2][0].system.volatile)).toContain("No preview could be built");
    expect(result.team.review?.notes).toContain("Execution found no server preview to check.");
  });
});

describe("what is kept", () => {
  it("claims one run for the whole question and writes one run row", async () => {
    state.anthropic
      .mockResolvedValueOnce(reads(["SOL"]))
      .mockResolvedValueOnce(says("Notes."))
      .mockResolvedValueOnce(says("Read.\nFOLLOW_UP: none"))
      .mockResolvedValueOnce(says("Answer."));

    await ask("Am I too exposed to SOL?").done;

    const runs = state.db.rows("agent_runs");
    expect(runs).toHaveLength(1);
    /* Every model call the question took. */
    expect(runs[0]).toMatchObject({ user_id: USER, surface: "web", tool_iterations: 4, error: null });
    expect(state.db.rows("messages").map((row) => row.role)).toEqual(["user", "tool", "tool", "assistant"]);
    const board = state.db.rows("messages")[2].tool_results as { team: { stages: unknown[] } };
    expect(board.team.stages).toHaveLength(3);
  });

  it("refuses past the cap before any member spends anything", async () => {
    state.db.claimAllowed = false;

    await expect(ask("Am I too exposed to SOL?").done).rejects.toThrow(UsageLimitError);
    expect(state.anthropic).not.toHaveBeenCalled();
  });
});
