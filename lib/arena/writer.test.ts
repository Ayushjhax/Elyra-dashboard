import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   The model writes around facts and is held to them: a reply with a number
   the facts do not contain, an empty or overlong reply, a refusal or a
   failure all fall back to the code's own text.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  reply: (): Promise<{ text: string; refused?: boolean; model: string }> => Promise.resolve({ text: "", model: "test-model" }),
  prompts: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agent/providers/router", () => ({
  route: async (request: { messages: { content: string }[] }) => {
    state.prompts.push(request.messages[0].content);
    return state.reply();
  },
}));

const { numbersIn, staysOnFacts, writeFromFacts } = await import("@/lib/arena/writer");

const FACTS = ["Result: $40.00 (2.0R)", "Entry $100, exit $104", "Kept 80% of the best move"];

beforeEach(() => {
  state.prompts = [];
});

describe("numbersIn", () => {
  it("normalises money and thousands, so the same number matches however it is written", () => {
    expect([...numbersIn("$1,234.50 and 1234.5 and 2.0R")]).toEqual(["1234.5", "2"]);
  });
});

describe("staysOnFacts", () => {
  it("allows only numbers that appear in the facts", () => {
    expect(staysOnFacts("It made $40 at 2R and kept 80% of the move.", FACTS)).toBe(true);
    expect(staysOnFacts("It made $40, about 3% of the account.", FACTS)).toBe(false);
    expect(staysOnFacts("A clean execution of the plan.", FACTS)).toBe(true);
  });
});

describe("writeFromFacts", () => {
  it("keeps a reply that stays on the facts, and names its model", async () => {
    state.reply = async () => ({ text: "It closed at its target for 2.0R and kept 80% of the best move.", model: "test-model" });
    expect(await writeFromFacts("Write the coaching.", FACTS, "fallback text")).toEqual({
      text: "It closed at its target for 2.0R and kept 80% of the best move.",
      model: "test-model",
    });
    expect(state.prompts[0]).toContain("- Result: $40.00 (2.0R)");
  });

  it.each([
    ["introduces a number", async () => ({ text: "It made 12% on the week.", model: "m" })],
    ["is empty", async () => ({ text: "   ", model: "m" })],
    ["runs long", async () => ({ text: "word ".repeat(200), model: "m" })],
    ["is a refusal", async () => ({ text: "No.", refused: true, model: "m" })],
    [
      "fails",
      async () => {
        throw new Error("provider down");
      },
    ],
  ])("falls back when the reply %s", async (_case, reply) => {
    state.reply = reply as typeof state.reply;
    expect(await writeFromFacts("Write the coaching.", FACTS, "fallback text")).toEqual({ text: "fallback text", model: "fallback" });
  });
});
