import { describe, expect, it } from "vitest";
import { activityFor, createReplyFold, workingLine } from "@/lib/agent/reply";

describe("createReplyFold", () => {
  it("builds the draft from text and keeps the server's finished reply", () => {
    const fold = createReplyFold();
    expect(fold.event({ type: "text", delta: "SOL is " })).toEqual({ kind: "text", text: "SOL is " });
    expect(fold.event({ type: "text", delta: "up 4%." })).toEqual({ kind: "text", text: "SOL is up 4%." });
    expect(fold.event({ type: "done", reply: "SOL is up 4% today.", runId: "r1", sources: ["Pyth"] })).toEqual({
      kind: "settled",
      text: "SOL is up 4% today.",
      sources: ["Pyth"],
      failed: false,
    });
    expect(fold.finished).toBe(true);
    expect(fold.ended()).toBeNull();
  });

  it("sets aside what came before a tool call and says what is being read", () => {
    const fold = createReplyFold();
    fold.event({ type: "text", delta: "Let me check your holdings." });
    expect(fold.event({ type: "tools", labels: ["Portfolio holdings", "Funding rate"] })).toEqual({
      kind: "reading",
      activity: "portfolio holdings, funding rate",
    });
    expect(fold.event({ type: "text", delta: "You hold" })).toEqual({ kind: "text", text: "You hold" });
  });

  it("marks the server's error sentence as a failure", () => {
    const fold = createReplyFold();
    expect(fold.event({ type: "error", message: "You have used today's questions." })).toEqual({
      kind: "settled",
      text: "You have used today's questions.",
      sources: [],
      failed: true,
    });
    expect(fold.event({ type: "text", delta: "late" })).toBeNull();
  });

  it("keeps a cut-short draft and says it was cut short", () => {
    const fold = createReplyFold();
    fold.event({ type: "text", delta: "Half an answer" });
    const ended = fold.ended();
    expect(ended).toMatchObject({ kind: "settled", failed: true });
    expect(ended?.kind === "settled" && ended.text.startsWith("Half an answer\n\n(The connection closed")).toBe(true);

    expect(createReplyFold().ended()).toMatchObject({ text: "The connection closed before an answer arrived." });
    expect(createReplyFold().dropped()).toMatchObject({ text: "Could not reach the agent. Check your connection." });
  });

  it("passes a prepared action through and ignores events it does not know", () => {
    const fold = createReplyFold();
    const action = { kind: "swap", summary: "Swap 1 SOL to USDC" } as never;
    expect(fold.event({ type: "prepared_action", action, id: "a1" })).toEqual({ kind: "action", action, id: "a1" });
    expect(fold.event({ type: "something_new" } as never)).toBeNull();
  });
});

describe("working line", () => {
  it("names what is being read, or says Elyra is working", () => {
    expect(activityFor(["Portfolio holdings"])).toBe("portfolio holdings");
    expect(workingLine("portfolio holdings")).toBe("Reading portfolio holdings…");
    expect(workingLine(undefined)).toBe("Elyra is working…");
  });
});
