import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   /api/agent/chat — what the route accepts before the agent runs.

   The agent itself is mocked: these pin down the boundary — a forged or
   oversized attachment never reaches runAgent, and files alone are a valid
   question.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({ runAgent: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => ({ userId: "u1", privyDid: "did", walletAddress: null, solanaAddress: null, profileStore: "ready" }),
  hasProfile: () => true,
  profileUnavailable: () => new Response(null, { status: 503 }),
}));
vi.mock("@/lib/agent", () => ({
  UsageLimitError: class extends Error {},
  ensureConversation: async () => "c1",
  runAgent: state.runAgent,
}));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString("base64");
const post = (body: unknown) => new Request("http://test/api/agent/chat", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  state.runAgent.mockReset();
  state.runAgent.mockResolvedValue({ reply: "ok", runId: "r1", sources: [] });
});

describe("POST /api/agent/chat with attachments", () => {
  it("accepts files alone and passes them to the agent, typed", async () => {
    const { POST } = await import("@/app/api/agent/chat/route");
    const response = await POST(post({ message: "", attachments: [{ name: "chart.png", mediaType: "image/png", data: PNG }] }));
    expect(response.status).toBe(200);
    expect(state.runAgent.mock.calls[0][0].attachments).toEqual([
      { name: "chart.png", mediaType: "image/png", data: PNG, kind: "image" },
    ]);
  });

  it("stops a forged file before the agent runs", async () => {
    const { POST } = await import("@/app/api/agent/chat/route");
    const response = await POST(
      post({ message: "look", attachments: [{ name: "x.pdf", mediaType: "application/pdf", data: PNG }] }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/not the PDF it claims/);
    expect(state.runAgent).not.toHaveBeenCalled();
  });

  it("still refuses a message with neither text nor files", async () => {
    const { POST } = await import("@/app/api/agent/chat/route");
    expect((await POST(post({ message: "  " }))).status).toBe(400);
  });
});
