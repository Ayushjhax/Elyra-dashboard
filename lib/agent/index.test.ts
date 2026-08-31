import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   Part 8: forcing an Anthropic 429 and asserting the run completes on Gemini
   with fell_back recorded in agent_runs.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  anthropic: vi.fn(),
  gemini: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  serviceClient: () => state.db,
}));

/* The portfolio feeds the per-run context block and would otherwise reach
   three exchanges over the network. */
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
  anthropicProvider: () => ({
    id: "anthropic",
    model: "claude-sonnet-5",
    complete: state.anthropic,
  }),
}));

vi.mock("@/lib/agent/providers/gemini", () => ({
  geminiProvider: () => ({
    id: "gemini",
    model: "gemini-2.5-pro",
    complete: state.gemini,
  }),
}));

const { runAgent, UsageLimitError } = await import("@/lib/agent");
const { ProviderError } = await import("@/lib/agent/providers/types");
const { resetCircuitBreaker } = await import("@/lib/agent/providers/router");

const USER_A = "user-a";

function reply(provider: "anthropic" | "gemini", text: string) {
  return {
    text,
    toolCalls: [],
    provider,
    model: `${provider}-model`,
    usage: { input: 10, output: 20 },
    refused: false,
    refusalReason: null,
  };
}

beforeEach(() => {
  resetCircuitBreaker();
  state.db = new FakeSupabase();
  state.db.seed("profiles", [{ id: USER_A, privy_did: "did:privy:a" }]);
  state.db.seed("conversations", [
    { id: "conv-a", user_id: USER_A, surface: "web", telegram_chat_id: null },
  ]);
  state.anthropic.mockReset();
  state.gemini.mockReset();

  /* Gemini is only wired in when a key is present. */
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.AGENT_MAX_RUNS_PER_DAY = "100";
});

const run = () =>
  runAgent({
    userId: USER_A,
    conversationId: "conv-a",
    message: "What is SOL doing?",
    surface: "web",
  });

describe("provider fallback end to end", () => {
  it("completes on Gemini when Anthropic returns 429, and records it", async () => {
    state.anthropic.mockRejectedValue(
      new ProviderError("rate_limited", "anthropic", "HTTP 429", 429),
    );
    state.gemini.mockResolvedValue(reply("gemini", "SOL is at 184.26."));

    const result = await run();

    expect(result.reply).toBe("SOL is at 184.26.");
    expect(state.anthropic).toHaveBeenCalledOnce();
    expect(state.gemini).toHaveBeenCalledOnce();

    const runs = state.db.rows("agent_runs");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      user_id: USER_A,
      surface: "web",
      primary_provider: "anthropic",
      final_provider: "gemini",
      fell_back: true,
    });
    expect(String(runs[0].fallback_reason)).toContain("rate_limited");
  });

  it("records fell_back false when Anthropic answers", async () => {
    state.anthropic.mockResolvedValue(reply("anthropic", "SOL is at 184.26."));

    await run();

    expect(state.gemini).not.toHaveBeenCalled();
    expect(state.db.rows("agent_runs")[0]).toMatchObject({
      final_provider: "anthropic",
      fell_back: false,
      fallback_reason: null,
    });
  });

  it("does not fall back on a 400, and still writes a run row", async () => {
    state.anthropic.mockRejectedValue(
      new ProviderError("bad_request", "anthropic", "HTTP 400", 400),
    );

    const result = await run();

    expect(state.gemini).not.toHaveBeenCalled();
    /* The run is recorded as failed rather than lost. */
    const runs = state.db.rows("agent_runs");
    expect(runs).toHaveLength(1);
    expect(runs[0].error).toContain("bad_request");
    /* The operator gets a plain sentence; the kind stays in the run row. */
    expect(result.reply).toContain("no answer for that one");
  });
});

describe("persistence", () => {
  it("writes the user message and the assistant reply", async () => {
    state.anthropic.mockResolvedValue(reply("anthropic", "Answer."));

    await run();

    const messages = state.db.rows("messages");
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[0].content).toBe("What is SOL doing?");
    expect(messages[1].content).toBe("Answer.");
    expect(messages.every((m) => m.user_id === USER_A)).toBe(true);
  });

  it("writes exactly one agent_runs row per run", async () => {
    state.anthropic.mockResolvedValue(reply("anthropic", "Answer."));

    await run();
    await run();

    expect(state.db.rows("agent_runs")).toHaveLength(2);
  });
});

describe("usage limit", () => {
  it("refuses past the cap before spending anything on a model", async () => {
    state.db.claimAllowed = false;
    state.anthropic.mockResolvedValue(reply("anthropic", "Answer."));

    await expect(run()).rejects.toThrow(UsageLimitError);

    /* The point of claiming first: a refused run costs nothing. */
    expect(state.anthropic).not.toHaveBeenCalled();
    expect(state.db.rows("agent_runs")).toHaveLength(0);
  });
});

describe("refusals", () => {
  it("surfaces a refusal instead of retrying it on Gemini", async () => {
    state.anthropic.mockResolvedValue({
      ...reply("anthropic", null as unknown as string),
      refused: true,
      refusalReason: "cyber",
    });

    const result = await run();

    expect(state.gemini).not.toHaveBeenCalled();
    expect(result.reply).toContain("declined");
    expect(state.db.rows("agent_runs")[0]).toMatchObject({ fell_back: false });
  });
});
