import type { ChatStreamEvent } from "@/lib/agent/events";
import { ApiError, streamNdjson } from "~/lib/api";
import { canRetry, endConversation, retryReply, sendToAgent } from "~/lib/agentChat";
import { useAppStore } from "~/lib/store";

/* Ported from the website's lib/agentChat.test.ts, plus what the app adds:
   the stream folds into the reply bubble, a failure can be asked again,
   and nothing lands after the account that asked has gone. */

jest.mock("~/lib/api", () => {
  const actual = jest.requireActual("~/lib/api");
  return { ...actual, streamNdjson: jest.fn() };
});

const stream = streamNdjson as jest.Mock;

/** A stream that yields these events in order. */
function events(list: ChatStreamEvent[]) {
  return (async function* () {
    for (const event of list) yield event;
  })();
}

afterEach(() => {
  stream.mockReset();
  endConversation();
});

const messages = () => useAppStore.getState().messages;

describe("endConversation", () => {
  it("clears the transcript, the draft and anything staged", () => {
    const store = useAppStore.getState();
    store.appendMessage({ id: "u1", role: "user", text: "What do I hold?", at: "2026-10-17T00:00:00Z" });
    store.setComposerDraft("and my perps?");
    store.addComposerAttachments([{ id: "f1", name: "a.csv", kind: "text", mediaType: "text/csv", data: "a", size: 1, previewUrl: null }]);

    endConversation();

    const after = useAppStore.getState();
    expect(after.messages).toEqual([]);
    expect(after.composerDraft).toBe("");
    expect(after.composerAttachments).toEqual([]);
  });

  it("stops a reply still arriving, and nothing lands after", async () => {
    let signal: AbortSignal | undefined;
    stream.mockImplementation((_path: string, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return (async function* () {
        yield { type: "text", delta: "You hold" } as ChatStreamEvent;
        await new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      })();
    });

    const sending = sendToAgent("What do I hold?");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useAppStore.getState().agentPending).toBe(true);

    endConversation();
    await sending;

    const after = useAppStore.getState();
    expect(after.messages).toEqual([]);
    expect(after.agentPending).toBe(false);
    expect(after.streamingId).toBeNull();
  });
});

describe("sendToAgent", () => {
  it("streams into one reply and keeps the server's finished answer and sources", async () => {
    stream.mockReturnValue(
      events([
        { type: "text", delta: "Let me look." },
        { type: "tools", labels: ["Portfolio holdings"] },
        { type: "text", delta: "You hold 5 tokens." },
        { type: "done", reply: "You hold 5 tokens worth $673.", runId: "r1", sources: ["Your wallet"] },
      ]),
    );

    await sendToAgent("  What do I hold?  ");

    const [question, reply] = messages();
    expect(question).toMatchObject({ role: "user", text: "What do I hold?" });
    expect(reply).toMatchObject({ role: "agent", text: "You hold 5 tokens worth $673.", sources: ["Your wallet"] });
    expect(reply.failed).toBeUndefined();
    expect(stream.mock.calls[0][1].body).toEqual({ message: "What do I hold?", stream: true });
    expect(useAppStore.getState().agentPending).toBe(false);
  });

  it("sends staged files with the question and clears them from the composer", async () => {
    stream.mockReturnValue(events([{ type: "done", reply: "Read it.", runId: "r", sources: [] }]));
    useAppStore.getState().addComposerAttachments([
      { id: "f1", name: "trades.csv", kind: "text", mediaType: "text/csv", data: "a,b", size: 3, previewUrl: null },
    ]);

    await sendToAgent("Summarise this");

    expect(stream.mock.calls[0][1].body.attachments).toEqual([{ name: "trades.csv", mediaType: "text/csv", data: "a,b" }]);
    expect(messages()[0].attachments).toEqual([{ name: "trades.csv", kind: "text", previewUrl: null }]);
    expect(useAppStore.getState().composerAttachments).toEqual([]);
  });

  it("attaches a prepared action to the answer", async () => {
    const action = { id: "p1", kind: "swap", summary: "Swap 1 SOL to USDC" } as never;
    stream.mockReturnValue(
      events([
        { type: "prepared_action", action, id: "a1" },
        { type: "done", reply: "Here is the swap.", runId: "r", sources: [] },
      ]),
    );

    await sendToAgent("Swap 1 SOL to USDC");

    expect(messages()[1]).toMatchObject({ preparedAction: action, preparedActionId: "a1" });
  });

  it("asks one question at a time", async () => {
    stream.mockReturnValue(events([{ type: "done", reply: "One.", runId: "r", sources: [] }]));
    const first = sendToAgent("First");
    await sendToAgent("Second");
    await first;
    expect(messages().filter((message) => message.role === "user").map((message) => message.text)).toEqual(["First"]);
  });
});

describe("a failed reply", () => {
  it("shows the server's sentence — the usage limit, say — and can be asked again in place", async () => {
    stream.mockImplementationOnce(() => {
      throw new ApiError("You have used today's questions.", 429);
    });
    await sendToAgent("Why is SOL moving?");

    const reply = messages()[1];
    expect(reply).toMatchObject({ text: "You have used today's questions.", failed: true });
    expect(canRetry(reply.id)).toBe(true);

    stream.mockReturnValueOnce(events([{ type: "done", reply: "Funding flipped.", runId: "r", sources: ["Hyperliquid"] }]));
    await retryReply(reply.id);

    expect(messages()).toHaveLength(2);
    expect(messages()[1]).toMatchObject({ id: reply.id, text: "Funding flipped.", sources: ["Hyperliquid"] });
    expect(messages()[1].failed).toBeUndefined();
    expect(canRetry(reply.id)).toBe(false);
    expect(stream.mock.calls[1][1].body.message).toBe("Why is SOL moving?");
  });

  it("keeps a draft cut short by a dropped connection, and says so", async () => {
    stream.mockReturnValue(
      (async function* () {
        yield { type: "text", delta: "SOL is up because" } as ChatStreamEvent;
        throw new TypeError("Network request failed");
      })(),
    );
    await sendToAgent("Why is SOL moving?");
    expect(messages()[1].text).toBe("SOL is up because\n\n(The connection dropped before the answer finished.)");
    expect(messages()[1].failed).toBe(true);
  });
});
